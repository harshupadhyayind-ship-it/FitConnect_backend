const exploreService = require('../services/exploreService');

module.exports = async function exploreRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // GET /api/v1/explore/people
  fastify.get('/people', auth, async (request) => {
    const q = request.query;
    const filters = {
      fitness_goal:  q.fitness_goal,
      workout_type:  q.workout_type,
      distance_km:   parseFloat(q.distance_km) || 50,
      gender:        q.gender,
      page:          parseInt(q.page)  || 1,
      limit:         Math.min(parseInt(q.limit) || 20, 50),
    };
    return exploreService.getPeople(request.user.sub, filters);
  });

  // GET /api/v1/explore/events?page=&limit=&date=YYYY-MM-DD
  fastify.get('/events', auth, async (request) => {
    const page  = parseInt(request.query.page)  || 1;
    const limit = parseInt(request.query.limit) || 20;
    return exploreService.getEvents(page, limit, { date: request.query.date });
  });

  /**
   * GET /api/v1/explore/places
   * Query: type (gym|yoga|physio|sports|pool|crossfit|studio|other|all), distance_km, page, limit
   * Returns venues sorted by proximity to the authenticated user
   */
  fastify.get('/places', auth, async (request) => {
    const { type, page = 1, limit = 20 } = request.query;
    const distance_km = parseFloat(request.query.distance_km) || 10;
    return exploreService.getNearbyPlaces(request.user.sub, {
      type,
      distance_km,
      page:  parseInt(page),
      limit: Math.min(parseInt(limit), 50),
    });
  });

  // GET /api/v1/explore/search?q=...
  fastify.get('/search', auth, async (request, reply) => {
    const q = request.query.q?.trim();
    if (!q || q.length < 2) return reply.code(400).send({ error: 'Query must be at least 2 characters' });
    return exploreService.search(request.user.sub, q);
  });
};
