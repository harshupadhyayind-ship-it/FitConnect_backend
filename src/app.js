const fastify = require('fastify')({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});

// ─── Core plugins ─────────────────────────────────────────────────────────────
fastify.register(require('@fastify/helmet'));

fastify.register(require('@fastify/cors'), {
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return cb(null, true);

    const allowed = [
      'http://localhost:5173',   // Admin panel dev
      'http://localhost:4173',   // Admin panel preview
      ...(process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || []),
    ];

    if (allowed.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origin not allowed'), false);
  },
  credentials: true,
});

fastify.register(require('@fastify/rate-limit'), {
  global: false,
  max: 200,
  timeWindow: '1 minute',
});

fastify.register(require('@fastify/multipart'), {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// ─── Firebase authenticate decorator ─────────────────────────────────────────
// Verifies the Firebase ID token from Authorization: Bearer <token>
// Populates request.user = { sub (Firebase UID), email, phone, name }
const { authenticate } = require('./middleware/auth');
fastify.decorate('authenticate', authenticate);

// ─── Admin-only decorator — always chain after authenticate ───────────────────
const { adminOnly } = require('./middleware/adminAuth');
fastify.decorate('adminOnly', adminOnly);

// ─── Stricter rate limit for auth routes ──────────────────────────────────────
const authRateLimit = { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } };

// ─── Route registration ───────────────────────────────────────────────────────
fastify.register(require('./routes/auth'),          { prefix: '/api/v1/auth',          ...authRateLimit });
fastify.register(require('./routes/home'),          { prefix: '/api/v1/home' });
fastify.register(require('./routes/trainers'),      { prefix: '/api/v1/trainers' });
fastify.register(require('./routes/profiles'),      { prefix: '/api/v1/profiles' });
fastify.register(require('./routes/checkin'),       { prefix: '/api/v1/checkin' });
fastify.register(require('./routes/discovery'),     { prefix: '/api/v1/discovery' });
fastify.register(require('./routes/matching'),      { prefix: '/api/v1/matching' });
fastify.register(require('./routes/explore'),       { prefix: '/api/v1/explore' });
fastify.register(require('./routes/messages'),      { prefix: '/api/v1/messages' });
fastify.register(require('./routes/enquiries'),     { prefix: '/api/v1/enquiries' });
fastify.register(require('./routes/notifications'), { prefix: '/api/v1/notifications' });
fastify.register(require('./routes/admin/index'),   { prefix: '/api/v1/admin' });

// ─── Health check ─────────────────────────────────────────────────────────────
fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Global error handler ─────────────────────────────────────────────────────
fastify.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  reply.code(error.statusCode || 500).send({ error: error.message || 'Internal Server Error' });
});

// ─── 404 handler ──────────────────────────────────────────────────────────────
fastify.setNotFoundHandler((request, reply) => {
  reply.code(404).send({ error: 'Route not found' });
});

module.exports = fastify;
