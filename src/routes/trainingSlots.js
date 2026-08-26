const trainingSlotsService = require('../services/trainingSlotsService');

/**
 * TRAINING SLOT BOOKING
 * ─────────────────────
 * Lets an individual user book a 1:1 training session with a professional.
 * Overlap prevention is enforced at the database level (see migration 022)
 * so concurrent booking requests can't both succeed for the same window —
 * the app-level check in the service is just for a clean error message.
 */
module.exports = async function trainingSlotsRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // POST /api/v1/training-slots/book
  fastify.post('/training-slots/book', {
    ...auth,
    schema: {
      body: {
        type: 'object',
        required: ['professional_id', 'date', 'start_time', 'end_time'],
        properties: {
          professional_id: { type: 'string' },
          date:            { type: 'string', description: 'YYYY-MM-DD' },
          start_time:      { type: 'string', description: 'HH:MM (24-hour)' },
          end_time:        { type: 'string', description: 'HH:MM (24-hour)' },
          notes:           { type: 'string', maxLength: 500 },
        },
      },
    },
  }, async (request, reply) => {
    const slot = await trainingSlotsService.bookSlot(request.user.sub, request.body);
    return reply.code(201).send(slot);
  });

  // GET /api/v1/training-slots/availability?professional_id=&date=
  // Returns already-booked ranges for a professional on a given day, so a
  // client can render a picker without guessing-and-checking each slot.
  fastify.get('/training-slots/availability', auth, async (request) => {
    const { professional_id, date } = request.query;
    return trainingSlotsService.getAvailability(professional_id, date);
  });

  // GET /api/v1/training-slots/:slotId
  fastify.get('/training-slots/:slotId', auth, async (request) => {
    return trainingSlotsService.getSlotDetail(request.user.sub, request.params.slotId);
  });

  // DELETE /api/v1/training-slots/:slotId — cancel (soft delete)
  // Body (optional): { "reason": "..." }
  // Either the booked user or the professional on the slot may cancel it.
  fastify.delete('/training-slots/:slotId', auth, async (request, reply) => {
    const result = await trainingSlotsService.cancelSlot(
      request.user.sub,
      request.params.slotId,
      request.body?.reason,
    );
    return reply.send(result);
  });

  // GET /api/v1/users/:userId/training-slots?status=upcoming|past|cancelled|all&date=&page=&limit=
  // A user may only list their own slots.
  fastify.get('/users/:userId/training-slots', auth, async (request, reply) => {
    if (request.params.userId !== request.user.sub) {
      return reply.code(403).send({ error: 'You can only view your own training slots' });
    }
    const { status, date, page = 1, limit = 20 } = request.query;
    return trainingSlotsService.getUserSlots(request.user.sub, {
      status,
      date,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50),
    });
  });

  // GET /api/v1/professionals/:professionalId/training-slots?status=upcoming|past|cancelled|all&date=&page=&limit=
  // A professional may only list their own slots.
  fastify.get('/professionals/:professionalId/training-slots', auth, async (request, reply) => {
    if (request.params.professionalId !== request.user.sub) {
      return reply.code(403).send({ error: 'You can only view your own training slots' });
    }
    const { status, date, page = 1, limit = 20 } = request.query;
    return trainingSlotsService.getProfessionalSlots(request.user.sub, {
      status,
      date,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50),
    });
  });
};
