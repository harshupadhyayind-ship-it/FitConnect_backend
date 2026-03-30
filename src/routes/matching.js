const matchingService = require('../services/matchingService');
const notificationService = require('../services/notificationService');

module.exports = async function matchingRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // POST /api/v1/matching/like/:targetUserId
  fastify.post('/like/:targetUserId', auth, async (request) => {
    const result = await matchingService.likeUser(request.user.sub, request.params.targetUserId);
    if (result.matched) {
      notificationService.sendMatchNotification(request.params.targetUserId, request.user.sub).catch(request.log.error);
    }
    return result;
  });

  // DELETE /api/v1/matching/unlike/:targetUserId
  fastify.delete('/unlike/:targetUserId', auth, async (request) => {
    return matchingService.unlikeUser(request.user.sub, request.params.targetUserId);
  });

  // GET /api/v1/matching/matches
  fastify.get('/matches', auth, async (request) => {
    const page  = parseInt(request.query.page)  || 1;
    const limit = parseInt(request.query.limit) || 20;
    return matchingService.getMatches(request.user.sub, page, limit);
  });

  // GET /api/v1/matching/likes/sent
  fastify.get('/likes/sent', auth, async (request) => {
    return matchingService.getSentLikes(request.user.sub);
  });

  // DELETE /api/v1/matching/matches/:matchId  — unmatch
  fastify.delete('/matches/:matchId', auth, async (request, reply) => {
    await matchingService.unmatch(request.user.sub, request.params.matchId);
    return reply.send({ message: 'Unmatched successfully' });
  });
};
