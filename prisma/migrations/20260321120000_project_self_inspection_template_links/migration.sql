-- CreateTable
CREATE TABLE "project_self_inspection_template_links" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_self_inspection_template_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_self_inspection_template_links_project_id_template_id_key" ON "project_self_inspection_template_links"("project_id", "template_id");

-- CreateIndex
CREATE INDEX "project_self_inspection_template_links_project_id_idx" ON "project_self_inspection_template_links"("project_id");

-- CreateIndex
CREATE INDEX "project_self_inspection_template_links_template_id_idx" ON "project_self_inspection_template_links"("template_id");

-- AddForeignKey
ALTER TABLE "project_self_inspection_template_links" ADD CONSTRAINT "project_self_inspection_template_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_self_inspection_template_links" ADD CONSTRAINT "project_self_inspection_template_links_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "self_inspection_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 既有查驗紀錄：自動補上「已匯入」關聯（避免升級後無法開啟舊紀錄）
INSERT INTO "project_self_inspection_template_links" ("id", "project_id", "template_id", "created_at")
SELECT
    'migpsi_' || substr(md5(r.project_id || ':' || r.template_id), 1, 20),
    r.project_id,
    r.template_id,
    MIN(r.created_at)
FROM "self_inspection_records" r
GROUP BY r.project_id, r.template_id
ON CONFLICT ("project_id", "template_id") DO NOTHING;
