-- CreateTable
CREATE TABLE "self_inspection_records" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "filled_payload" JSONB NOT NULL,
    "filled_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "self_inspection_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "self_inspection_records_project_id_idx" ON "self_inspection_records"("project_id");

-- CreateIndex
CREATE INDEX "self_inspection_records_project_id_template_id_idx" ON "self_inspection_records"("project_id", "template_id");

-- CreateIndex
CREATE INDEX "self_inspection_records_template_id_idx" ON "self_inspection_records"("template_id");

-- AddForeignKey
ALTER TABLE "self_inspection_records" ADD CONSTRAINT "self_inspection_records_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_inspection_records" ADD CONSTRAINT "self_inspection_records_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "self_inspection_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_inspection_records" ADD CONSTRAINT "self_inspection_records_filled_by_id_fkey" FOREIGN KEY ("filled_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
