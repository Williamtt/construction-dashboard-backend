-- AlterTable
ALTER TABLE "progress_actuals" ADD COLUMN "cumulative_progress_percent" DECIMAL(10,3);

-- 既有列：依本期實際加總回填累計（與舊行為一致），之後改由使用者手動維護
UPDATE "progress_actuals" pa
SET "cumulative_progress_percent" = sub.cum
FROM (
  SELECT
    id,
    SUM(COALESCE("period_progress_percent", 0)) OVER (
      PARTITION BY "project_id"
      ORDER BY "period_date" ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cum
  FROM "progress_actuals"
  WHERE "deleted_at" IS NULL
) sub
WHERE pa.id = sub.id;
