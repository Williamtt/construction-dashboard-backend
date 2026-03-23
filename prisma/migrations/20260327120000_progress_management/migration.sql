-- CreateTable
CREATE TABLE "progress_plans" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "reason" TEXT,
    "effective_from_date" DATE NOT NULL,
    "effective_from_idx" INTEGER NOT NULL,
    "extra_weeks" INTEGER NOT NULL DEFAULT 0,
    "is_baseline" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "progress_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_plan_entries" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "period_date" DATE NOT NULL,
    "period_index" INTEGER NOT NULL,
    "period_progress" DECIMAL(10,3),
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "is_extended" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "progress_plan_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_actuals" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "period_date" DATE NOT NULL,
    "period_index" INTEGER NOT NULL,
    "period_progress_percent" DECIMAL(10,3),
    "source" TEXT NOT NULL DEFAULT 'manual',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "progress_actuals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "progress_plans_project_id_version_key" ON "progress_plans"("project_id", "version");

-- CreateIndex
CREATE INDEX "progress_plans_project_id_idx" ON "progress_plans"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "progress_plan_entries_plan_id_period_date_key" ON "progress_plan_entries"("plan_id", "period_date");

-- CreateIndex
CREATE INDEX "progress_plan_entries_plan_id_idx" ON "progress_plan_entries"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "progress_actuals_project_id_period_date_key" ON "progress_actuals"("project_id", "period_date");

-- CreateIndex
CREATE INDEX "progress_actuals_project_id_idx" ON "progress_actuals"("project_id");

-- AddForeignKey
ALTER TABLE "progress_plans" ADD CONSTRAINT "progress_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_plan_entries" ADD CONSTRAINT "progress_plan_entries_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "progress_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_actuals" ADD CONSTRAINT "progress_actuals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 新模組 construction.progress：自 construction.diary 複製租戶範本與專案成員權限
INSERT INTO "tenant_permission_templates" (
  "id",
  "tenant_id",
  "user_id",
  "module",
  "can_create",
  "can_read",
  "can_update",
  "can_delete",
  "created_at",
  "updated_at"
)
SELECT
  md5(random()::text || clock_timestamp()::text || t.tenant_id || t.user_id || 'construction.progress'),
  t.tenant_id,
  t.user_id,
  'construction.progress',
  t.can_create,
  t.can_read,
  t.can_update,
  t.can_delete,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenant_permission_templates" t
WHERE t.module = 'construction.diary'
  AND NOT EXISTS (
    SELECT 1
    FROM "tenant_permission_templates" t2
    WHERE t2.tenant_id = t.tenant_id
      AND t2.user_id = t.user_id
      AND t2.module = 'construction.progress'
  );

INSERT INTO "project_member_permissions" (
  "id",
  "project_id",
  "user_id",
  "module",
  "can_create",
  "can_read",
  "can_update",
  "can_delete",
  "created_at",
  "updated_at"
)
SELECT
  md5(random()::text || clock_timestamp()::text || p.project_id || p.user_id || 'construction.progress'),
  p.project_id,
  p.user_id,
  'construction.progress',
  p.can_create,
  p.can_read,
  p.can_update,
  p.can_delete,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "project_member_permissions" p
WHERE p.module = 'construction.diary'
  AND NOT EXISTS (
    SELECT 1
    FROM "project_member_permissions" p2
    WHERE p2.project_id = p.project_id
      AND p2.user_id = p.user_id
      AND p2.module = 'construction.progress'
  );
