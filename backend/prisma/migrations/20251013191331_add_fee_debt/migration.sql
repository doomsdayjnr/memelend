-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "claimedTotal" BIGINT DEFAULT 0,
ADD COLUMN     "feeDebt" BIGINT DEFAULT 0,
ADD COLUMN     "lastActionTs" BIGINT;
