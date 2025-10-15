import prisma from "../db/client";

// Point constants
const POINTS = {
  USER_HOLDER: 5, // per 10 average holders
  MARKET_CAP: { 10000: 50, 50000: 150, 100000: 500 }, // thresholds
  LIQUIDITY: { 10000: 30, 50000: 100, 100000: 300 },
  VOLUME: { 5000: 20, 25000: 100, 100000: 400 },
  TOP_LEADERBOARD: 200,
  ADD_LIQUIDITY: 50,
  HOLDER_RETENTION: 40, // per milestone (e.g. 30 days avg hold)
  SOCIAL_SHARE: 10,
};

// Badge tiers
const BADGES = [
  { name: "Bronze Creator", minPoints: 100 },
  { name: "Silver Creator", minPoints: 500 },
  { name: "Gold Creator", minPoints: 2000 },
  { name: "Diamond Creator", minPoints: 5000 },
  { name: "Verified MemeLend Creator", minPoints: 10000 },
];

async function awardPoints() {
  // Get all creators
  const creators = await prisma.user.findMany({
    where: { isCreator: true },
    include: {
      tokens: {
        include: {
          stats: true, // assume off-chain stats synced from chain
        },
      },
    },
  });

  for (const creator of creators) {
    let totalPoints = 0;

    for (const token of creator.tokens) {
      const { stats } = token;

      // Average holders
      if (stats.avgHolders >= 10) {
        totalPoints += Math.floor(stats.avgHolders / 10) * POINTS.USER_HOLDER;
      }

      // Market cap thresholds
      for (const [cap, points] of Object.entries(POINTS.MARKET_CAP)) {
        if (stats.marketCap >= Number(cap)) totalPoints += points;
      }

      // Liquidity thresholds
      for (const [liq, points] of Object.entries(POINTS.LIQUIDITY)) {
        if (stats.liquidity >= Number(liq)) totalPoints += points;
      }

      // Volume thresholds
      for (const [vol, points] of Object.entries(POINTS.VOLUME)) {
        if (stats.volume24h >= Number(vol)) totalPoints += points;
      }

      // Added liquidity achievement
      if (stats.addedLiquidityByCreator) {
        totalPoints += POINTS.ADD_LIQUIDITY;
      }

      // Holder retention
      if (stats.holderRetentionDays >= 30) {
        totalPoints += POINTS.HOLDER_RETENTION;
      }

      // Social share flag
      if (stats.sharedOnSocial) {
        totalPoints += POINTS.SOCIAL_SHARE;
      }
    }

    // Top leaderboard achievement
    const rank = await prisma.user.count({
      where: {
        isCreator: true,
        score: { gt: creator.score },
      },
    });
    if (rank < 10) totalPoints += POINTS.TOP_LEADERBOARD;

    // Save cumulative permanent score
    await prisma.user.update({
      where: { id: creator.id },
      data: { score: totalPoints },
    });

    // Award permanent badge (no resets)
    let newBadge = null;
    for (const badge of BADGES) {
      if (totalPoints >= badge.minPoints) {
        newBadge = badge.name;
      }
    }

    if (newBadge) {
      await prisma.user.update({
        where: { id: creator.id },
        data: { badge: newBadge },
      });
    }
  }
}

export async function runScoringWorker() {
  console.log("Running Creator Scoring Worker...");
  await awardPoints();
  console.log("Scoring Worker finished.");
}
