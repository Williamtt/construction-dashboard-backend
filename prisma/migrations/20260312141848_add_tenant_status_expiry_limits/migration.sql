-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "file_size_limit_mb" INTEGER,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "storage_quota_mb" INTEGER,
ADD COLUMN     "user_limit" INTEGER;
