const messagingService = require('../services/messagingService');
const notificationService = require('../services/notificationService');

module.exports = async function messageRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // GET /api/v1/messages  — chat list
  fastify.get('/', auth, async (request) => {
    return messagingService.getChatList(request.user.sub);
  });

  // GET /api/v1/messages/:matchId  — message history
  fastify.get('/:matchId', auth, async (request) => {
    const page  = parseInt(request.query.page)  || 1;
    const limit = parseInt(request.query.limit) || 30;
    return messagingService.getMessages(request.user.sub, request.params.matchId, page, limit);
  });

  // POST /api/v1/messages/:matchId  — send message
  fastify.post('/:matchId', {
    ...auth,
    schema: {
      body: { type: 'object', required: ['content'], properties: { content: { type: 'string', minLength: 1 } } },
    },
  }, async (request, reply) => {
    const message = await messagingService.sendMessage(request.user.sub, request.params.matchId, request.body.content.trim());
    notificationService.sendMessageNotification(message.recipient_id, request.user.sub, request.body.content).catch(request.log.error);
    return reply.code(201).send(message);
  });

  // PATCH /api/v1/messages/:matchId/read
  fastify.patch('/:matchId/read', auth, async (request, reply) => {
    await messagingService.markAsRead(request.user.sub, request.params.matchId);
    return reply.send({ message: 'Messages marked as read' });
  });
};
