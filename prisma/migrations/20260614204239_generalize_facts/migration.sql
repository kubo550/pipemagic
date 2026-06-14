-- DropForeignKey
ALTER TABLE "Fact" DROP CONSTRAINT "Fact_dealId_fkey";

-- AlterTable
ALTER TABLE "Fact" ADD COLUMN     "meetingId" TEXT,
ALTER COLUMN "dealId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Fact_meetingId_idx" ON "Fact"("meetingId");

-- AddForeignKey
ALTER TABLE "Fact" ADD CONSTRAINT "Fact_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fact" ADD CONSTRAINT "Fact_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
