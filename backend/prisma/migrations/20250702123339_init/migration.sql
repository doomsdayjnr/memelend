-- CreateTable
CREATE TABLE "TokenLaunch" (
    "id" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referrer" TEXT,

    CONSTRAINT "TokenLaunch_pkey" PRIMARY KEY ("id")
);
