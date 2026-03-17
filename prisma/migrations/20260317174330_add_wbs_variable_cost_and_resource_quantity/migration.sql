-- AlterTable
ALTER TABLE "wbs_node_resources" ADD COLUMN     "quantity" DECIMAL(14,4) DEFAULT 1;

-- AlterTable
ALTER TABLE "wbs_nodes" ADD COLUMN     "variable_cost" DECIMAL(14,2);
