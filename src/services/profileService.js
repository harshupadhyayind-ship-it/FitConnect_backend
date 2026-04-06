const { supabaseAdmin } = require('../config/supabase');

async function getProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(`
      id, name, bio, avatar_url, user_type,
      fitness_goals, fitness_level, workout_types, gender,
      height_cm, weight_kg, preferred_gender_filter,
      specialty, credentials,
      current_streak, longest_streak, total_checkins,
      latitude, longitude,
      created_at, updated_at
    `)
    .eq('id', userId)
    .single();

  if (error) throw Object.assign(new Error(error.message), { status: 404 });
  return data;
}

async function onboardIndividual(userId, body) {
  const {
    name, date_of_birth, gender, fitness_goals, fitness_level, workout_types,
    height_cm, weight_kg, preferred_gender_filter, bio, latitude, longitude,
  } = body;

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: userId,
      user_type: 'individual',
      name, date_of_birth, gender, fitness_goals, fitness_level, workout_types,
      height_cm, weight_kg, preferred_gender_filter: preferred_gender_filter || 'everyone',
      bio, latitude, longitude,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function onboardProfessional(userId, body) {
  const { name, specialty, bio, credentials, latitude, longitude } = body;

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: userId,
      user_type: 'professional',
      name, specialty, bio, credentials, latitude, longitude,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function updateProfile(userId, updates) {
  // Only allow safe fields to be updated
  const allowed = [
    'name', 'bio', 'fitness_goals', 'fitness_level', 'workout_types', 'height_cm', 'weight_kg',
    'preferred_gender_filter', 'latitude', 'longitude', 'specialty', 'credentials',
  ];
  const sanitized = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) sanitized[key] = updates[key];
  }
  sanitized.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(sanitized)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function uploadPhoto(userId, file) {
  const ext = file.mimetype.split('/')[1] || 'jpg';
  const path = `avatars/${userId}/profile.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('profile-photos')
    .upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (uploadError) throw new Error(uploadError.message);

  const { data: urlData } = supabaseAdmin.storage.from('profile-photos').getPublicUrl(path);
  const avatar_url = urlData.publicUrl;

  // Update profile with new avatar URL
  await supabaseAdmin.from('profiles').update({ avatar_url }).eq('id', userId);

  return { avatar_url };
}

async function updateDeviceToken(userId, { token, platform }) {
  const { error } = await supabaseAdmin
    .from('device_tokens')
    .upsert({ user_id: userId, token, platform, updated_at: new Date().toISOString() }, { onConflict: 'user_id,platform' });

  if (error) throw new Error(error.message);
  return { message: 'Device token updated' };
}

module.exports = { getProfile, onboardIndividual, onboardProfessional, updateProfile, uploadPhoto, updateDeviceToken };
