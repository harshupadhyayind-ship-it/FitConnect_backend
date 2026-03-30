const authService      = require('../services/authService');
const phoneAuthService = require('../services/phoneAuthService');

/**
 * AUTH ROUTES
 * ───────────
 *
 * Google / Apple Sign-In → handled entirely by Firebase SDK on mobile.
 *                           No backend endpoint needed.
 *
 * Phone OTP             → handled by our backend (cheap SMS via Fast2SMS ~₹0.15/SMS)
 *                          NOT Firebase Phone Auth (which charges per SMS).
 *                          On success we issue a Firebase Custom Token (FREE).
 *                          Mobile uses it to sign into Firebase and get an ID token.
 *
 * All flows end the same way:
 *   Mobile has a Firebase ID token → POST /api/v1/auth/me → backend registers user
 */
module.exports = async function authRoutes(fastify) {

  // ── POST /api/v1/auth/me ────────────────────────────────────────────────────
  // Called once after any Firebase sign-in (Google, Apple, or Phone OTP custom flow).
  // Registers user in Supabase DB if new. Safe to call multiple times (idempotent).
  fastify.post('/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub: firebaseUid, email, phone, name } = request.user;
    const result = await authService.registerOrFetchUser(firebaseUid, { email, phone, name });
    return reply.send(result);
  });

  // ── POST /api/v1/auth/phone/send-otp ───────────────────────────────────────
  // Sends a 6-digit OTP via Fast2SMS (~₹0.15/SMS). Rate limited: 1 per 60 seconds.
  fastify.post('/phone/send-otp', {
    schema: {
      body: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string' }, // E.164 format: +919876543210
        },
      },
    },
  }, async (request, reply) => {
    await phoneAuthService.sendPhoneOtp(request.body.phone);
    return reply.send({ message: 'OTP sent successfully' });
  });

  // ── POST /api/v1/auth/phone/verify-otp ─────────────────────────────────────
  // Verifies the OTP. On success returns a Firebase Custom Token.
  // Mobile calls: FirebaseAuth.signInWithCustomToken(custom_token)
  // → Gets a Firebase ID token → calls POST /api/v1/auth/me
  fastify.post('/phone/verify-otp', {
    schema: {
      body: {
        type: 'object',
        required: ['phone', 'otp'],
        properties: {
          phone: { type: 'string' },
          otp:   { type: 'string', minLength: 6, maxLength: 6 },
        },
      },
    },
  }, async (request, reply) => {
    const result = await phoneAuthService.verifyPhoneOtp(request.body.phone, request.body.otp);
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
