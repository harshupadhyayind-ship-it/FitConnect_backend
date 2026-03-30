const crypto = require('crypto');
const { supabaseAdmin } = require('../config/supabase');
const { getFirebaseAdmin } = require('../config/firebase');
const { sendOtp } = require('./smsService');

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS   = 5;

/**
 * Generates a 6-digit OTP, stores a hash in DB, sends SMS.
 * Rate-limited to 1 OTP per phone per minute.
 */
async function sendPhoneOtp(phone) {
  // Rate limit — block if OTP was sent less than 60 seconds ago
  const { data: recent } = await supabaseAdmin
    .from('phone_otps')
    .select('created_at')
    .eq('phone', phone)
    .eq('verified', false)
    .gte('created_at', new Date(Date.now() - 60 * 1000).toISOString())
    .single();

  if (recent) {
    throw Object.assign(new Error('Please wait 60 seconds before requesting a new OTP'), { statusCode: 429 });
  }

  // Generate 6-digit OTP
  const otp = String(Math.floor(100000 + Math.random() * 900000));

  // Hash the OTP before storing (never store plain OTPs)
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  // Invalidate any previous unverified OTPs for this phone
  await supabaseAdmin
    .from('phone_otps')
    .update({ verified: true })       // mark old ones as used
    .eq('phone', phone)
    .eq('verified', false);

  // Store new OTP
  const { error } = await supabaseAdmin.from('phone_otps').insert({
    phone,
    otp:        otpHash,
    expires_at: expiresAt,
  });

  if (error) throw new Error('Failed to store OTP: ' + error.message);

  // Send SMS
  await sendOtp(phone, otp);
}

/**
 * Verifies the OTP entered by the user.
 * On success:
 *   1. Finds or creates the user's profile in Supabase
 *   2. Creates a Firebase Custom Token (free, no SMS cost)
 *   3. Returns the custom token to the mobile app
 *
 * Mobile then calls: FirebaseAuth.signInWithCustomToken(customToken)
 * → Gets a standard Firebase ID token
 * → Calls POST /api/v1/auth/me as usual
 */
async function verifyPhoneOtp(phone, otp) {
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

  // Find the latest unverified OTP for this phone
  const { data: record, error } = await supabaseAdmin
    .from('phone_otps')
    .select('id, otp, expires_at, attempts')
    .eq('phone', phone)
    .eq('verified', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !record) {
    throw Object.assign(new Error('No active OTP found for this number. Please request a new one.'), { statusCode: 400 });
  }

  // Check expiry
  if (new Date(record.expires_at) < new Date()) {
    throw Object.assign(new Error('OTP has expired. Please request a new one.'), { statusCode: 400 });
  }

  // Check attempt limit
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    throw Object.assign(new Error('Too many incorrect attempts. Please request a new OTP.'), { statusCode: 429 });
  }

  // Verify OTP hash
  if (record.otp !== otpHash) {
    // Increment attempt counter
    await supabaseAdmin
      .from('phone_otps')
      .update({ attempts: record.attempts + 1 })
      .eq('id', record.id);

    const remaining = OTP_MAX_ATTEMPTS - record.attempts - 1;
    throw Object.assign(
      new Error(`Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`),
      { statusCode: 400 }
    );
  }

  // Mark OTP as verified
  await supabaseAdmin.from('phone_otps').update({ verified: true }).eq('id', record.id);

  // Find or create user profile in Supabase
  const userId = await _getOrCreateUserByPhone(phone);

  // Create Firebase Custom Token (FREE — no SMS cost)
  // Mobile will call FirebaseAuth.signInWithCustomToken(this token)
  // to get a standard Firebase ID token
  const admin = getFirebaseAdmin();
  const customToken = await admin.auth().createCustomToken(userId, { phone });

  return {
    custom_token: customToken,   // mobile uses this with Firebase SDK
    phone,
    user_id: userId,
  };
}

/**
 * Finds an existing profile by phone or creates a new Firebase Auth user + profile.
 */
async function _getOrCreateUserByPhone(phone) {
  // Check if profile with this phone already exists
  const { data: existing } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('phone', phone)
    .single();

  if (existing) return existing.id;

  // Create a new Firebase Auth user for this phone
  const admin = getFirebaseAdmin();
  let firebaseUser;

  try {
    // Try to find existing Firebase user by phone
    firebaseUser = await admin.auth().getUserByPhoneNumber(phone);
  } catch {
    // Create new Firebase user
    firebaseUser = await admin.auth().createUser({
      phoneNumber: phone,
      displayName: phone,
    });
  }

  // Create profile in Supabase
  const { error } = await supabaseAdmin.from('profiles').insert({
    id:                   firebaseUser.uid,
    phone,
    onboarding_completed: false,
  });

  if (error) throw new Error('Failed to create profile: ' + error.message);

  return firebaseUser.uid;
}

module.exports = { sendPhoneOtp, verifyPhoneOtp };
