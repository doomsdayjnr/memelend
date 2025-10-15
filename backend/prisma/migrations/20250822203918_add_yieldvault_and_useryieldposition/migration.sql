/*
  Warnings:

  - You are about to drop the column `liquidatedTokens` on the `ShortPosition` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ShortPosition" DROP COLUMN "liquidatedTokens";

-- CreateTable
CREATE TABLE "YieldVault" (
    "id" SERIAL NOT NULL,
    "mint" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "aprBps" BIGINT NOT NULL,
    "totalStaked" BIGINT NOT NULL,
    "accRewardPerShare" BIGINT NOT NULL,
    "launchTs" BIGINT NOT NULL,
    "maxWithdrawBps" BIGINT NOT NULL,
    "lastAccrualTs" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YieldVault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserYieldPosition" (
    "id" SERIAL NOT NULL,
    "owner" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "isCreator" BOOLEAN NOT NULL,
    "claimedPrincipal" BIGINT NOT NULL,
    "initialDeposit" BIGINT NOT NULL,
    "deposited" BIGINT NOT NULL,
    "rewardDebt" BIGINT NOT NULL,
    "claimedTotal" BIGINT NOT NULL,
    "depositedAt" BIGINT NOT NULL,
    "lastActionTs" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserYieldPosition_pkey" PRIMARY KEY ("id")
);
