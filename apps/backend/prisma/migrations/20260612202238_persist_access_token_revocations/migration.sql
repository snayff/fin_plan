-- CreateTable
CREATE TABLE "revoked_access_tokens" (
    "jti" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revoked_access_tokens_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "revoked_access_tokens_expires_at_idx" ON "revoked_access_tokens"("expires_at");
