import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  displayName: text("display_name").notNull(),
  publicKey: text("public_key"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  participantAId: text("participant_a_id")
    .notNull()
    .references(() => users.id),
  participantBId: text("participant_b_id")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  senderId: text("sender_id")
    .notNull()
    .references(() => users.id),
  type: text("type", { enum: ["text", "image", "video", "file"] }).notNull(),
  encryptedContent: text("encrypted_content").notNull(),
  mediaKey: text("media_key"),
  iv: text("iv").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
