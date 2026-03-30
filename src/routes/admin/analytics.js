const analyticsService = require('../../services/analyticsService');

module.exports = async function analyticsRoutes(fastify) {
  const guard = { onRequest: [fastify.authenticate, fastify.adminOnly] };

  // GET /api/v1/admin/analytics/overview  — key platform metrics
  fastify.get('/overview', guard, async () => {
    return analyticsService.getOverview();
  });

  /**
   * GET /api/v1/admin/analytics/dau
   * Query: days (default 30) — daily active users for the last N days
   */
  fastify.get('/dau', guard, async (request) => {
    const days = parseInt(request.query.days) || 30;
    return analyticsService.getDailyActiveUsers(days);
  });

  /**
   * GET /api/v1/admin/analytics/mau
   * Query: months (default 6)
   */
  fastify.get('/mau', guard, async (request) => {
    const months = parseInt(request.query.months) || 6;
    return analyticsService.getMonthlyActiveUsers(months);
  });

  // GET /api/v1/admin/analytics/retention  — D1, D7, D30 retention cohorts
  fastify.get('/retention', guard, async () => {
    return analyticsService.getRetention();
  });

  // GET /api/v1/admin/analytics/growth  — new user signups over time
  fastify.get('/growth', guard, async (request) => {
    const days = parseInt(request.query.days) || 30;
    return analyticsService.getUserGrowth(days);
  });

  // GET /api/v1/admin/analytics/matches  — match activity stats
  fastify.get('/matches', guard, async (request) => {
    const days = parseInt(request.query.days) || 30;
    return analyticsService.getMatchStats(days);
  });
};
