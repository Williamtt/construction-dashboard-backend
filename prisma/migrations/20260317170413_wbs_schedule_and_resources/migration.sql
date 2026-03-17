-- AlterTable
ALTER TABLE "wbs_nodes" ADD COLUMN     "duration_days" INTEGER,
ADD COLUMN     "start_date" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "wbs_node_resources" (
    "wbs_node_id" TEXT NOT NULL,
    "project_resource_id" TEXT NOT NULL,

    CONSTRAINT "wbs_node_resources_pkey" PRIMARY KEY ("wbs_node_id","project_resource_id")
);

-- CreateIndex
CREATE INDEX "wbs_node_resources_project_resource_id_idx" ON "wbs_node_resources"("project_resource_id");

-- AddForeignKey
ALTER TABLE "wbs_node_resources" ADD CONSTRAINT "wbs_node_resources_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wbs_node_resources" ADD CONSTRAINT "wbs_node_resources_project_resource_id_fkey" FOREIGN KEY ("project_resource_id") REFERENCES "project_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
