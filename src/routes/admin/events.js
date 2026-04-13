const adminEventsService = require('../../services/adminEventsService');

module.exports = async function adminEventsRoutes(fastify) {
  const guard = { onRequest: [fastify.authenticate, fastify.adminOnly] };

  // GET /api/v1/admin/events
  fastify.get('/', guard, async (request) => {
    const page   = parseInt(request.query.page)   || 1;
    const limit  = parseInt(request.query.limit)  || 20;
    const status = request.query.status; // upcoming | past | all
    return adminEventsService.listEvents(page, limit, status);
  });

  // POST /api/v1/admin/events/upload-cover — must be before /:eventId
  fastify.post('/upload-cover', guard, async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No file provided' });

    const ext = (data.filename.split('.').pop() || '').toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
      return reply.code(400).send({ error: 'Only jpg, png, webp and gif are allowed' });
    }

    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buffer   = await data.toBuffer();
    const url      = await adminEventsService.uploadCoverImage(buffer, fileName, data.mimetype);
    return reply.send({ url });
  });

  // GET /api/v1/admin/events/:eventId
  fastify.get('/:eventId', guard, async (request) => {
    return adminEventsService.getEvent(request.params.eventId);
  });

  // POST /api/v1/admin/events
  fastify.post('/', {
    ...guard,
    schema: {
      body: {
        type: 'object',
        required: ['title', 'start_date', 'end_date'],
        properties: {
          title:           { type: 'string' },
          description:     { type: 'string' },
          start_date:      { type: 'string' },
          end_date:        { type: 'string' },
          location:        { type: 'string' },
          cover_image_url: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const event = await adminEventsService.createEvent(request.body, request.user.sub);
    return reply.code(201).send(event);
  });

  // PATCH /api/v1/admin/events/:eventId
  fastify.patch('/:eventId', guard, async (request) => {
    return adminEventsService.updateEvent(request.params.eventId, request.body);
  });

  // DELETE /api/v1/admin/events/:eventId
  fastify.delete('/:eventId', guard, async (request, reply) => {
    await adminEventsService.deleteEvent(request.params.eventId);
    return reply.send({ message: 'Event deleted' });
  });
};
