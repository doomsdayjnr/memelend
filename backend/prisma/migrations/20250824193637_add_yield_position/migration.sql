-- CreateTable
CREATE TABLE "YieldPosition" (
    "id" SERIAL NOT NULL,
    "positionId" BIGINT NOT NULL,
    "userWallet" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "deposited" BIGINT,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "isCreator" BOOLEAN NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "YieldPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "YieldPosition_positionId_key" ON "YieldPosition"("positionId");

-- CreateIndex
CREATE INDEX "YieldPosition_userWallet_mint_isOpen_idx" ON "YieldPosition"("userWallet", "mint", "isOpen");
