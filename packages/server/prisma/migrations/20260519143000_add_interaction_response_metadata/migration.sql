-- AlterTable
ALTER TABLE "Message" ADD COLUMN "components" TEXT;

-- AlterTable
ALTER TABLE "Interaction" ADD COLUMN "response_type" INTEGER;
ALTER TABLE "Interaction" ADD COLUMN "original_message_id" TEXT;
