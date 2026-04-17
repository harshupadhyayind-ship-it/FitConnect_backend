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
    'preferred_gender_filter', 'preferred_training_time', 'latitude', 'longitude', 'location',
    'specialty', 'credentials', 'years_of_experience', 'session_rate',
    'prompt_philosophy', 'prompt_best_result', 'prompt_love_working',
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

// ── Photo Management ──────────────────────────────────────────────────────────

const MAX_PHOTOS = 6;

async function getPhotos(userId) {
  const { data, error } = await supabaseAdmin
    .from('profile_photos')
    .select('id, url, position')
    .eq('user_id', userId)
    .order('position', { ascending: true });

  if (error) throw new Error(error.message);
  return { photos: data || [] };
}

async function uploadPhoto(userId, file) {
  // Check current photo count
  const { count } = await supabaseAdmin
    .from('profile_photos')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (count >= MAX_PHOTOS) {
    throw Object.assign(new Error(`Maximum ${MAX_PHOTOS} photos allowed. Delete one before uploading.`), { statusCode: 400 });
  }

  // Find next available position
  const { data: existing } = await supabaseAdmin
    .from('profile_photos')
    .select('position')
    .eq('user_id', userId)
    .order('position', { ascending: true });

  const usedPositions = new Set((existing || []).map(p => p.position));
  let position = 1;
  while (usedPositions.has(position)) position++;

  // Detect extension — filename first, then mimetype, then default to jpg
  const extFromName = file.originalname?.split('.').pop()?.toLowerCase();
  const extFromMime = file.mimetype?.split('/')[1]?.replace('jpeg', 'jpg');
  const VALID_EXTS  = ['jpg', 'jpeg', 'png', 'webp', 'heic'];
  const ext = VALID_EXTS.includes(extFromName) ? extFromName
            : VALID_EXTS.includes(extFromMime) ? extFromMime
            : 'jpg';

  // Force correct content-type regardless of what client sends
  const MIME_MAP = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };
  const contentType = MIME_MAP[ext] || 'image/jpeg';

  // Fixed path per position — upsert overwrites instead of creating duplicates
  const path = `photos/${userId}/${position}.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('profile-photos')
    .upload(path, file.buffer, { contentType, upsert: true });

  if (uploadError) throw new Error(uploadError.message);

  const { data: urlData } = supabaseAdmin.storage.from('profile-photos').getPublicUrl(path);
  const url = urlData.publicUrl;

  // Insert into profile_photos
  const { data: photo, error: insertError } = await supabaseAdmin
    .from('profile_photos')
    .insert({ user_id: userId, url, position })
    .select()
    .single();

  if (insertError) throw new Error(insertError.message);

  // If this is position 1, update avatar_url on profile
  if (position === 1) {
    await supabaseAdmin.from('profiles').update({ avatar_url: url }).eq('id', userId);
  }

  return photo;
}

async function deletePhoto(userId, photoId) {
  const { data: photo, error: fetchError } = await supabaseAdmin
    .from('profile_photos')
    .select('id, url, position')
    .eq('id', photoId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !photo) {
    throw Object.assign(new Error('Photo not found'), { statusCode: 404 });
  }

  // Must keep at least 1 photo
  const { count } = await supabaseAdmin
    .from('profile_photos')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (count <= 1) {
    throw Object.assign(new Error('Cannot delete your only photo. Upload another one first.'), { statusCode: 400 });
  }

  // Delete from storage
  const storagePath = photo.url.split('/profile-photos/')[1];
  if (storagePath) {
    await supabaseAdmin.storage.from('profile-photos').remove([storagePath]);
  }

  // Delete from DB
  await supabaseAdmin.from('profile_photos').delete().eq('id', photoId);

  // If deleted photo was position 1, promote position 2 → 1 and update avatar_url
  if (photo.position === 1) {
    const { data: next } = await supabaseAdmin
      .from('profile_photos')
      .select('id, url, position')
      .eq('user_id', userId)
      .order('position', { ascending: true })
      .limit(1)
      .single();

    if (next) {
      await supabaseAdmin.from('profile_photos').update({ position: 1 }).eq('id', next.id);
      await supabaseAdmin.from('profiles').update({ avatar_url: next.url }).eq('id', userId);
    }
  }

  return { message: 'Photo deleted' };
}

async function reorderPhotos(userId, order) {
  // order: [{ id: 'uuid', position: 1 }, ...]
  if (!Array.isArray(order) || order.length === 0) {
    throw Object.assign(new Error('order must be a non-empty array'), { statusCode: 400 });
  }

  // Validate positions are 1–6 and unique
  const positions = order.map(o => o.position);
  if (positions.some(p => p < 1 || p > MAX_PHOTOS)) {
    throw Object.assign(new Error('Positions must be between 1 and 6'), { statusCode: 400 });
  }
  if (new Set(positions).size !== positions.length) {
    throw Object.assign(new Error('Duplicate positions not allowed'), { statusCode: 400 });
  }

  // Verify all photos belong to this user
  const ids = order.map(o => o.id);
  const { data: owned } = await supabaseAdmin
    .from('profile_photos')
    .select('id')
    .eq('user_id', userId)
    .in('id', ids);

  if (!owned || owned.length !== ids.length) {
    throw Object.assign(new Error('One or more photos not found'), { statusCode: 404 });
  }

  // Use temp positions to avoid UNIQUE constraint conflicts during update
  for (const { id, position } of order) {
    await supabaseAdmin.from('profile_photos').update({ position: position + 100 }).eq('id', id);
  }
  for (const { id, position } of order) {
    await supabaseAdmin.from('profile_photos').update({ position }).eq('id', id);
  }

  // Update avatar_url to whichever photo is now at position 1
  const pos1 = order.find(o => o.position === 1);
  if (pos1) {
    const { data: photo1 } = await supabaseAdmin
      .from('profile_photos').select('url').eq('id', pos1.id).single();
    if (photo1) {
      await supabaseAdmin.from('profiles').update({ avatar_url: photo1.url }).eq('id', userId);
    }
  }

  return getPhotos(userId);
}

async function replacePhoto(userId, photoId, file) {
  // Verify the photo belongs to this user
  const { data: photo, error: fetchError } = await supabaseAdmin
    .from('profile_photos')
    .select('id, url, position')
    .eq('id', photoId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !photo) {
    throw Object.assign(new Error('Photo not found'), { statusCode: 404 });
  }

  // Detect extension
  const extFromName = file.originalname?.split('.').pop()?.toLowerCase();
  const extFromMime = file.mimetype?.split('/')[1]?.replace('jpeg', 'jpg');
  const VALID_EXTS  = ['jpg', 'jpeg', 'png', 'webp', 'heic'];
  const ext = VALID_EXTS.includes(extFromName) ? extFromName
            : VALID_EXTS.includes(extFromMime) ? extFromMime
            : 'jpg';

  const MIME_MAP    = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };
  const contentType = MIME_MAP[ext] || 'image/jpeg';

  // Overwrite the file at the same position path
  const path = `photos/${userId}/${photo.position}.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('profile-photos')
    .upload(path, file.buffer, { contentType, upsert: true });

  if (uploadError) throw new Error(uploadError.message);

  // Add cache-buster so clients don't serve the old image from CDN cache
  const { data: urlData } = supabaseAdmin.storage.from('profile-photos').getPublicUrl(path);
  const url = `${urlData.publicUrl}?t=${Date.now()}`;

  // Update DB record with new URL
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('profile_photos')
    .update({ url, updated_at: new Date().toISOString() })
    .eq('id', photoId)
    .select()
    .single();

  if (updateError) throw new Error(updateError.message);

  // If position 1, keep avatar_url in sync
  if (photo.position === 1) {
    await supabaseAdmin.from('profiles').update({ avatar_url: url }).eq('id', userId);
  }

  return updated;
}

async function updateDeviceToken(userId, { token, platform }) {
  const { error } = await supabaseAdmin
    .from('device_tokens')
    .upsert({ user_id: userId, token, platform, updated_at: new Date().toISOString() }, { onConflict: 'user_id,platform' });

  if (error) throw new Error(error.message);
  return { message: 'Device token updated' };
}

module.exports = { getProfile, onboardIndividual, onboardProfessional, updateProfile, getPhotos, uploadPhoto, replacePhoto, deletePhoto, reorderPhotos, updateDeviceToken };
