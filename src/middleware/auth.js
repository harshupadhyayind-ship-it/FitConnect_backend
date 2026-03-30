const { getFirebaseAdmin } = require('../config/firebase');

/**
 * Firebase token verification middleware.
 *
 * All protected routes use:  { onRequest: [fastify.authenticate] }
 *
 * The mobile app (Android/iOS) gets the Firebase ID token from Firebase SDK:
 *   Android: firebaseUser.getIdToken(false).await().token
 *   iOS:     try await user.getIDToken()
 *
 * The token is refreshed automatically by the Firebase SDK when it expires (every 1 hour).
 * No refresh endpoint is needed on our backend — Firebase handles it.
 *
 * After verification, request.user is populated with:
 *   sub   — Firebase UID (used as the user identifier throughout the app)
 *   email — user's email (if available, e.g. Google/Apple sign-in)
 *   phone — user's phone number (if available, e.g. phone OTP sign-in)
 */
async function authenticate(request, reply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const admin = getFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(token);
    request.user = {
      sub:   decoded.uid,                  // Firebase UID — primary user identifier
      email: decoded.email        || null,
      phone: decoded.phone_number || null,
      name:  decoded.name         || null,
    };
  } catch (err) {
    return reply.code(401).send({ error: 'Invalid or expired Firebase token' });
  }
}

module.exports = { authenticate };
