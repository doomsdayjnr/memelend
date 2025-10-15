-- AlterTable
ALTER TABLE "TokenLaunch" ADD COLUMN     "isPresale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "presaleAmount" TEXT,
ADD COLUMN     "presalePercent" INTEGER NOT NULL DEFAULT 0;
