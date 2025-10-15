/*
  Warnings:

  - The `presaleSol` column on the `TokenLaunch` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "TokenLaunch" DROP COLUMN "presaleSol",
ADD COLUMN     "presaleSol" BIGINT DEFAULT 0;
