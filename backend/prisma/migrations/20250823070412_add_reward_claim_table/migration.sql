-- CreateTable
CREATE TABLE "RewardClaim" (
    "id" SERIAL NOT NULL,
    "owner" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "claimedAmount" BIGINT NOT NULL,
    "newRewardDebt" BIGINT NOT NULL,
    "totalClaimed" BIGINT NOT NULL,
    "lastAccrualTs" BIGINT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardClaim_pkey" PRIMARY KEY ("id")
);
