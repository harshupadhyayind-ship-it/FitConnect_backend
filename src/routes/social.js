const socialService = require('../services/socialService');

module.exports = async function socialRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // ── Professionals Near You ─────────────────────────────────────────────────

  /**
   * GET /api/v1/social/professionals
   * Query: distance_km (default 50), limit_per_section (default 10)
   *
   * Returns professionals grouped by specialty:
   *   sections: [{ key, title, professionals: [...] }]
   * Sections shown: TRAINERS NEAR YOU · YOGA & WELLNESS · NUTRITION & DIET
   *                 PHYSIO & REHAB · SPORTS COACHING
   */
  fastify.get('/professionals', auth, async (request) => {
    const { distance_km = 50, limit_per_section = 10 } = request.query;
    return socialService.getProfessionalsNearYou(request.user.sub, {
      distance_km      : parseFloat(distance_km),
      limit_per_section: parseInt(limit_per_section),
    });
  });

  // ── Groups ────────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/social/groups
   * Returns all groups the logged-in user is a member of.
   */
  fastify.get('/groups', auth, async (request) => {
    return socialService.getMyGroups(request.user.sub);
  });

  /**
   * POST /api/v1/social/groups
   * Body: { name, description?, category?, is_private?, cover_image_url? }
   * Creates a group and automatically adds the creator as admin.
   */
  fastify.post('/groups', {
    ...auth,
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name           : { type: 'string', minLength: 1, maxLength: 100 },
          description    : { type: 'string', maxLength: 500 },
          category       : { type: 'string', enum: ['running', 'yoga', 'gym', 'cycling', 'sports', 'nutrition', 'general'] },
          is_private     : { type: 'boolean' },
          cover_image_url: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const group = await socialService.createGroup(request.user.sub, request.body);
    return reply.code(201).send(group);
  });

  /**
   * GET /api/v1/social/groups/:groupId
   * Full detail of a single group including members preview.
   */
  fastify.get('/groups/:groupId', auth, async (request) => {
    return socialService.getGroupDetail(request.user.sub, request.params.groupId);
  });

  /**
   * POST /api/v1/social/groups/:groupId/join
   * Logged-in user joins a public group.
   */
  fastify.post('/groups/:groupId/join', auth, async (request, reply) => {
    const result = await socialService.joinGroup(request.user.sub, request.params.groupId);
    return reply.code(201).send(result);
  });

  /**
   * POST /api/v1/social/groups/:groupId/members
   * Admin adds a specific user to the group.
   * Body: { user_id }
   */
  fastify.post('/groups/:groupId/members', {
    ...auth,
    schema: {
      body: {
        type: 'object',
        required: ['user_id'],
        properties: {
          user_id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const result = await socialService.addMember(
      request.user.sub,
      request.params.groupId,
      request.body.user_id,
    );
    return reply.code(201).send(result);
  });

  /**
   * DELETE /api/v1/social/groups/:groupId/leave
   * Logged-in user leaves a group.
   * Note: The group creator cannot leave — they must delete the group.
   */
  fastify.delete('/groups/:groupId/leave', auth, async (request, reply) => {
    const result = await socialService.leaveGroup(request.user.sub, request.params.groupId);
    return reply.send(result);
  });

  // ── Group Events ──────────────────────────────────────────────────────────

  /**
   * POST /api/v1/social/groups/:groupId/events
   * Body: { title, description?, start_date, end_date, location?, latitude?, longitude?,
   *         cover_image_url?, is_free?, price? }
   * Any group member can create an event. Creator is auto-RSVP'd.
   */
  fastify.post('/groups/:groupId/events', {
    ...auth,
    schema: {
      body: {
        type: 'object',
        required: ['title', 'start_date', 'end_date'],
        properties: {
          title          : { type: 'string', minLength: 1, maxLength: 200 },
          description    : { type: 'string', maxLength: 1000 },
          start_date     : { type: 'string' },
          end_date       : { type: 'string' },
          location       : { type: 'string' },
          latitude       : { type: 'number' },
          longitude      : { type: 'number' },
          cover_image_url: { type: 'string' },
          is_free        : { type: 'boolean' },
          price          : { type: 'number', minimum: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const event = await socialService.createGroupEvent(
      request.user.sub,
      request.params.groupId,
      request.body,
    );
    return reply.code(201).send(event);
  });

  /**
   * GET /api/v1/social/groups/:groupId/events
   * Query: page, limit
   * Returns upcoming group events. Only accessible to group members.
   */
  fastify.get('/groups/:groupId/events', auth, async (request) => {
    const { page = 1, limit = 20 } = request.query;
    return socialService.getGroupEvents(
      request.user.sub,
      request.params.groupId,
      parseInt(page),
      Math.min(parseInt(limit), 50),
    );
  });

  /**
   * POST /api/v1/social/groups/:groupId/events/:eventId/attend
   * Toggle RSVP for a group event (going ↔ not going).
   * Only group members can RSVP.
   */
  fastify.post('/groups/:groupId/events/:eventId/attend', auth, async (request) => {
    return socialService.toggleGroupEventAttendance(
      request.user.sub,
      request.params.groupId,
      request.params.eventId,
    );
  });
};
