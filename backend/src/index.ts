import launchStepOneRoutes from './routes/launch_token_route/launchStepOne';
import launchStepTwoRoutes from './routes/launch_token_route/launchStepTwo';
import addLiquidityRoute from './routes/launch_token_route/addLiquidity';
import userRoutes from './routes/user_routes/user'; 
import tokenRoutes from './routes/list_token_routes/tokens'; 
import devInfoRoute from './routes/chart_view_routes/dev_info_route';
import shortedRoutes from './routes/list_token_routes/shortedRoutes';
import trendingRoutes from './routes/list_token_routes/trending';
import activePresaleCategoriesRoute from './routes/presale_list_token_routes/activePresaleCategoriesRoute';
import activeCategoriesRoute from './routes/list_token_routes/activeCategoriesRoute';
import subcategoryTokensRoute from './routes/list_token_routes/subcategoryTokensRoute';
import buyTokenRoute from './routes/buy_routes/buyToken';
import getPriceRoute from './routes/price_routes/getPrice';
import buyPreviewRoute from './routes/buy_routes/buyPreview';
import sellPreviewRoute from './routes/sell_routes/sellPreview';
import sellTokenRoute from './routes/sell_routes/sellToken';
import goShortRoute from './routes/short_routes/goShortToken';
import goShortPreviewRoute from './routes/short_routes/goShortPreview';
import goShortPrePreviewRoute from './routes/short_routes/shortPreview';
import closeShortPositionRoute from './routes/short_routes/closeShortPosition';
import closeShortPreviewRoute from './routes/short_routes/closeShortPreview';
import referralRoute from './routes/rewards_routes/referral';
import claimReferralRewardsRoute from './routes/rewards_routes/claimRewards';
import changeReferralCodeRoute from './routes/rewards_routes/changeReferrerCode';
import allReferralRoute from './routes/rewards_routes/allreferral';
import positionsRoute from './routes/dashboard_routes/positions'; 
import presalePositionsRoute from './routes/dashboard_routes/presalePositions';
import yieldUserPositionsRoute from './routes/dashboard_routes/yieldPositions';
import yieldVaultRoute from './routes/yield_routes/allYieldVaults';
import claimYieldRoute from './routes/yield_routes/claimYield';
import claimEarningsRoute from './routes/dashboard_routes/claimEarnings'; 
import claimPresaleEarningsRoute from './routes/dashboard_routes/claimPresaleEarnings';
import referralChartRoute from './routes/rewards_routes/referralChart';
import creatorYieldRoute from './routes/yield_routes/creatorYieldWithdrawal';
import candleRoutes from './routes/candle_routes/candles';
import depositYieldRoute from './routes/yield_routes/depositYield';
import yieldDepositRoute from './routes/yield_routes/yieldDeposit';
import claimYieldTokenRoute from './routes/yield_routes/claimYieldToken';
import userTokenStateRoute from './routes/dashboard_routes/tokenStats';
import tokenInfoRoute from './routes/token_info/tokenInfo'; 
import holdersRoute from './routes/chart_view_routes/holders';
import categoriesRoute from './routes/launch_token_route/categories';
import profitChartStatsRoute from './routes/dashboard_routes/profitChartStats';
import historyListRoute from './routes/dashboard_routes/history';
import unrealizedPnLRoute from './routes/dashboard_routes/totalPnLStats';
import topReferralRoute from './routes/leaderboard_route/referral';
import topCreatorRoute from './routes/leaderboard_route/creator';
import newPresaleTokens from './routes/presale_list_token_routes/newPresaleTokens';
import presaleSubcategoryTokensRoute from './routes/presale_list_token_routes/presaleSubcategoryTokensRoute';
import joinPresaleRoute from './routes/presale_list_token_routes/joinPresale';
import joinPresalePreviewRoute from './routes/presale_list_token_routes/joinPresalePreview';
import dotenv from 'dotenv';
import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyFormbody from '@fastify/formbody';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import './wsServer';
import prisma from './db/client';
import { startEventIndexer } from './services/eventIndexer';
import { consumeTicks } from './routes/candle_routes/redisCandlesticks';
import { startTokenStatsWorker } from './services/tokenStatsWorker';



dotenv.config();

