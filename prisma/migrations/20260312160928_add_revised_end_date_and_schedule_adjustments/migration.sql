-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "revised_end_date" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "project_schedule_adjustments" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "apply_date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "apply_days" INTEGER NOT NULL,
    "approved_days" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_schedule_adjustments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "project_schedule_adjustments" ADD CONSTRAINT "project_schedule_adjustments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
