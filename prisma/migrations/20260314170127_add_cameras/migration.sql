-- CreateTable
CREATE TABLE "cameras" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "name" TEXT NOT NULL,
    "stream_token" TEXT NOT NULL,
    "connection_mode" TEXT NOT NULL DEFAULT 'go2rtc',
    "source_url_enc" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cameras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cameras_stream_token_key" ON "cameras"("stream_token");

-- CreateIndex
CREATE INDEX "cameras_project_id_idx" ON "cameras"("project_id");

-- CreateIndex
CREATE INDEX "cameras_tenant_id_idx" ON "cameras"("tenant_id");

-- CreateIndex
CREATE INDEX "cameras_stream_token_idx" ON "cameras"("stream_token");

-- AddForeignKey
ALTER TABLE "cameras" ADD CONSTRAINT "cameras_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
