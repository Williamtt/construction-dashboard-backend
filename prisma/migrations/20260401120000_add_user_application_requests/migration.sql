-- CreateTable
CREATE TABLE "user_application_requests" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "student_id" TEXT,
    "department" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tenant_id" TEXT NOT NULL,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_application_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_application_requests_email_idx" ON "user_application_requests"("email");

-- CreateIndex
CREATE INDEX "user_application_requests_tenant_id_status_idx" ON "user_application_requests"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "user_application_requests" ADD CONSTRAINT "user_application_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_application_requests" ADD CONSTRAINT "user_application_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
