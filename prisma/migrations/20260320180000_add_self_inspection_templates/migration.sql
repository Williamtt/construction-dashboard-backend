-- CreateTable
CREATE TABLE "self_inspection_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "self_inspection_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "self_inspection_template_blocks" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "self_inspection_template_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "self_inspection_templates_tenant_id_idx" ON "self_inspection_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "self_inspection_templates_tenant_id_status_idx" ON "self_inspection_templates"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "self_inspection_template_blocks_template_id_idx" ON "self_inspection_template_blocks"("template_id");

-- AddForeignKey
ALTER TABLE "self_inspection_templates" ADD CONSTRAINT "self_inspection_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_inspection_template_blocks" ADD CONSTRAINT "self_inspection_template_blocks_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "self_inspection_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
