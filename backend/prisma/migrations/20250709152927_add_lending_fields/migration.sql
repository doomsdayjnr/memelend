/*
  Warnings:

  - Added the required column `lendAmount` to the `TokenLaunch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lendPercent` to the `TokenLaunch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lendingVault` to the `TokenLaunch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `liquidityAmount` to the `TokenLaunch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `liquidityVault` to the `TokenLaunch` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TokenLaunch" ADD COLUMN     "lendAmount" TEXT NOT NULL,
ADD COLUMN     "lendPercent" INTEGER NOT NULL,
ADD COLUMN     "lendingVault" TEXT NOT NULL,
ADD COLUMN     "liquidityAmount" TEXT NOT NULL,
ADD COLUMN     "liquidityVault" TEXT NOT NULL;
