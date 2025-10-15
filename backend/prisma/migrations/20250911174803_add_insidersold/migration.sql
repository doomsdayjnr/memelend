-- AlterTable
ALTER TABLE "YieldVault" ADD COLUMN     "insiderSold" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "lastSold" TIMESTAMP(3),
ADD COLUMN     "liquidityAdded" BIGINT NOT NULL DEFAULT 0;
