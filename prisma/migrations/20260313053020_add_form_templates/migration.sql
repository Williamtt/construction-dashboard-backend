-- CreateTable
CREATE TABLE "form_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "project_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_hash" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_templates_tenant_id_idx" ON "form_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "form_templates_project_id_idx" ON "form_templates"("project_id");

-- AddForeignKey
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
