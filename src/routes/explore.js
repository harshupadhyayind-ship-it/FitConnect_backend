const exploreService = require('../services/exploreService');

module.exports = async function exploreRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // ── GET /api/v1/explore/people ─────────────────────────────────────────────
  fastify.get('/people', auth, async (request) => {
    const q = request.query;
    return exploreService.getPeople(request.user.sub, {
      fitness_goal : q.fitness_goal,
      workout_type : q.workout_type,
      distance_km  : parseFloat(q.distance_km) || 50,
      gender       : q.gender,
      page         : parseInt(q.page)  || 1,
      limit        : Math.min(parseInt(q.limit) || 20, 50),
    });
  });

  // ── GET /api/v1/explore/events ─────────────────────────────────────────────
  // Query params:
  //   date        YYYY-MM-DD   filter by calendar day
  //   type        all|event|gym|yoga|physio|sports|run
  //   lat, lng    user location (optional — for distance sorting)
  //   distance_km number       default 50
  //   page, limit pagination
  fastify.get('/events', auth, async (request) => {
    const q     = request.query;
    const page  = parseInt(q.page)  || 1;
    const limit = Math.min(parseInt(q.limit) || 20, 50);
    return exploreService.getEvents(request.user.sub, page, limit, {
      date        : q.date,
      type        : q.type?.toLowerCase(),
      lat         : parseFloat(q.lat)         || null,
      lng         : parseFloat(q.lng)         || null,
      distance_km : parseFloat(q.distance_km) || 50,
    });
  });

  // ── POST /api/v1/explore/events/:eventId/attend ────────────────────────────
  // Toggle RSVP — join if not attending, leave if already attending
  fastify.post('/events/:eventId/attend', auth, async (request, reply) => {
    const { eventId } = request.params;
    if (!eventId) return reply.code(400).send({ error: 'eventId is required' });
    return exploreService.toggleEventAttendance(request.user.sub, eventId);
  });

  // ── GET /api/v1/explore/places ─────────────────────────────────────────────
  // Query params:
  //   type        all|gyms|yoga|physio|sports   (maps to Google Places types)
  //   distance_km number   radius in km, default 5, max 50
  //   page, limit pagination
  // Source: Google Places Nearby Search API
  fastify.get('/places', auth, async (request) => {
    const q = request.query;
    return exploreService.getNearbyPlaces(request.user.sub, {
      type        : q.type?.toLowerCase() || 'all',
      distance_km : parseFloat(q.distance_km) || 5,
      page        : parseInt(q.page)  || 1,
      limit       : Math.min(parseInt(q.limit) || 20, 50),
    });
  });

  // ── GET /api/v1/explore/search ─────────────────────────────────────────────
  fastify.get('/search', auth, async (request, reply) => {
    const q = request.query.q?.trim();
    if (!q || q.length < 2)
      return reply.code(400).send({ error: 'Query must be at least 2 characters' });
    return exploreService.search(request.user.sub, q);
  });
};
