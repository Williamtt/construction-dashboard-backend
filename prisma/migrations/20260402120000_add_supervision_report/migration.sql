-- CreateTable
CREATE TABLE "supervision_reports" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "report_no" TEXT,
    "weather_am" TEXT,
    "weather_pm" TEXT,
    "report_date" DATE NOT NULL,
    "project_name" TEXT NOT NULL,
    "contract_duration" INTEGER,
    "start_date" DATE,
    "planned_completion_date" DATE,
    "actual_completion_date" DATE,
    "contract_change_count" INTEGER,
    "extension_days" INTEGER,
    "original_contract_amount" DECIMAL(18,2),
    "design_fee" DECIMAL(18,2),
    "contract_total" DECIMAL(18,2),
    "construction_planned_progress" DECIMAL(6,2),
    "construction_actual_progress" DECIMAL(6,2),
    "overall_planned_progress" DECIMAL(6,2),
    "overall_actual_progress" DECIMAL(6,2),
    "inspection_notes" TEXT NOT NULL DEFAULT '',
    "material_quality_notes" TEXT NOT NULL DEFAULT '',
    "pre_work_check_completed" BOOLEAN NOT NULL DEFAULT false,
    "safety_notes" TEXT NOT NULL DEFAULT '',
    "other_supervision_notes" TEXT NOT NULL DEFAULT '',
    "supervisor_signed" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "supervision_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervision_report_inspections" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "supervision_report_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervision_report_material_checks" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reference_no" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "supervision_report_material_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervision_report_work_items" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "pcces_item_id" TEXT,
    "work_item_name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "contract_qty" DECIMAL(18,4) NOT NULL,
    "daily_completed_qty" DECIMAL(18,4) NOT NULL,
    "accumulated_completed_qty" DECIMAL(18,4) NOT NULL,
    "remark" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "supervision_report_work_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supervision_reports_project_id_idx" ON "supervision_reports"("project_id");

-- CreateIndex
CREATE INDEX "supervision_reports_project_id_report_date_idx" ON "supervision_reports"("project_id", "report_date" DESC);

-- CreateIndex
CREATE INDEX "supervision_report_inspections_report_id_idx" ON "supervision_report_inspections"("report_id");

-- CreateIndex
CREATE INDEX "supervision_report_material_checks_report_id_idx" ON "supervision_report_material_checks"("report_id");

-- CreateIndex
CREATE INDEX "supervision_report_work_items_report_id_idx" ON "supervision_report_work_items"("report_id");

-- CreateIndex
CREATE INDEX "supervision_report_work_items_pcces_item_id_idx" ON "supervision_report_work_items"("pcces_item_id");

-- AddForeignKey
ALTER TABLE "supervision_reports" ADD CONSTRAINT "supervision_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervision_reports" ADD CONSTRAINT "supervision_reports_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervision_report_inspections" ADD CONSTRAINT "supervision_report_inspections_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "supervision_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervision_report_material_checks" ADD CONSTRAINT "supervision_report_material_checks_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "supervision_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervision_report_work_items" ADD CONSTRAINT "supervision_report_work_items_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "supervision_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervision_report_work_items" ADD CONSTRAINT "supervision_report_work_items_pcces_item_id_fkey" FOREIGN KEY ("pcces_item_id") REFERENCES "pcces_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
