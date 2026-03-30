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
