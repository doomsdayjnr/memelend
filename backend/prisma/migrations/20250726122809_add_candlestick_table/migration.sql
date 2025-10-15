-- CreateTable
CREATE TABLE "PricePoint" (
    "id" SERIAL NOT NULL,
    "mint" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "txType" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candlestick" (
    "id" SERIAL NOT NULL,
    "mint" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Candlestick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortPosition" (
    "id" SERIAL NOT NULL,
    "userWallet" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "collateralAmt" TEXT NOT NULL,
    "borrowedAmt" TEXT NOT NULL,
    "openPrice" DOUBLE PRECISION NOT NULL,
    "liquidationPrice" DOUBLE PRECISION,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "isLiquidated" BOOLEAN NOT NULL DEFAULT false,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShortPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Candlestick_mint_interval_time_key" ON "Candlestick"("mint", "interval", "time");

-- AddForeignKey
ALTER TABLE "PricePoint" ADD CONSTRAINT "PricePoint_mint_fkey" FOREIGN KEY ("mint") REFERENCES "TokenLaunch"("mint") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortPosition" ADD CONSTRAINT "ShortPosition_userWallet_fkey" FOREIGN KEY ("userWallet") REFERENCES "User"("wallet") ON DELETE RESTRICT ON UPDATE CASCADE;
