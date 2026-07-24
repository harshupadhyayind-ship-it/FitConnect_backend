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

  // POST /api/v1/matching/dislike/:targetUserId  — "pass"; hides the user from discovery for a cooldown period
  fastify.post('/dislike/:targetUserId', auth, async (request) => {
    return matchingService.dislikeUser(request.user.sub, request.params.targetUserId);
  });

  // DELETE /api/v1/matching/dislike/:targetUserId  — undo a pass before the cooldown expires
  fastify.delete('/dislike/:targetUserId', auth, async (request) => {
    return matchingService.undoDislike(request.user.sub, request.params.targetUserId);
  });

  // GET /api/v1/matching/likes/sent
  fastify.get('/likes/sent', auth, async (request) => {
    return matchingService.getSentLikes(request.user.sub);
  });

  // GET /api/v1/matching/likes/received
  fastify.get('/likes/received', auth, async (request) => {
    return matchingService.getReceivedLikes(request.user.sub);
  });

  // DELETE /api/v1/matching/matches/:matchId  — unmatch
  fastify.delete('/matches/:matchId', auth, async (request, reply) => {
    await matchingService.unmatch(request.user.sub, request.params.matchId);
    return reply.send({ message: 'Unmatched successfully' });
  });
};
