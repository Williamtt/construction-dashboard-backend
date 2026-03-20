-- Soft delete: deleted_at + deleted_by_id；部分唯一索引允許「已刪」與「現用」並存（email、slug、專案成員、攝影機 token、自主查驗匯入連結）

-- Tenant
ALTER TABLE "Tenant" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;
DROP INDEX IF EXISTS "Tenant_slug_key";
CREATE UNIQUE INDEX "Tenant_slug_active_key" ON "Tenant"("slug") WHERE "slug" IS NOT NULL AND "deleted_at" IS NULL;

-- User（email：僅未刪除者唯一）
ALTER TABLE "User" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;
DROP INDEX IF EXISTS "User_email_key";
CREATE UNIQUE INDEX "User_email_active_key" ON "User"("email") WHERE "deleted_at" IS NULL;

-- Project
ALTER TABLE "Project" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- project_members（同一專案+使用者僅一筆「未刪除」成員）
ALTER TABLE "project_members" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;
DROP INDEX IF EXISTS "project_members_project_id_user_id_key";
CREATE UNIQUE INDEX "project_members_project_user_active_key" ON "project_members"("project_id", "user_id") WHERE "deleted_at" IS NULL;

-- form_templates
ALTER TABLE "form_templates" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- self_inspection_templates
ALTER TABLE "self_inspection_templates" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- self_inspection_template_blocks
ALTER TABLE "self_inspection_template_blocks" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- self_inspection_template_block_items
ALTER TABLE "self_inspection_template_block_items" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- project_self_inspection_template_links
ALTER TABLE "project_self_inspection_template_links" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;
DROP INDEX IF EXISTS "project_self_inspection_template_links_project_id_template_id_key";
CREATE UNIQUE INDEX "project_self_inspection_template_links_active_key" ON "project_self_inspection_template_links"("project_id", "template_id") WHERE "deleted_at" IS NULL;

-- self_inspection_records
ALTER TABLE "self_inspection_records" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- attachments
ALTER TABLE "attachments" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- drawing_nodes
ALTER TABLE "drawing_nodes" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- wbs_nodes
ALTER TABLE "wbs_nodes" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- project_issue_risks
ALTER TABLE "project_issue_risks" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- project_resources
ALTER TABLE "project_resources" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- PhotoAlbum（Prisma 預設表名）
ALTER TABLE "PhotoAlbum" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- project_schedule_adjustments
ALTER TABLE "project_schedule_adjustments" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- cameras（stream_token：僅未刪除者唯一）
ALTER TABLE "cameras" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;
DROP INDEX IF EXISTS "cameras_stream_token_key";
CREATE UNIQUE INDEX "cameras_stream_token_active_key" ON "cameras"("stream_token") WHERE "deleted_at" IS NULL;

-- defect_improvements
ALTER TABLE "defect_improvements" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- defect_execution_records
ALTER TABLE "defect_execution_records" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- repair_requests
ALTER TABLE "repair_requests" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- repair_execution_records
ALTER TABLE "repair_execution_records" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- platform_announcements
ALTER TABLE "platform_announcements" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;
