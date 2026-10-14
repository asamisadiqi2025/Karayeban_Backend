
-- CreateEnum
CREATE TYPE "BackupKind" AS ENUM ('MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'RUNNING', 'READY', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "markets" ADD COLUMN     "auto_backup_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "market_backups" (
    "id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "kind" "BackupKind" NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by_id" UUID,
    "file_key" VARCHAR(255),
    "size_bytes" INTEGER,
    "sha256" VARCHAR(64),
    "schema_version" VARCHAR(100),
    "row_counts" JSONB,
    "total_rows" INTEGER,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "market_backups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "market_backups_market_id_created_at_idx" ON "market_backups"("market_id", "created_at");

-- CreateIndex
CREATE INDEX "market_backups_status_idx" ON "market_backups"("status");

-- AddForeignKey
ALTER TABLE "market_backups" ADD CONSTRAINT "market_backups_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_backups" ADD CONSTRAINT "market_backups_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

