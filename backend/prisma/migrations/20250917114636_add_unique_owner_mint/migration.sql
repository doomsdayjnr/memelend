/*
  Warnings:

  - A unique constraint covering the columns `[owner,mint]` on the table `UserYieldPosition` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "UserYieldPosition_owner_mint_key" ON "UserYieldPosition"("owner", "mint");
