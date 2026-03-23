-- 允許軟刪後再以相同 version 建立新列（與其他表 partial unique 策略一致）
DROP INDEX IF EXISTS "progress_plans_project_id_version_key";

CREATE UNIQUE INDEX "progress_plans_project_id_version_active_key"
  ON "progress_plans" ("project_id", "version")
  WHERE "deleted_at" IS NULL;
