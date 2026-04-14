-- Migration: initial schema
-- Applied via: wrangler d1 migrations apply two-db

CREATE TABLE IF NOT EXISTS `users` (
  `id`           TEXT    PRIMARY KEY NOT NULL,
  `phone`        TEXT    NOT NULL UNIQUE,
  `display_name` TEXT    NOT NULL,
  `public_key`   TEXT,
  `created_at`   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS `conversations` (
  `id`               TEXT    PRIMARY KEY NOT NULL,
  `participant_a_id` TEXT    NOT NULL REFERENCES `users`(`id`),
  `participant_b_id` TEXT    NOT NULL REFERENCES `users`(`id`),
  `created_at`       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS `messages` (
  `id`                TEXT    PRIMARY KEY NOT NULL,
  `conversation_id`   TEXT    NOT NULL REFERENCES `conversations`(`id`),
  `sender_id`         TEXT    NOT NULL REFERENCES `users`(`id`),
  `type`              TEXT    NOT NULL CHECK(`type` IN ('text', 'image', 'video', 'file')),
  `encrypted_content` TEXT    NOT NULL,
  `media_key`         TEXT,
  `iv`                TEXT    NOT NULL,
  `created_at`        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_conversations_participant_a` ON `conversations`(`participant_a_id`);
CREATE INDEX IF NOT EXISTS `idx_conversations_participant_b` ON `conversations`(`participant_b_id`);
CREATE INDEX IF NOT EXISTS `idx_messages_conversation`       ON `messages`(`conversation_id`, `created_at`);
CREATE INDEX IF NOT EXISTS `idx_messages_sender`             ON `messages`(`sender_id`);
