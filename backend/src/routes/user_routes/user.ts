import { FastifyPluginAsync } from 'fastify';
import prisma from '../../db/client';

function generateUsername() {
  const adjectives = [
    "Lovely", "Friendly", "Clever", "Brave", "Gentle", "Wild", "Happy", "Lucky",
    "Silly", "Speedy", "Witty", "Bold", "Charming", "Bouncy", "Zany"
  ];

  const animals = [
    "Fox", "Rabbit", "Tiger", "Bear", "Panda", "Eagle", "Otter", "Hawk",
    "Cat", "Dog", "Lion", "Shark", "Wolf", "Frog", "Koala"
  ];

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const number = Math.floor(1000 + Math.random() * 9000);

  return `@${adjective}${animal}${number}`;
}

function generateReferralCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Serialize BigInt fields to string before sending JSON
function serializeBigInt(obj: any) {
  return JSON.parse(JSON.stringify(obj, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
}

const userSelect = {
  id: true,
  wallet: true,
  username: true,
  referralCode: true,
  referredById: true,
  pendingRewards: true,
  totalEarned: true,
  createdAt: true,
};

const userRoutes: FastifyPluginAsync = async (server) => {
  server.post('/register', async (req, reply) => {
    try {
      const { wallet, referredBy } = req.body as { wallet: string; referredBy?: string };

      if (!wallet) {
        return reply.status(400).send({ error: 'Missing wallet address' });
      }

      const normalizedReferredBy = referredBy?.trim().toUpperCase();

      let user = await prisma.user.findUnique({
        where: { wallet },
        select: userSelect,
      });

      if (!user) {
        const username = generateUsername();
        const referralCode = generateReferralCode();

        const data: any = { wallet, username, referralCode };

        if (normalizedReferredBy) {
          const referrer = await prisma.user.findUnique({
            where: { referralCode: normalizedReferredBy },
          });
          if (referrer) {
            data.referredBy = { connect: { id: referrer.id } };
          }
        }

        user = await prisma.user.create({
          data,
          select: userSelect,
        });

        return reply.send({ success: true, user: serializeBigInt(user), newUser: true });
      }

      if (normalizedReferredBy && !user.referredById) {
        const referrer = await prisma.user.findUnique({
          where: { referralCode: normalizedReferredBy },
        });
        if (referrer) {
          user = await prisma.user.update({
            where: { wallet },
            data: { referredBy: { connect: { id: referrer.id } } },
            select: userSelect,
          });
        }
      }

      return reply.send({ success: true, user: serializeBigInt(user), newUser: false });
    } catch (err) {
      console.error("❌ User registration failed:", err);
      return reply.status(500).send({ error: "User registration failed" });
    }
  });
};

export default userRoutes;
