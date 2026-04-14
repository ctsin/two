import { createMiddleware } from "hono/factory";
import { verify } from "hono/jwt";
import type { Env } from "../index";

export type AuthVariables = {
  userId: string;
  userPhone: string;
};

export const authMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  let payload: { sub: string; phone: string; exp: number };
  try {
    payload = (await verify(
      token,
      c.env.JWT_SECRET,
      "HS256",
    )) as typeof payload;
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Check KV blocklist for logged-out tokens
  const blocked = await c.env.SESSIONS.get(`blocklist:${token}`);
  if (blocked) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("userId", payload.sub);
  c.set("userPhone", payload.phone);
  await next();
});
