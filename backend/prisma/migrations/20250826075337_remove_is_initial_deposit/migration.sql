/*
  Warnings:

  - You are about to drop the column `isInitialDeposit` on the `YieldPosition` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "YieldPosition" DROP COLUMN "isInitialDeposit";
