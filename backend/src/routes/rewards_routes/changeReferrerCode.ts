import { FastifyPluginAsync } from 'fastify';
import prisma from '../../db/client';

const changeReferralCodeRoute: FastifyPluginAsync = async (server) => {
  server.post('/change-referrer-code', async (req, reply) => {
    try {
      const { user, referralCode } = req.body as { user: string; referralCode: string };

      if (!user || !referralCode) {
        return reply.send({
            success: false,
            claimable: 0,
            message: "Missing user or referral code"
          });
      }

      // Check if referral code already exists
      const existingCode = await prisma.user.findUnique({
        where: { referralCode },
      });

      if (existingCode) {
        return reply.send({
            success: false,
            claimable: 0,
            message: "Referral code already taken"
          });
      }

      // Update referral code
      const updatedUser = await prisma.user.update({
        where: { wallet: user },
        data: { referralCode },
      });

      return reply.send({
        success: true,
        message: 'Referral code updated successfully',
        user: {
          wallet: updatedUser.wallet,
          referralCode: updatedUser.referralCode,
        },
      });
    } catch (err) {
      console.error('Error changing referral code:', err);
      return reply.status(500).send({ success: false, message: 'Internal server error' });
    }
  });
};

export default changeReferralCodeRoute;
