/*
  Warnings:

  - You are about to drop the column `creatorFee` on the `Trade` table. All the data in the column will be lost.
  - You are about to drop the column `platformFee` on the `Trade` table. All the data in the column will be lost.
  - You are about to drop the column `referralFee` on the `Trade` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "VaultSnapshot_txSig_reason_mint_key";

-- AlterTable
ALTER TABLE "Trade" DROP COLUMN "creatorFee",
DROP COLUMN "platformFee",
DROP COLUMN "referralFee";
