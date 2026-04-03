-- AlterTable: add contract amount fields to Project (idempotent)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "original_contract_amount" DECIMAL(18,2);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "design_fee" DECIMAL(18,2);
