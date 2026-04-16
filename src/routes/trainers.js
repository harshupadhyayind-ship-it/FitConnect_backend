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
};