const PORT = Number(process.env.PORT) || 3001;
const HOST = '0.0.0.0';

const startServer = async () => {
  const server = Fastify({ logger: true });

  await server.register(fastifyCors, {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  (BigInt.prototype as any).toJSON = function() { return this.toString(); };

  server.register(fastifyFormbody);
  server.register(fastifyMultipart, {
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  });

  server.register(fastifySwagger, {
    swagger: {
      info: {
        title: 'MemeLend API',
        description: 'Launch memecoins with metadata',
        version: '0.1.0',
      },
    },
  });

  server.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  server.register(joinPresalePreviewRoute, { prefix: '/token' });
  server.register(joinPresaleRoute, { prefix: '/token' });
  server.register(categoriesRoute, { prefix: '/launch' });
  server.register(launchStepOneRoutes, { prefix: '/launch' });
  server.register(launchStepTwoRoutes, { prefix: '/launch' });
  server.register(addLiquidityRoute, { prefix: '/liquidity' });
  server.register(userRoutes, { prefix: '/users' });
  server.register(presaleSubcategoryTokensRoute, { prefix: '/tokens' });
  server.register(newPresaleTokens, { prefix: '/tokens' });
  server.register(tokenRoutes, { prefix: '/tokens' });
  server.register(shortedRoutes, { prefix: '/tokens' });
  server.register(trendingRoutes, { prefix: '/tokens' });
  server.register(activeCategoriesRoute, { prefix: '/tokens' });
  server.register(subcategoryTokensRoute, { prefix: '/tokens' });
  server.register(activePresaleCategoriesRoute, { prefix: '/tokens' });
  server.register(tokenInfoRoute, { prefix: '/token' });
  server.register(devInfoRoute, { prefix: '/token' });
  server.register(buyTokenRoute, { prefix: '/token' });
  server.register(getPriceRoute, { prefix: '/token' });
  server.register(buyPreviewRoute, { prefix: '/token' });
  server.register(sellPreviewRoute, { prefix: '/token' });
  server.register(sellTokenRoute, { prefix: '/token' });
  server.register(goShortRoute, { prefix: '/token' });
  server.register(goShortPreviewRoute, { prefix: '/token' });
  server.register(goShortPrePreviewRoute, { prefix: '/token' });
  server.register(closeShortPositionRoute, { prefix: '/token' });
  server.register(closeShortPreviewRoute, { prefix: '/token' });
  server.register(referralRoute, { prefix: '/reward' });
  server.register(allReferralRoute, { prefix: '/reward' });
  server.register(claimReferralRewardsRoute, { prefix: '/reward' });
  server.register(changeReferralCodeRoute, { prefix: '/reward' });
  server.register(claimEarningsRoute, { prefix: '/reward' }); 
  server.register(claimPresaleEarningsRoute, { prefix: '/reward' }); 
  server.register(referralChartRoute, { prefix: '/reward' });
  server.register(positionsRoute, { prefix: '/positions' }); 
  server.register(presalePositionsRoute, { prefix: '/positions' }); 
  server.register(yieldUserPositionsRoute, { prefix: '/positions' });
  server.register(holdersRoute, { prefix: '/positions' });
  server.register(candleRoutes, { prefix: '/chart' });
  server.register(depositYieldRoute, { prefix: '/yield' });
  server.register(yieldDepositRoute, { prefix: '/yield' });
  server.register(claimYieldTokenRoute, { prefix: '/yield' });
  server.register(yieldVaultRoute, { prefix: '/yield' });
  server.register(claimYieldRoute, { prefix: '/yield' });
  server.register(creatorYieldRoute, { prefix: '/yield' });
  server.register(userTokenStateRoute, { prefix: '/user' });
  server.register(profitChartStatsRoute, { prefix: '/user' });
  server.register(historyListRoute, { prefix: '/user' });
  server.register(unrealizedPnLRoute, { prefix: '/user' });
  server.register(topReferralRoute, { prefix: '/leaderboard' });
  server.register(topCreatorRoute, { prefix: '/leaderboard' });

  try {
    await server.listen({ port: PORT, host: HOST });
    server.log.info(`✅ Server running on port ${PORT}`);
    
    startEventIndexer();
    consumeTicks();
    startTokenStatsWorker();

  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

startServer(); 


