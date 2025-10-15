/*
  Warnings:

  - A unique constraint covering the columns `[positionId]` on the table `Trade` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "positionId" TEXT;

-- CreateTable
CREATE TABLE "Position" (
    "id" SERIAL NOT NULL,
    "positionId" TEXT NOT NULL,
    "userWallet" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "collateral" BIGINT NOT NULL,
    "borrowed" BIGINT,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "pnl" BIGINT,
    "currentPnl" BIGINT,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Position_positionId_key" ON "Position"("positionId");

-- CreateIndex
CREATE INDEX "Position_userWallet_mint_isOpen_idx" ON "Position"("userWallet", "mint", "isOpen");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_positionId_key" ON "Trade"("positionId");
