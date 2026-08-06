const proInterestService = require('../../services/proInterestService');

module.exports = async function adminProInterestRoutes(fastify) {
  const guard = { onRequest: [fastify.authenticate, fastify.adminOnly] };

  /**
   * GET /api/v1/admin/pro-interest
   * Query: page, limit
   * Paginated list of professionals who registered interest in Pro — `total`
   * in the response is the running count shown on the admin dashboard.
   */
  fastify.get('/', guard, async (request) => {
    const { page = 1, limit = 20 } = request.query;
    return proInterestService.listInterestRegistrations({
      page:  parseInt(page),
      limit: Math.min(parseInt(limit), 100),
    });
  });
};
