import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, or, and, lt, desc } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { conversations, messages, users } from "@two/shared/schema";
import { authMiddleware, type AuthVariables } from "../middleware/auth";
import type { Env } from "../index";

const conversationsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

conversationsRoute.use("*", authMiddleware);

// POST /api/conversations — create or get existing conversation with another user
const CreateConversationSchema = z.object({ otherUserId: z.string().uuid() });

conversationsRoute.post(
  "/",
  zValidator("json", CreateConversationSchema),
  async (c) => {
    const userId = c.get("userId");
    const { otherUserId } = c.req.valid("json");

    if (userId === otherUserId) {
      return c.json(
        { error: "Cannot start a conversation with yourself" },
        400,
      );
    }

    const db = drizzle(c.env.DB);

    // Verify the other user exists
    const otherUser = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, otherUserId))
      .get();

    if (!otherUser) {
      return c.json({ error: "User not found" }, 404);
    }

    // Check if a conversation already exists between the two users
    const existing = await db
      .select({
        id: conversations.id,
        participantAId: conversations.participantAId,
        participantBId: conversations.participantBId,
        createdAt: conversations.createdAt,
        otherUserId: users.id,
        otherDisplayName: users.displayName,
        otherPhone: users.phone,
      })
      .from(conversations)
      .innerJoin(
        users,
        or(
          and(
            eq(conversations.participantAId, userId),
            eq(users.id, conversations.participantBId),
          ),
          and(
            eq(conversations.participantBId, userId),
            eq(users.id, conversations.participantAId),
          ),
        ),
      )
      .where(
        or(
          and(
            eq(conversations.participantAId, userId),
            eq(conversations.participantBId, otherUserId),
          ),
          and(
            eq(conversations.participantAId, otherUserId),
            eq(conversations.participantBId, userId),
          ),
        ),
      )
      .get();

    if (existing) {
      return c.json({ conversation: existing });
    }

    // Create new conversation
    const id = crypto.randomUUID();
    await db.insert(conversations).values({
      id,
      participantAId: userId,
      participantBId: otherUserId,
      createdAt: new Date(),
    });

    const conversation = {
      id,
      participantAId: userId,
      participantBId: otherUserId,
      createdAt: new Date().toISOString(),
      otherUserId: otherUser.id,
      otherDisplayName: otherUser.displayName,
      otherPhone: otherUser.phone,
    };

    return c.json({ conversation }, 201);
  },
);

// GET /api/conversations — list all conversations for the authenticated user
conversationsRoute.get("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB);

  const rows = await db
    .select({
      id: conversations.id,
      participantAId: conversations.participantAId,
      participantBId: conversations.participantBId,
      createdAt: conversations.createdAt,
      otherUserId: users.id,
      otherDisplayName: users.displayName,
      otherPhone: users.phone,
    })
    .from(conversations)
    .innerJoin(
      users,
      or(
        and(
          eq(conversations.participantAId, userId),
          eq(users.id, conversations.participantBId),
        ),
        and(
          eq(conversations.participantBId, userId),
          eq(users.id, conversations.participantAId),
        ),
      ),
    )
    .where(
      or(
        eq(conversations.participantAId, userId),
        eq(conversations.participantBId, userId),
      ),
    )
    .all();

  return c.json({ conversations: rows });
});

// GET /api/conversations/:id/messages?cursor=<ms timestamp>&limit=<n>
// Returns up to `limit` messages (default 50, max 100) in ascending order.
// If `cursor` is provided, returns messages with created_at < cursor (for backwards pagination).
conversationsRoute.get("/:id/messages", async (c) => {
  const conversationId = c.req.param("id");
  const userId = c.get("userId");
  const cursorParam = c.req.query("cursor");
  const limitParam = c.req.query("limit");
  const limit = Math.min(
    Math.max(1, parseInt(limitParam ?? "50", 10) || 50),
    100,
  );

  const db = drizzle(c.env.DB);

  // Verify the user is a participant in this conversation
  const conversation = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        or(
          eq(conversations.participantAId, userId),
          eq(conversations.participantBId, userId),
        ),
      ),
    )
    .get();

  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const whereClause = cursorParam
    ? and(
        eq(messages.conversationId, conversationId),
        lt(messages.createdAt, new Date(parseInt(cursorParam, 10))),
      )
    : eq(messages.conversationId, conversationId);

  const rows = await db
    .select()
    .from(messages)
    .where(whereClause)
    .orderBy(desc(messages.createdAt))
    .limit(limit)
    .all();

  // Return in ascending (chronological) order for the client
  rows.reverse();

  return c.json({ messages: rows });
});

// GET /api/conversations/:id/ws — upgrade to WebSocket, proxy to ChatRoom DO
conversationsRoute.get("/:id/ws", async (c) => {
  const conversationId = c.req.param("id");
  const userId = c.get("userId");

  const db = drizzle(c.env.DB);

  // Verify the user is a participant before handing off to the DO
  const conversation = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        or(
          eq(conversations.participantAId, userId),
          eq(conversations.participantBId, userId),
        ),
      ),
    )
    .get();

  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  // Route to the per-conversation DO instance
  const doId = c.env.CHAT_ROOM.idFromName(conversationId);
  const stub = c.env.CHAT_ROOM.get(doId);

  // Inject authenticated userId and conversationId so the DO can trust them
  const url = new URL(c.req.url);
  url.searchParams.set("userId", userId);
  url.searchParams.set("conversationId", conversationId);

  return stub.fetch(new Request(url.toString(), c.req.raw));
});

export default conversationsRoute;
