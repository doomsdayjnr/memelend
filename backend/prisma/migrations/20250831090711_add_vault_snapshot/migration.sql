-- CreateTable
CREATE TABLE "VaultSnapshot" (
    "id" SERIAL NOT NULL,
    "mint" TEXT NOT NULL,
    "blockTime" TIMESTAMP(3) NOT NULL,
    "txSig" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "solReserve" BIGINT NOT NULL,
    "tokenReserve" BIGINT NOT NULL,
    "accumulatedC" BIGINT NOT NULL,
    "priceLamports" BIGINT NOT NULL,
    "volumeSolDelta" BIGINT NOT NULL,

    CONSTRAINT "VaultSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VaultSnapshot_mint_idx" ON "VaultSnapshot"("mint");

-- CreateIndex
CREATE INDEX "VaultSnapshot_blockTime_idx" ON "VaultSnapshot"("blockTime");
