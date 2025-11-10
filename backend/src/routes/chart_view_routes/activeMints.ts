import { FastifyPluginAsync } from 'fastify';
import prisma from '../../db/client';

const activeMintsRoute: FastifyPluginAsync = async (server) => {
  server.get('/active-mint/:mint', async (req, reply) => {
    const { mint } = req.params as { mint: string };

    try {
      const token = await prisma.tokenLaunch.findUnique({
        where: { mint }
      });

      if (!token) {
        return reply.send({
          success: false,
          active: false,
          presale: false,
          reason: "Token not found"
        });
      }

      // Token is active and tradable
      if (token.status === "active") {
        return reply.send({
          success: true,
          active: true,
          presale: token.isPresale,
          reason: "Token is active"
        });
      }

      // Token is not active, but presale is still ongoing
      if (token.isPresale === true) {
        return reply.send({
          success: true,
          active: false,
          presale: true,
          reason: "Token is in presale, trading disabled"
        });
      }

      // Token is not active and not in presale (expired, rug, failed launch)
      return reply.send({
        success: true,
        active: false,
        presale: false,
        reason: "Token is not active"
      });

    } catch (err: any) {
      console.error("❌ Error in /active-mint:", err);
      return reply.status(500).send({
        success: false,
        active: false,
        presale: false,
        reason: "Server error"
      });
    }
  });
};

export default activeMintsRoute;
