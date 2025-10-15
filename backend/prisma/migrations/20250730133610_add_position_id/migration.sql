/*
  Warnings:

  - Added the required column `positionId` to the `ShortPosition` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PricePoint" ALTER COLUMN "userWallet" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ShortPosition" ADD COLUMN     "positionId" BIGINT NOT NULL;
