const checkinService = require('../services/checkinService');

module.exports = async function checkinRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // POST /api/v1/checkin  — single-tap daily check-in
  fastify.post('/', auth, async (request) => {
    return checkinService.doCheckIn(request.user.sub);
  });

  // GET /api/v1/checkin/streak
  fastify.get('/streak', auth, async (request) => {
    return checkinService.getStreak(request.user.sub);
  });

  // GET /api/v1/checkin/badges
  fastify.get('/badges', auth, async (request) => {
    return checkinService.getBadges(request.user.sub);
  });

  // GET /api/v1/checkin/history
  fastify.get('/history', auth, async (request) => {
    return checkinService.getHistory(request.user.sub);
  });

  /**
   * GET /api/v1/checkin/streaks-page
   * Single call for the full Streaks screen:
   *  - streak { current, longest, total }
   *  - checked_in_today (bool)
   *  - message (motivational string)
   *  - calendar { year, month, days_in_month, checked_days[] }
   *  - goals_progress [{ goal, label, progress }]
   */
  fastify.get('/streaks-page', auth, async (request) => {
    return checkinService.getStreaksPage(request.user.sub);
  });
};
