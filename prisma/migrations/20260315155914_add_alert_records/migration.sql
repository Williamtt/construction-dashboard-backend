-- CreateTable
CREATE TABLE "alert_records" (
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

    CONSTRAINT "alert_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_records_project_id_idx" ON "alert_records"("project_id");

-- CreateIndex
CREATE INDEX "alert_records_created_at_idx" ON "alert_records"("created_at");

-- CreateIndex
CREATE INDEX "alert_records_alert_type_start_time_idx" ON "alert_records"("alert_type", "start_time");

-- AddForeignKey
ALTER TABLE "alert_records" ADD CONSTRAINT "alert_records_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
