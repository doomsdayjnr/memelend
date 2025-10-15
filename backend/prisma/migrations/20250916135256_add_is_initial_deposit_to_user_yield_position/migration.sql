/*
  Warnings:

  - You are about to drop the `PricePoint` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PricePoint" DROP CONSTRAINT "PricePoint_mint_fkey";

-- AlterTable
ALTER TABLE "UserYieldPosition" ADD COLUMN     "isInitialDeposit" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "PricePoint";
