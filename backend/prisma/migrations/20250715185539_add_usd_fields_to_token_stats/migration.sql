/*
  Warnings:

  - Added the required column `currentPriceUsd` to the `TokenStats` table without a default value. This is not possible if the table is not empty.
  - Added the required column `liquidityUsd` to the `TokenStats` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketCapUsd` to the `TokenStats` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TokenStats" ADD COLUMN     "currentPriceUsd" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "liquidityUsd" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "marketCapUsd" DOUBLE PRECISION NOT NULL;
