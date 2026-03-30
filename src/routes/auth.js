const authService = require('../services/authService');

/**
 * AUTH ROUTES
 * ───────────
 * Firebase handles ALL sign-in flows on the mobile side.
 * The backend does NOT have endpoints for Google/Apple/Phone sign-in.
 *
 * Mobile flow (same for all providers):
 *   1. User signs in via Firebase SDK (Google / Apple / Phone OTP)
 *   2. Mobile gets Firebase ID token:
 *        Android: FirebaseAuth.getInstance().currentUser?.getIdToken(false)?.await()?.token
 *        iOS:     try await Auth.auth().currentUser?.getIDToken()
 *   3. Mobile calls POST /api/v1/auth/me  (Authorization: Bearer <firebase_id_token>)
 *      → Backend creates profile if new user, returns user info
 *   4. All subsequent requests include the same Bearer token
 *   5. Firebase SDK auto-refreshes the token every hour — no backend refresh needed
 */
module.exports = async function authRoutes(fastify) {

  /**
   * POST /api/v1/auth/me
   * Called ONCE after Firebase sign-in to register the user in Supabase DB.
   * Safe to call multiple times — idempotent.
   */
  fastify.post('/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub: firebaseUid, email, phone, name } = request.user;
    const result = await authService.registerOrFetchUser(firebaseUid, { email, phone, name });
    return reply.send(result);
  });

  /**
   * POST /api/v1/auth/signout
   * Revokes Firebase refresh tokens + removes push notification device tokens.
   * Mobile should also call FirebaseAuth.signOut() on the device after this.
   */
  fastify.post('/signout', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    await authService.signOut(request.user.sub);
    return reply.send({ message: 'Signed out successfully' });
  });
};
