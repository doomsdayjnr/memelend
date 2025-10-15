/*
  Warnings:

  - A unique constraint covering the columns `[txSig,reason,mint]` on the table `VaultSnapshot` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "YieldVault" ADD COLUMN     "isLive" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "VaultSnapshot_txSig_reason_mint_key" ON "VaultSnapshot"("txSig", "reason", "mint");
