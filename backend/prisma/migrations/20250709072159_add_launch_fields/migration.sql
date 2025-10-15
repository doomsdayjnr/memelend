/*
  Warnings:

  - You are about to alter the column `initialSupply` on the `TokenLaunch` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.

*/
-- AlterTable
ALTER TABLE "TokenLaunch" ADD COLUMN     "decimals" INTEGER NOT NULL DEFAULT 6,
ALTER COLUMN "initialSupply" SET DEFAULT 1000000000,
ALTER COLUMN "initialSupply" SET DATA TYPE INTEGER;
