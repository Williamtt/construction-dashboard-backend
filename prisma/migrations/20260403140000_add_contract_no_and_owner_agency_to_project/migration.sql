-- AlterTable: add contractNo and ownerAgency to Project
ALTER TABLE "Project" ADD COLUMN "contract_no" TEXT;
ALTER TABLE "Project" ADD COLUMN "owner_agency" TEXT;
