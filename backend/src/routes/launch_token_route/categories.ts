import { FastifyPluginAsync } from 'fastify';
import prisma from '../../db/client';

const categoriesRoute: FastifyPluginAsync = async (server) => {
  server.get('/categories', async (req, reply) => {
    try {
      const categories = await prisma.category.findMany({
        include: {
          subCategories: true, // include nested subcategories
        },
        orderBy: { id: 'asc' }, // optional: sort by ID
      });

      return reply.send(categories);
    } catch (err: any) {
      console.error('Failed to fetch categories:', err);
      return reply.status(500).send({ error: err.message || 'Unknown error' });
    }
  });
};

export default categoriesRoute;
