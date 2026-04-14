import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { sign } from "hono/jwt";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { users } from "@two/shared/schema";
import { LoginSchema } from "@two/shared/validators";
import type { Env } from "../index";
import { authMiddleware, type AuthVariables } from "../middleware/auth";

const auth = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// POST /auth/login — look up user by phone, return JWT
auth.post("/login", zValidator("json", LoginSchema), async (c) => {
  const { phone } = c.req.valid("json");
  const db = drizzle(c.env.DB);

  const user = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .get();

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    phone: user.phone,
    iat: now,
    exp: now + 7 * 24 * 60 * 60, // 7 days
  };

  const token = await sign(payload, c.env.JWT_SECRET);

  return c.json({
    token,
    user: {
      id: user.id,
      phone: user.phone,
      displayName: user.displayName,
    },
  });
});

// POST /auth/logout — add token to KV blocklist
auth.post("/logout", authMiddleware, async (c) => {
  const authHeader = c.req.header("Authorization")!;
  const token = authHeader.slice(7);

  // Expire the blocklist entry after 7 days (matching JWT max lifetime)
  await c.env.SESSIONS.put(`blocklist:${token}`, "1", {
    expirationTtl: 7 * 24 * 60 * 60,
  });

  return c.json({ ok: true });
});

export default auth;
