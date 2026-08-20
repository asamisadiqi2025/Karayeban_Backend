-- AlterTable: add username as nullable first (safe for existing rows)
ALTER TABLE "users" ADD COLUMN "username" VARCHAR(100);

-- Backfill from the local part of email for any existing rows
UPDATE "users" SET "username" = split_part("email", '@', 1) WHERE "username" IS NULL;

-- Resolve any collisions from backfill by appending part of the row id
UPDATE "users" u
SET "username" = u."username" || '_' || substr(u."id"::text, 1, 8)
WHERE EXISTS (
  SELECT 1 FROM "users" u2
  WHERE u2."username" = u."username" AND u2."id" <> u."id"
);

-- Now enforce NOT NULL and uniqueness
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
