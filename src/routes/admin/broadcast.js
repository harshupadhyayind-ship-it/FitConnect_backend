const broadcastService = require('../../services/broadcastService');

module.exports = async function broadcastRoutes(fastify) {
  const guard = { onRequest: [fastify.authenticate, fastify.adminOnly] };

  /**
   * POST /api/v1/admin/notifications/broadcast
   * Send a push notification to all users or a filtered segment.
   */
  fastify.post('/broadcast', {
    ...guard,
    schema: {
      body: {
        type: 'object',
        required: ['title', 'body'],
        properties: {
          title:   { type: 'string' },
          body:    { type: 'string' },
          // Optional filters — omit to send to all users
          filters: {
            type: 'object',
            properties: {
              user_type:     { type: 'string', enum: ['individual', 'professional'] },
              fitness_level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
              fitness_goal:  { type: 'string' },
              platform:      { type: 'string', enum: ['android', 'ios'] },
            },
          },
          data: {
            type: 'object',
            description: 'Optional key-value data payload for the notification',
          },
        },
      },
    },
  }, async (request, reply) => {
    const result = await broadcastService.sendBroadcast(request.body, request.user.sub);
    return reply.send(result);
  });

  // GET /api/v1/admin/notifications/broadcast/history  — past broadcast log
  fastify.get('/broadcast/history', guard, async (request) => {
    const page  = parseInt(request.query.page)  || 1;
    const limit = parseInt(request.query.limit) || 20;
    return broadcastService.getBroadcastHistory(page, limit);
  });
};
