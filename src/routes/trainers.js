const trainersService = require('../services/trainersService');

module.exports = async function trainersRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  /**
   * GET /api/v1/trainers
   * Query: specialty, location, page, limit
   * Returns paginated trainer list sorted by proximity + rating
   */
  fastify.get('/', auth, async (request) => {
    const { specialty, location, page = 1, limit = 20 } = request.query;
    return trainersService.getTrainers(request.user.sub, {
      specialty,
      location,
      page:  parseInt(page),
      limit: Math.min(parseInt(limit), 50),
    });
  });

  /**
   * GET /api/v1/trainers/:trainerId
   * Full public profile of a single trainer
   */
  fastify.get('/:trainerId', auth, async (request) => {
    return trainersService.getTrainerDetail(request.params.trainerId);
  });

  /**
   * POST /api/v1/trainers/:trainerId/rate
   * Body: { rating: 1-5, review?: string }
   * Rates a professional; calling again updates the caller's existing rating.
   */
  fastify.post('/:trainerId/rate', {
    ...auth,
    schema: {
      body: {
        type: 'object',
        required: ['rating'],
        properties: {
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          review: { type: 'string', maxLength: 2000 },
        },
      },
    },
  }, async (request, reply) => {
    const result = await trainersService.rateTrainer(request.user.sub, request.params.trainerId, request.body);
    return reply.code(201).send(result);
  });

  /**
   * GET /api/v1/trainers/:trainerId/ratings
   * Query: page, limit
   */
  fastify.get('/:trainerId/ratings', auth, async (request) => {
    const { page = 1, limit = 20 } = request.query;
    return trainersService.getTrainerRatings(request.params.trainerId, parseInt(page), Math.min(parseInt(limit), 50));
  });

  /**
   * DELETE /api/v1/trainers/:trainerId/rate
   * Removes the caller's own rating of this trainer.
   */
  fastify.delete('/:trainerId/rate', auth, async (request) => {
    return trainersService.deleteTrainerRating(request.user.sub, request.params.trainerId);
  });
};
