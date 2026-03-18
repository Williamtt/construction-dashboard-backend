-- AlterTable
ALTER TABLE "wbs_nodes" ADD COLUMN     "is_project_root" BOOLEAN NOT NULL DEFAULT false;

-- 每專案一筆專案根（名稱=專案名，供統計與階層包絡）
INSERT INTO "wbs_nodes" ("id","project_id","parent_id","code","name","sort_order","is_project_root","created_at","updated_at")
SELECT
  'wbs-root-' || p."id",
  p."id",
  NULL,
  '1',
  p."name",
  0,
  true,
  NOW(),
  NOW()
FROM "Project" p
WHERE NOT EXISTS (
  SELECT 1 FROM "wbs_nodes" w WHERE w."project_id" = p."id" AND w."is_project_root" = true
);

-- 原頂層 WBS 改掛在專案根下
UPDATE "wbs_nodes" AS c
SET "parent_id" = 'wbs-root-' || c."project_id"
WHERE c."parent_id" IS NULL
  AND c."is_project_root" = false;
