-- AlterTable
ALTER TABLE "pcces_imports" ADD COLUMN "approved_at" TIMESTAMP(3),
ADD COLUMN "approved_by_id" TEXT;

-- CreateIndex
CREATE INDEX "pcces_imports_project_id_approved_at_idx" ON "pcces_imports"("project_id", "approved_at");

-- AddForeignKey
ALTER TABLE "pcces_imports" ADD CONSTRAINT "pcces_imports_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "construction_daily_log_work_items" ADD COLUMN "pcces_item_id" TEXT;

-- CreateIndex
CREATE INDEX "construction_daily_log_work_items_pcces_item_id_idx" ON "construction_daily_log_work_items"("pcces_item_id");

-- AddForeignKey
ALTER TABLE "construction_daily_log_work_items" ADD CONSTRAINT "construction_daily_log_work_items_pcces_item_id_fkey" FOREIGN KEY ("pcces_item_id") REFERENCES "pcces_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
