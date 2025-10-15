-- AlterTable
ALTER TABLE "YieldVault" ADD COLUMN     "virtualSol" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "virtualTokens" BIGINT NOT NULL DEFAULT 0;
