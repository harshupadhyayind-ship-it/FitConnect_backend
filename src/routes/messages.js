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

  // POST /api/v1/messages/:matchId  — send message (text or pre-uploaded file)
  fastify.post('/:matchId', {
    ...auth,
    schema: {
      body: {
        type: 'object',
        properties: {
          content:   { type: 'string', minLength: 1 },
          file_url:  { type: 'string' },
          file_name: { type: 'string' },
          file_size: { type: 'number' },
          mime_type: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body;
    if (!body.content && !body.file_url) {
      return reply.code(400).send({ error: 'content or file_url is required' });
    }
    const message = await messagingService.sendMessage(request.user.sub, request.params.matchId, body);
    const preview = body.content || (message.message_type === 'image' ? '📷 Photo' : '📎 Document');
    notificationService.sendMessageNotification(message.recipient_id, request.user.sub, preview).catch(request.log.error);
    return reply.code(201).send(message);
  });

  // POST /api/v1/messages/:matchId/upload  — send image or file
  // multipart/form-data: file field (required) + caption field (optional text)
  fastify.post('/:matchId/upload', auth, async (request, reply) => {
    const parts = request.parts();
    let fileData = null;
    let caption  = null;

    for await (const part of parts) {
      if (part.type === 'file') {
        const chunks = [];
        for await (const chunk of part.file) chunks.push(chunk);
        fileData = {
          buffer      : Buffer.concat(chunks),
          mimetype    : part.mimetype,
          originalname: part.filename,
        };
      } else if (part.fieldname === 'caption') {
        caption = part.value?.trim() || null;
      }
    }

    if (!fileData || fileData.buffer.length === 0) {
      return reply.code(400).send({ error: 'No file provided' });
    }

    const message = await messagingService.sendFileMessage(
      request.user.sub,
      request.params.matchId,
      fileData,
      caption,
    );

    if (caption) {
      notificationService.sendMessageNotification(message.recipient_id, request.user.sub, caption).catch(request.log.error);
    } else {
      notificationService.sendMessageNotification(message.recipient_id, request.user.sub,
        message.message_type === 'image' ? '📷 Sent a photo' : '📎 Sent a file'
      ).catch(request.log.error);
    }

    return reply.code(201).send(message);
  });

  // PATCH /api/v1/messages/:matchId/read
  fastify.patch('/:matchId/read', auth, async (request, reply) => {
    await messagingService.markAsRead(request.user.sub, request.params.matchId);
    return reply.send({ message: 'Messages marked as read' });
  });
};
