module.exports = async function adminRoutes(fastify) {
  fastify.register(require('./users'),         { prefix: '/users' });
  fastify.register(require('./moderation'),    { prefix: '/moderation' });
  fastify.register(require('./analytics'),     { prefix: '/analytics' });
  fastify.register(require('./broadcast'),     { prefix: '/notifications' });
  fastify.register(require('./events'),        { prefix: '/events' });
};
