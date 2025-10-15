/*
  Warnings:

  - Added the required column `name` to the `TokenLaunch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `symbol` to the `TokenLaunch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `uri` to the `TokenLaunch` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TokenLaunch" ADD COLUMN     "discord" TEXT,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "symbol" TEXT NOT NULL,
ADD COLUMN     "telegram" TEXT,
ADD COLUMN     "twitter" TEXT,
ADD COLUMN     "uri" TEXT NOT NULL,
ADD COLUMN     "website" TEXT;
