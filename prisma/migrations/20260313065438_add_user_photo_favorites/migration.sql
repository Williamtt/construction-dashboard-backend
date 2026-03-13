-- CreateTable
CREATE TABLE "user_photo_favorites" (
    "user_id" TEXT NOT NULL,
    "attachment_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_photo_favorites_pkey" PRIMARY KEY ("user_id","attachment_id")
);

-- CreateIndex
CREATE INDEX "user_photo_favorites_user_id_idx" ON "user_photo_favorites"("user_id");

-- CreateIndex
CREATE INDEX "user_photo_favorites_attachment_id_idx" ON "user_photo_favorites"("attachment_id");

-- AddForeignKey
ALTER TABLE "user_photo_favorites" ADD CONSTRAINT "user_photo_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_photo_favorites" ADD CONSTRAINT "user_photo_favorites_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
