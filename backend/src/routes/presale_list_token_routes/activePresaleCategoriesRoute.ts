import { FastifyPluginAsync } from 'fastify';
import prisma from '../../db/client';

const activePresaleCategoriesRoute: FastifyPluginAsync = async (server) => {
  server.get('/presale-categories/active', async (req, reply) => {
    try {
      const categories = await prisma.category.findMany({
        where: {
          subCategories: {
            some: {
              tokens: {
                some: {
                  tokenLaunch: {
                    isPresale: true,
                  },
                },
              },
            },
          },
        },
        include: {
          subCategories: {
            where: {
              tokens: {
                some: {
                  tokenLaunch: {
                    isPresale: true,
                  },
                },
              },
            },
            include: {
              _count: {
                select: {
                  tokens: {
                    where: {
                      tokenLaunch: {
                        isPresale: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
      });

      // Flatten the count for easier frontend usage
      const formatted = categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        subcategories: cat.subCategories.map(sub => ({
          id: sub.id,
          name: sub.name,
          tokenCount: sub._count.tokens,
        })),
      }));

      return reply.send(formatted);
    } catch (err: any) {
      console.error('Failed to fetch active categories:', err);
      return reply.status(500).send({ error: err.message || 'Unknown error' });
    }
  });
};

export default activePresaleCategoriesRoute;
