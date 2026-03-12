-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "benefits" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "contractor" TEXT,
ADD COLUMN     "design_unit" TEXT,
ADD COLUMN     "planned_end_date" TIMESTAMP(3),
ADD COLUMN     "project_staff" TEXT,
ADD COLUMN     "site_manager" TEXT,
ADD COLUMN     "start_date" TIMESTAMP(3),
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "supervision_unit" TEXT;
