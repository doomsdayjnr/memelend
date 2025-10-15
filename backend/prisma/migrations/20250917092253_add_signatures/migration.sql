/*
  Warnings:

  - A unique constraint covering the columns `[txSig]` on the table `CreatorEarningsWithdrawal` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[openTxSig]` on the table `Position` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[closeTxSig]` on the table `Position` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[txSig]` on the table `RewardClaim` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[openTxSig]` on the table `ShortPosition` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[closeTxSig]` on the table `ShortPosition` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `txSig` to the `CreatorEarningsWithdrawal` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CreatorEarningsWithdrawal" ADD COLUMN     "txSig" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "closeTxSig" TEXT,
ADD COLUMN     "openTxSig" TEXT;

-- AlterTable
ALTER TABLE "RewardClaim" ADD COLUMN     "txSig" TEXT;

-- AlterTable
ALTER TABLE "ShortPosition" ADD COLUMN     "closeTxSig" TEXT,
ADD COLUMN     "openTxSig" TEXT;

-- CreateTable
CREATE TABLE "ProcessedTx" (
    "id" SERIAL NOT NULL,
    "signature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedTx_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedTx_signature_key" ON "ProcessedTx"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorEarningsWithdrawal_txSig_key" ON "CreatorEarningsWithdrawal"("txSig");

-- CreateIndex
CREATE UNIQUE INDEX "Position_openTxSig_key" ON "Position"("openTxSig");

-- CreateIndex
CREATE UNIQUE INDEX "Position_closeTxSig_key" ON "Position"("closeTxSig");

-- CreateIndex
CREATE UNIQUE INDEX "RewardClaim_txSig_key" ON "RewardClaim"("txSig");

-- CreateIndex
CREATE UNIQUE INDEX "ShortPosition_openTxSig_key" ON "ShortPosition"("openTxSig");

-- CreateIndex
CREATE UNIQUE INDEX "ShortPosition_closeTxSig_key" ON "ShortPosition"("closeTxSig");
