-- AlterTable alert_records: add last_seen_at (required for 30-min TTL)
ALTER TABLE "alert_records" ADD COLUMN "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Drop old index (replaced by unique + lastSeenAt index)
DROP INDEX IF EXISTS "alert_records_alert_type_start_time_idx";

-- CreateIndex: unique (alert_type, project_id) for upsert
CREATE UNIQUE INDEX "alert_records_alert_type_project_id_key" ON "alert_records"("alert_type", "project_id");

-- CreateIndex: for current query (lastSeenAt > now - 30min)
CREATE INDEX "alert_records_last_seen_at_idx" ON "alert_records"("last_seen_at");

-- CreateTable alert_history_records (append-only for 歷史警報)
CREATE TABLE "alert_history_records" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "alert_type" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'cwa',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_history_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "alert_history_records_project_id_idx" ON "alert_history_records"("project_id");
CREATE INDEX "alert_history_records_created_at_idx" ON "alert_history_records"("created_at");
CREATE INDEX "alert_history_records_alert_type_idx" ON "alert_history_records"("alert_type");
