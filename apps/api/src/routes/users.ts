import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { users } from "@two/shared/schema";
import { authMiddleware, type AuthVariables } from "../middleware/auth";
import type { Env } from "../index";

const usersRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

usersRoute.use("*", authMiddleware);

const PublicKeySchema = z.object({
  publicKey: z.string().min(1),
});

// PUT /api/users/:id/public-key — register caller's public key
usersRoute.put(
  "/:id/public-key",
  zValidator("json", PublicKeySchema),
  async (c) => {
    const targetId = c.req.param("id");
    const callerId = c.get("userId");

    if (targetId !== callerId) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const { publicKey } = c.req.valid("json");
    const db = drizzle(c.env.DB);

    const updated = await db
      .update(users)
      .set({ publicKey })
      .where(eq(users.id, callerId))
      .returning({ id: users.id });

    if (updated.length === 0) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ ok: true });
  },
);

// GET /api/users/:id/public-key — fetch another user's public key for ECDH
usersRoute.get("/:id/public-key", async (c) => {
  const targetId = c.req.param("id");
  const db = drizzle(c.env.DB);

  const user = await db
    .select({ publicKey: users.publicKey })
    .from(users)
    .where(eq(users.id, targetId))
    .get();

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  if (!user.publicKey) {
    return c.json({ error: "Public key not registered" }, 404);
  }

  return c.json({ publicKey: user.publicKey });
});

export default usersRoute;
