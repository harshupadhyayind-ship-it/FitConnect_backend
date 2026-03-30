const moderationService = require('../../services/moderationService');

module.exports = async function moderationRoutes(fastify) {
  const guard = { onRequest: [fastify.authenticate, fastify.adminOnly] };

  /**
   * GET /api/v1/admin/moderation/reports
   * Query: status (pending|resolved|dismissed), type (user|message), page, limit
   */
  fastify.get('/reports', guard, async (request) => {
    const { status = 'pending', type, page = 1, limit = 20 } = request.query;
    return moderationService.listReports({ status, type, page: parseInt(page), limit: parseInt(limit) });
  });

  // GET /api/v1/admin/moderation/reports/:reportId
  fastify.get('/reports/:reportId', guard, async (request) => {
    return moderationService.getReport(request.params.reportId);
  });

  // PATCH /api/v1/admin/moderation/reports/:reportId/resolve
  fastify.patch('/reports/:reportId/resolve', {
    ...guard,
    schema: {
      body: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['warn', 'ban', 'delete_content', 'none'] },
          notes:  { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    await moderationService.resolveReport(request.params.reportId, request.body, request.user.sub);
    return reply.send({ message: 'Report resolved' });
  });

  // PATCH /api/v1/admin/moderation/reports/:reportId/dismiss
  fastify.patch('/reports/:reportId/dismiss', guard, async (request, reply) => {
    await moderationService.dismissReport(request.params.reportId, request.user.sub);
    return reply.send({ message: 'Report dismissed' });
  });

  // GET /api/v1/admin/moderation/flagged-messages  — messages flagged by users
  fastify.get('/flagged-messages', guard, async (request) => {
    const page  = parseInt(request.query.page)  || 1;
    const limit = parseInt(request.query.limit) || 20;
    return moderationService.getFlaggedMessages(page, limit);
  });
};
