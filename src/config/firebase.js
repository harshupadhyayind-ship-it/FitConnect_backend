const admin = require('firebase-admin');

let initialized = false;

/**
 * Returns the initialized Firebase Admin instance.
 * Lazy-initialized on first call so missing env vars don't crash at startup.
 */
function getFirebaseAdmin() {
  if (!initialized) {
    if (!process.env.FIREBASE_PROJECT_ID) {
      throw new Error('FIREBASE_PROJECT_ID is not set in .env');
    }
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
    initialized = true;
  }
  return admin;
}

module.exports = { getFirebaseAdmin };
