const discoveryService = require('../services/discoveryService');

module.exports = async function discoveryRoutes(fastify) {
  // GET /api/v1/discovery/users?fitness_goal=&distance_km=&gender=&page=&limit=
  fastify.get('/users', { onRequest: [fastify.authenticate] }, async (request) => {
    const q = request.query;
    const filters = {
      fitness_goal:  q.fitness_goal,
      workout_type:  q.workout_type,
      distance_km:   parseFloat(q.distance_km) || 50,
      gender:        q.gender,
      page:          parseInt(q.page)  || 1,
      limit:         Math.min(parseInt(q.limit) || 20, 50),
    };
    return discoveryService.discoverUsers(request.user.sub, filters);
  });
};
