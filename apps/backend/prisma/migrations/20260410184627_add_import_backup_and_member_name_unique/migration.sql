-- CreateTable
CREATE TABLE "import_backups" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_backups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_backups_householdId_idx" ON "import_backups"("householdId");

-- CreateIndex
CREATE INDEX "import_backups_expiresAt_idx" ON "import_backups"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "members_household_id_name_key" ON "members"("household_id", "name");

-- AddForeignKey
ALTER TABLE "import_backups" ADD CONSTRAINT "import_backups_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
