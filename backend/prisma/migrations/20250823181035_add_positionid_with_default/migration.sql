/*
  Warnings:

  - The `positionId` column on the `Trade` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `positionId` on the `Position` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Position" DROP COLUMN "positionId",
ADD COLUMN     "positionId" BIGINT NOT NULL,
ALTER COLUMN "collateral" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Trade" DROP COLUMN "positionId",
ADD COLUMN     "positionId" BIGINT;

-- CreateIndex
CREATE UNIQUE INDEX "Position_positionId_key" ON "Position"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_positionId_key" ON "Trade"("positionId");
