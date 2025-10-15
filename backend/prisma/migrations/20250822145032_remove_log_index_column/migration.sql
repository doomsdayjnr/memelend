/*
  Warnings:

  - You are about to drop the column `logIndex` on the `Trade` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[txSig]` on the table `Trade` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Trade_txSig_logIndex_key";

-- AlterTable
ALTER TABLE "Trade" DROP COLUMN "logIndex";

-- CreateIndex
CREATE UNIQUE INDEX "Trade_txSig_key" ON "Trade"("txSig");
