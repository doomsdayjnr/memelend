-- AlterTable
ALTER TABLE "YieldVault" ADD COLUMN     "insiderBought" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "lastBought" TIMESTAMP(3);
