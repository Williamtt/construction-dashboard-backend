-- CreateTable
CREATE TABLE "project_resources" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "capacity_type" TEXT,
    "daily_capacity" DOUBLE PRECISION,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_resources_project_id_idx" ON "project_resources"("project_id");

-- CreateIndex
CREATE INDEX "project_resources_project_id_type_idx" ON "project_resources"("project_id", "type");

-- AddForeignKey
ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
