/*
  Warnings:

  - Added the required column `userWallet` to the `PricePoint` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PricePoint" ADD COLUMN     "userWallet" TEXT NOT NULL;
