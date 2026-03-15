-- DropIndex
DROP INDEX "alert_records_created_at_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatar_storage_key" TEXT;

-- AlterTable
ALTER TABLE "alert_records" ALTER COLUMN "last_seen_at" DROP DEFAULT;
