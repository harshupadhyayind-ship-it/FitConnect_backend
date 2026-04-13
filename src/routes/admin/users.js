const adminService = require('../../services/adminService');

module.exports = async function adminUserRoutes(fastify) {
  const guard = { onRequest: [fastify.authenticate, fastify.adminOnly] };

  /**
   * GET /api/v1/admin/users
   * Query: search, user_type, status (active|banned|suspended), page, limit
   */
  fastify.get('/', guard, async (request) => {
    const { search, user_type, status, page = 1, limit = 20 } = request.query;
    return adminService.listUsers({ search, user_type, status, page: parseInt(page), limit: Math.min(parseInt(limit), 100) });
  });

  // GET /api/v1/admin/users/:userId
  fastify.get('/:userId', guard, async (request) => {
    return adminService.getUserDetail(request.params.userId);
  });

  // PATCH /api/v1/admin/users/:userId/ban
  fastify.patch('/:userId/ban', {
    ...guard,
    schema: {
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    await adminService.banUser(request.params.userId, request.body.reason, request.user.sub);
    return reply.send({ message: 'User banned' });
  });

  // PATCH /api/v1/admin/users/:userId/unban
  fastify.patch('/:userId/unban', guard, async (request, reply) => {
    await adminService.unbanUser(request.params.userId, request.user.sub);
    return reply.send({ message: 'User unbanned' });
  });

  // PATCH /api/v1/admin/users/:userId/suspend
  fastify.patch('/:userId/suspend', {
    ...guard,
    schema: {
      body: {
        type: 'object',
        required: ['reason', 'suspend_until'],
        properties: {
          reason:        { type: 'string' },
          suspend_until: { type: 'string' }, // ISO date string
        },
      },
    },
  }, async (request, reply) => {
    await adminService.suspendUser(request.params.userId, request.body, request.user.sub);
    return reply.send({ message: 'User suspended' });
  });

  // PATCH /api/v1/admin/users/:userId/unsuspend
  fastify.patch('/:userId/unsuspend', guard, async (request, reply) => {
    await adminService.unsuspendUser(request.params.userId, request.user.sub);
    return reply.send({ message: 'User unsuspended' });
  });

  // PATCH /api/v1/admin/users/:userId/verify  — verify professional profiles
  fastify.patch('/:userId/verify', guard, async (request, reply) => {
    await adminService.verifyUser(request.params.userId, request.user.sub);
    return reply.send({ message: 'User verified' });
  });

  // PATCH /api/v1/admin/users/:userId/promote-admin  — grant admin role
  fastify.patch('/:userId/promote-admin', guard, async (request, reply) => {
    await adminService.promoteToAdmin(request.params.userId, request.user.sub);
    return reply.send({ message: 'User promoted to admin' });
  });

  // PATCH /api/v1/admin/users/:userId/revoke-admin  — remove admin role
  fastify.patch('/:userId/revoke-admin', guard, async (request, reply) => {
    await adminService.revokeAdmin(request.params.userId, request.user.sub);
    return reply.send({ message: 'Admin role revoked' });
  });

  // DELETE /api/v1/admin/users/:userId  — permanent delete
  fastify.delete('/:userId', guard, async (request, reply) => {
    await adminService.deleteUser(request.params.userId, request.user.sub);
    return reply.send({ message: 'User deleted' });
  });

  // DELETE /api/v1/admin/users/:userId/photos/:photoId — admin delete a user's photo
  fastify.delete('/:userId/photos/:photoId', guard, async (request, reply) => {
    await adminService.deleteUserPhoto(request.params.photoId, request.params.userId);
    return reply.send({ message: 'Photo deleted' });
  });

  // POST /api/v1/admin/users/:userId/photos — upload a new photo for a user
  fastify.post('/:userId/photos', guard, async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const ext = (data.filename.split('.').pop() || '').toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      return reply.code(400).send({ error: 'Invalid file type. Allowed: jpg, jpeg, png, webp' });
    }

    const buffer = await data.toBuffer();
    if (buffer.length > 10 * 1024 * 1024) {
      return reply.code(400).send({ error: 'File too large (max 10 MB)' });
    }

    const photo = await adminService.addUserPhoto(request.params.userId, buffer, data.filename, data.mimetype);
    return reply.code(201).send(photo);
  });

  // PATCH /api/v1/admin/users/:userId/photos/reorder — update photo ordering
  fastify.patch('/:userId/photos/reorder', {
    ...guard,
    schema: {
      body: {
        type: 'object',
        required: ['orderedIds'],
        properties: { orderedIds: { type: 'array', items: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    await adminService.reorderPhotos(request.params.userId, request.body.orderedIds);
    return reply.send({ message: 'Photos reordered' });
  });

  // PATCH /api/v1/admin/users/:userId — edit profile fields
  fastify.patch('/:userId', guard, async (request, reply) => {
    await adminService.updateUserProfile(request.params.userId, request.body);
    return reply.send({ message: 'Profile updated' });
  });
};
