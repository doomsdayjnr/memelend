-- CreateTable
CREATE TABLE "TokenStats" (
    "id" SERIAL NOT NULL,
    "mint" TEXT NOT NULL,
    "currentPrice" DOUBLE PRECISION NOT NULL,
    "marketCap" DOUBLE PRECISION NOT NULL,
    "liquidity" DOUBLE PRECISION NOT NULL,
    "volume24h" DOUBLE PRECISION NOT NULL,
    "buyCount24h" INTEGER NOT NULL,
    "sellCount24h" INTEGER NOT NULL,
    "buysToSells" DOUBLE PRECISION NOT NULL,
    "makers" INTEGER NOT NULL,
    "change5m" DOUBLE PRECISION NOT NULL,
    "change1h" DOUBLE PRECISION NOT NULL,
    "change6h" DOUBLE PRECISION NOT NULL,
    "change24h" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenStats_mint_key" ON "TokenStats"("mint");

-- AddForeignKey
ALTER TABLE "TokenStats" ADD CONSTRAINT "TokenStats_mint_fkey" FOREIGN KEY ("mint") REFERENCES "TokenLaunch"("mint") ON DELETE RESTRICT ON UPDATE CASCADE;
