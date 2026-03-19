-- CreateTable
CREATE TABLE "repair_requests" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "repair_content" TEXT NOT NULL,
    "unit_label" TEXT,
    "remarks" TEXT,
    "problem_category" TEXT NOT NULL,
    "is_second_repair" BOOLEAN NOT NULL DEFAULT false,
    "delivery_date" TIMESTAMP(3),
    "repair_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repair_requests_project_id_idx" ON "repair_requests"("project_id");

-- CreateIndex
CREATE INDEX "repair_requests_project_id_status_idx" ON "repair_requests"("project_id", "status");

-- AddForeignKey
ALTER TABLE "repair_requests" ADD CONSTRAINT "repair_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
