const { getFirebaseAdmin } = require('../config/firebase');
const { supabaseAdmin } = require('../config/supabase');

/**
 * AUTH ARCHITECTURE
 * ─────────────────
 * Firebase handles 100% of authentication:
 *   • Google Sign-In    — FirebaseAuth.signInWithCredential(GoogleAuthProvider.credential(...))
 *   • Apple Sign-In     — FirebaseAuth.signInWithCredential(OAuthProvider("apple.com").credential(...))
 *   • Phone OTP         — FirebaseAuth.signInWithPhoneNumber("+91...") → verifyCode()
 *
 * The mobile app never calls a backend endpoint to sign in.
 * After any Firebase sign-in, the SDK gives an ID token (valid 1 hr, auto-refreshed by SDK).
 *
 * Every API request:  Authorization: Bearer <firebase_id_token>
 * Backend verifies:   admin.auth().verifyIdToken(token)  → gets Firebase UID
 * User identifier:    Firebase UID (stored as profiles.id in Supabase)
 *
 * The backend has ONE auth endpoint: POST /api/v1/auth/me
 * Called once after Firebase sign-in to register the user in our Supabase DB.
 */

/**
 * Called after the mobile app signs in with Firebase.
 * Creates a profile record in Supabase if this is a new user.
 * Returns { user_id, is_new_user, onboarding_completed }
 */
async function registerOrFetchUser(firebaseUid, { email, phone, name }) {
  // Check if profile exists
  const { data: existing } = await supabaseAdmin
    .from('profiles')
    .select('id, onboarding_completed, user_type, is_admin')
    .eq('id', firebaseUid)
    .single();

  if (existing) {
    return {
      user_id:               existing.id,
      is_new_user:           false,
      onboarding_completed:  existing.onboarding_completed,
      user_type:             existing.user_type,
      is_admin:              existing.is_admin || false,
    };
  }

  // New user — create a minimal profile row
  const { error } = await supabaseAdmin.from('profiles').insert({
    id:                   firebaseUid,
    name:                 name   || null,
    email:                email  || null,
    phone:                phone  || null,
    onboarding_completed: false,
  });

  if (error) throw new Error('Failed to create user profile: ' + error.message);

  return {
    user_id:              firebaseUid,
    is_new_user:          true,
    onboarding_completed: false,
    user_type:            null,
  };
}

/**
 * Revokes Firebase tokens + removes device tokens from DB.
 * Mobile should also call FirebaseAuth.signOut() on the device.
 */
async function signOut(firebaseUid) {
  // Revoke all Firebase refresh tokens for this user
  try {
    const admin = getFirebaseAdmin();
    await admin.auth().revokeRefreshTokens(firebaseUid);
  } catch {
    // Best-effort — don't fail the request if revocation fails
  }

  // Remove device push tokens so they stop receiving notifications
  await supabaseAdmin.from('device_tokens').delete().eq('user_id', firebaseUid);
}

/**
 * Deletes the Firebase Auth account.
 * Called from the admin panel user delete flow.
 */
async function deleteFirebaseUser(firebaseUid) {
  try {
    const admin = getFirebaseAdmin();
    await admin.auth().deleteUser(firebaseUid);
  } catch (err) {
    console.error('[Auth] Firebase user delete error:', err.message);
  }
}

module.exports = { registerOrFetchUser, signOut, deleteFirebaseUser };
