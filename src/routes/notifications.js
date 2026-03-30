const notificationService = require('../services/notificationService');

module.exports = async function notificationRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // GET /api/v1/notifications
  fastify.get('/', auth, async (request) => {
    const page  = parseInt(request.query.page)  || 1;
    const limit = parseInt(request.query.limit) || 20;
    return notificationService.getNotifications(request.user.sub, page, limit);
  });

  // PATCH /api/v1/notifications/read-all  — must be before /:id to avoid conflict
  fastify.patch('/read-all', auth, async (request, reply) => {
    await notificationService.markAllRead(request.user.sub);
    return reply.send({ message: 'All notifications marked as read' });
  });

  // PATCH /api/v1/notifications/:id/read
  fastify.patch('/:id/read', auth, async (request, reply) => {
    await notificationService.markRead(request.user.sub, request.params.id);
    return reply.send({ message: 'Notification marked as read' });
  });
};
