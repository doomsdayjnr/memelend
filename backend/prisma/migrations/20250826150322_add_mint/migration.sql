/*
  Warnings:

  - A unique constraint covering the columns `[mint]` on the table `YieldVault` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "YieldVault_mint_key" ON "YieldVault"("mint");
