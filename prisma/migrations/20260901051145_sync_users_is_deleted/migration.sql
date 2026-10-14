-- Syncs migration history with a column that already existed in the database
-- (added outside of Prisma Migrate at some point) but was missing from the schema.
-- IF NOT EXISTS makes this safe to apply regardless of the column's current state.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN DEFAULT false;
