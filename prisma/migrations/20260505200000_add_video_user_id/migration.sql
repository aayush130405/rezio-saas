-- AlterTable
ALTER TABLE "public"."Video"
ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "Video_userId_createdAt_idx" ON "public"."Video"("userId", "createdAt");
