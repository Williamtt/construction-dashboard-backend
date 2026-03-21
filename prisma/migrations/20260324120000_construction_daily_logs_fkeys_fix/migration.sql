-- 補齊 20260323120000 因誤用 "users"／"projects" 導致 FK 未建立之環境（本專案 User／Project 表名為 PascalCase）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'construction_daily_logs_project_id_fkey'
  ) THEN
    ALTER TABLE "construction_daily_logs"
      ADD CONSTRAINT "construction_daily_logs_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'construction_daily_logs_created_by_id_fkey'
  ) THEN
    ALTER TABLE "construction_daily_logs"
      ADD CONSTRAINT "construction_daily_logs_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
