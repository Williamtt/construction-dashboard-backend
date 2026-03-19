-- AlterTable
ALTER TABLE "self_inspection_templates" ADD COLUMN "header_config" JSONB;

-- CreateTable
CREATE TABLE "self_inspection_template_block_items" (
    "id" TEXT NOT NULL,
    "block_id" TEXT NOT NULL,
    "category_label" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "standard_text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "self_inspection_template_block_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "self_inspection_template_block_items_block_id_idx" ON "self_inspection_template_block_items"("block_id");

-- AddForeignKey
ALTER TABLE "self_inspection_template_block_items" ADD CONSTRAINT "self_inspection_template_block_items_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "self_inspection_template_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
