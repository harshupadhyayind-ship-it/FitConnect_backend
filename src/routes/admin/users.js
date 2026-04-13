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
};
