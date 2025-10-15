/*
  Warnings:

  - The primary key for the `TokenLaunch` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `TokenLaunch` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[mint]` on the table `TokenLaunch` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "TokenLaunch" DROP CONSTRAINT "TokenLaunch_pkey",
ADD COLUMN     "initialSupply" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "launchTxSignature" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "TokenLaunch_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "TokenLaunch_mint_key" ON "TokenLaunch"("mint");
