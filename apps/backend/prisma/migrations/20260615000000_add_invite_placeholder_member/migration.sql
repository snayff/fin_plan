-- AlterTable
ALTER TABLE "household_invites" ADD COLUMN "member_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "household_invites_member_id_key" ON "household_invites"("member_id");

-- AddForeignKey
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
