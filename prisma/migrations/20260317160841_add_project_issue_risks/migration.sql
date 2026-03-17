-- CreateTable
CREATE TABLE "project_issue_risks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignee_id" TEXT,
    "urgency" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_issue_risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_issue_risk_wbs_nodes" (
    "issue_risk_id" TEXT NOT NULL,
    "wbs_node_id" TEXT NOT NULL,

    CONSTRAINT "project_issue_risk_wbs_nodes_pkey" PRIMARY KEY ("issue_risk_id","wbs_node_id")
);

-- CreateIndex
CREATE INDEX "project_issue_risks_project_id_idx" ON "project_issue_risks"("project_id");

-- CreateIndex
CREATE INDEX "project_issue_risks_assignee_id_idx" ON "project_issue_risks"("assignee_id");

-- CreateIndex
CREATE INDEX "project_issue_risk_wbs_nodes_wbs_node_id_idx" ON "project_issue_risk_wbs_nodes"("wbs_node_id");

-- AddForeignKey
ALTER TABLE "project_issue_risks" ADD CONSTRAINT "project_issue_risks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_issue_risks" ADD CONSTRAINT "project_issue_risks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_issue_risk_wbs_nodes" ADD CONSTRAINT "project_issue_risk_wbs_nodes_issue_risk_id_fkey" FOREIGN KEY ("issue_risk_id") REFERENCES "project_issue_risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_issue_risk_wbs_nodes" ADD CONSTRAINT "project_issue_risk_wbs_nodes_wbs_node_id_fkey" FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
