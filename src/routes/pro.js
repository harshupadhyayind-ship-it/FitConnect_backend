const proInterestService = require('../services/proInterestService');

module.exports = async function proRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // POST /api/v1/pro/interest — register interest in FitConnect Pro (professional accounts only)
  fastify.post('/interest', auth, async (request, reply) => {
    const result = await proInterestService.registerInterest(request.user.sub);
    return reply.code(result.already_registered ? 200 : 201).send(result);
  });

  // GET /api/v1/pro/interest — check whether the caller has already registered interest
  fastify.get('/interest', auth, async (request) => {
    return proInterestService.getMyInterestStatus(request.user.sub);
  });

  // DELETE /api/v1/pro/interest — withdraw a previously registered interest
  fastify.delete('/interest', auth, async (request) => {
    return proInterestService.withdrawInterest(request.user.sub);
  });
};
