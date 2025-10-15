/*
  Warnings:

  - The primary key for the `Candlestick` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `time` on the `Candlestick` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[mint,interval,startTime]` on the table `Candlestick` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `startTime` to the `Candlestick` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Candlestick` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Candlestick_mint_interval_time_key";

-- AlterTable
ALTER TABLE "Candlestick" DROP CONSTRAINT "Candlestick_pkey",
DROP COLUMN "time",
ADD COLUMN     "startTime" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Candlestick_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Candlestick_id_seq";

-- CreateIndex
CREATE INDEX "Candlestick_mint_interval_startTime_idx" ON "Candlestick"("mint", "interval", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "Candlestick_mint_interval_startTime_key" ON "Candlestick"("mint", "interval", "startTime");
