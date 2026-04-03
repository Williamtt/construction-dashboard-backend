-- AlterTable: add contractNo and ownerAgency to projects
ALTER TABLE "projects" ADD COLUMN "contract_no" TEXT;
ALTER TABLE "projects" ADD COLUMN "owner_agency" TEXT;
