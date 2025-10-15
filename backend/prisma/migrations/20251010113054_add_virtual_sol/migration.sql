/*
  Warnings:

  - A unique constraint covering the columns `[txSig]` on the table `VaultSnapshot` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "VaultSnapshot" ADD COLUMN     "virtualSol" BIGINT,
ADD COLUMN     "virtualTokens" BIGINT;

-- CreateIndex
CREATE UNIQUE INDEX "VaultSnapshot_txSig_key" ON "VaultSnapshot"("txSig");
