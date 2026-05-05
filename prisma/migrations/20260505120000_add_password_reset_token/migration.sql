-- AlterTable (idempotent: add password reset token fields to User)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password_reset_token" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password_reset_token_exp" TIMESTAMP(3);

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "User_password_reset_token_key" ON "User"("password_reset_token");
