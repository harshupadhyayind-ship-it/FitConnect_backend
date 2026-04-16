const homeService = require('../services/homeService');

module.exports = async function homeRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  /**
   * GET /api/v1/home
   * Returns everything the home screen needs in a single call:
   *  - user (name, location, streak, avatar)
   *  - sports_categories (static list)
   *  - trainers (professional users, sorted by proximity, limit 10)
   *  - fit_buddies (individual users, sorted by compatibility, limit 10)
   */
  fastify.get('/', auth, async (request) => {
    return homeService.getHomeData(request.user.sub);
  });
};
