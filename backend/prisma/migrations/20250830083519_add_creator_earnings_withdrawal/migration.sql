-- AlterTable
ALTER TABLE "YieldVault" ADD COLUMN     "totalEarned" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CreatorEarningsWithdrawal" (
    "id" SERIAL NOT NULL,
    "mint" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "totalEarned" BIGINT NOT NULL DEFAULT 0,
    "amountWithdrew" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorEarningsWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorEarningsWithdrawal_mint_key" ON "CreatorEarningsWithdrawal"("mint");
