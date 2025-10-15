/*
  Warnings:

  - A unique constraint covering the columns `[positionId,mint]` on the table `ShortPosition` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `positionAccount` to the `ShortPosition` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `collateralAmt` on the `ShortPosition` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `borrowedAmt` on the `ShortPosition` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `liquidationPrice` on table `ShortPosition` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ShortPosition" ADD COLUMN     "accumulatedCAfter" BIGINT,
ADD COLUMN     "collateralReturned" BIGINT,
ADD COLUMN     "exitPrice" DOUBLE PRECISION,
ADD COLUMN     "forfeitedCollateral" BIGINT,
ADD COLUMN     "interest" BIGINT,
ADD COLUMN     "liquidatedTokens" BIGINT,
ADD COLUMN     "pnl" BIGINT,
ADD COLUMN     "positionAccount" TEXT NOT NULL,
ADD COLUMN     "repaidTokens" BIGINT,
ADD COLUMN     "tokenReserveAfter" BIGINT,
ADD COLUMN     "totalFees" BIGINT,
DROP COLUMN "collateralAmt",
ADD COLUMN     "collateralAmt" BIGINT NOT NULL,
DROP COLUMN "borrowedAmt",
ADD COLUMN     "borrowedAmt" BIGINT NOT NULL,
ALTER COLUMN "liquidationPrice" SET NOT NULL,
ALTER COLUMN "openedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Trade" (
    "id" SERIAL NOT NULL,
    "txSig" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "userWallet" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "solIn" BIGINT,
    "solOut" BIGINT,
    "tokensIn" BIGINT,
    "tokensOut" BIGINT,
    "tokenOutBeforeFees" BIGINT,
    "creatorFee" BIGINT NOT NULL,
    "platformFee" BIGINT NOT NULL,
    "referralFee" BIGINT NOT NULL,
    "referrer" TEXT,
    "vaultBump" INTEGER,
    "priceSol" DOUBLE PRECISION NOT NULL,
    "blockTime" TIMESTAMP(3) NOT NULL,
    "insertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trade_mint_blockTime_idx" ON "Trade"("mint", "blockTime");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_txSig_logIndex_key" ON "Trade"("txSig", "logIndex");

-- CreateIndex
CREATE INDEX "ShortPosition_userWallet_mint_idx" ON "ShortPosition"("userWallet", "mint");

-- CreateIndex
CREATE UNIQUE INDEX "ShortPosition_positionId_mint_key" ON "ShortPosition"("positionId", "mint");
