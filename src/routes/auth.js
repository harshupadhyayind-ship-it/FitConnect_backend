const authService = require('../services/authService');

/**
 * AUTH ROUTES
 * ───────────
 *
 * All auth (Google, Apple, Phone OTP) is handled by Firebase SDK on the client.
 * After Firebase sign-in, mobile sends the Firebase ID token to POST /auth/me.
 */
module.exports = async function authRoutes(fastify) {

  // ── POST /api/v1/auth/me ────────────────────────────────────────────────────
  // Called after any Firebase sign-in (Google, Apple, Phone).
  // Registers user in Supabase if new. Safe to call multiple times (idempotent).
  fastify.post('/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub: firebaseUid, email, phone, name } = request.user;
    const result = await authService.registerOrFetchUser(firebaseUid, { email, phone, name });
    return reply.send(result);
  });

  // ── POST /api/v1/auth/signout ───────────────────────────────────────────────
  // Revokes Firebase refresh tokens + removes push notification device tokens.
  // Mobile must also call FirebaseAuth.signOut() on the device.
  fastify.post('/signout', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    await authService.signOut(request.user.sub);
    return reply.send({ message: 'Signed out successfully' });
  });
};
