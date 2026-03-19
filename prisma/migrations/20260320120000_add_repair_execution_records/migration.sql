-- CreateTable
CREATE TABLE "repair_execution_records" (
    "id" TEXT NOT NULL,
    "repair_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repair_execution_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repair_execution_records_repair_id_idx" ON "repair_execution_records"("repair_id");

-- AddForeignKey
ALTER TABLE "repair_execution_records" ADD CONSTRAINT "repair_execution_records_repair_id_fkey" FOREIGN KEY ("repair_id") REFERENCES "repair_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_execution_records" ADD CONSTRAINT "repair_execution_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
