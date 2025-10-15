/*
  Warnings:

  - You are about to drop the column `pending_rewards` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `total_earned` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "pending_rewards",
DROP COLUMN "total_earned",
ADD COLUMN     "pendingRewards" BIGINT,
ADD COLUMN     "totalEarned" BIGINT;
