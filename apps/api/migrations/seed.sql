-- Seed: initial users for development
-- Applied via: wrangler d1 execute two-db --file=migrations/seed.sql
-- Or for local:  wrangler d1 execute two-db --local --file=migrations/seed.sql
--
-- IDs are ULIDs generated manually. Replace phone numbers as needed.
-- Timestamps are Unix epoch seconds.

INSERT OR IGNORE INTO `users` (`id`, `phone`, `display_name`, `created_at`) VALUES
  ('01J0000000000000000000001', '+15550001111', 'Alice', unixepoch()),
  ('01J0000000000000000000002', '+15550002222', 'Bob',   unixepoch());
