-- generated-by: colossus migration_gen
-- Generated at the merge gate from backend/prisma/schema.prisma (schema diff vs the
-- default branch). Do not edit: change schema.prisma and the next landing regenerates.

-- CreateEnum
CREATE TYPE "ChannelMemberSide" AS ENUM ('VENDOR', 'CUSTOMER');

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "name",
ADD COLUMN     "displayName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "ChannelMember" DROP COLUMN "createdAt",
DROP COLUMN "role",
ADD COLUMN     "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "side" "ChannelMemberSide" NOT NULL;

-- DropEnum
DROP TYPE "ChannelMemberRole";

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
