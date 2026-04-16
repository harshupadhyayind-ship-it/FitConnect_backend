const { supabaseAdmin } = require('../config/supabase');
const { deleteFirebaseUser } = require('./authService');

async function listUsers({ search, user_type, status, page, limit }) {
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('profiles')
    .select(`
      id, name, email, phone, avatar_url, user_type,
      fitness_goals, fitness_level, gender,
      current_streak, total_checkins,
      is_banned, is_suspended, suspension_until, is_verified,
      onboarding_completed, created_at
    `, { count: 'exact' });

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }
  if (user_type) {
    query = query.eq('user_type', user_type);
  }
  if (status === 'banned') {
    query = query.eq('is_banned', true);
  } else if (status === 'suspended') {
    query = query.eq('is_suspended', true);
  } else if (status === 'active') {
    query = query.eq('is_banned', false).eq('is_suspended', false);
  } else if (status === 'verified') {
    query = query.eq('is_verified', true);

  } else if (status === 'active_today') {
    const today = new Date().toISOString().split('T')[0];
    const { data: rows } = await supabaseAdmin
      .from('checkins').select('user_id').eq('date', today);
    const ids = [...new Set((rows || []).map(r => r.user_id))];
    query = ids.length ? query.in('id', ids) : query.eq('id', 'no-results');

  } else if (status === 'new_this_week') {
    // Same logic as dashboard: profiles created in last 7 days
    const since = new Date(); since.setDate(since.getDate() - 7);
    query = query.gte('created_at', since.toISOString());

  } else if (status === 'monthly_active') {
    // Same logic as dashboard: distinct users who checked in since the 1st of this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const { data: rows } = await supabaseAdmin
      .from('checkins').select('user_id').gte('date', monthStart);
    const ids = [...new Set((rows || []).map(r => r.user_id))];
    query = ids.length ? query.in('id', ids) : query.eq('id', 'no-results');

  } else if (status === 'has_matches') {
    const { data: rows } = await supabaseAdmin
      .from('matches').select('user1_id, user2_id');
    const ids = [...new Set((rows || []).flatMap(m => [m.user1_id, m.user2_id]))];
    query = ids.length ? query.in('id', ids) : query.eq('id', 'no-results');
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return { users: data || [], total: count, page, limit, has_more: offset + limit < count };
}

async function getUserDetail(userId) {
  const [
    { data: profile },
    { data: badges },
    { data: checkins },
    { count: matchCount },
    { data: photos },
  ] = await Promise.all([
    supabaseAdmin.from('profiles')
      .select(`
        id, name, email, phone, bio, avatar_url, user_type,
        fitness_goals, fitness_level, workout_types, gender,
        height_cm, weight_kg, preferred_gender_filter,
        specialty, specialties, credentials,
        years_of_experience, session_rate,
        prompt_philosophy, prompt_best_result, prompt_love_working,
        current_streak, longest_streak, total_checkins,
        latitude, longitude, location,
        date_of_birth, onboarding_completed,
        is_banned, is_suspended, suspension_until, ban_reason,
        is_verified, is_admin,
        created_at, updated_at
      `)
      .eq('id', userId)
      .single(),
    supabaseAdmin.from('user_badges').select('badge_type, earned_at').eq('user_id', userId),
    supabaseAdmin.from('checkins').select('date').eq('user_id', userId).order('date', { ascending: false }).limit(30),
    supabaseAdmin.from('matches')
      .select('id', { count: 'exact', head: true })
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
    supabaseAdmin.from('profile_photos')
      .select('id, url, position')
      .eq('user_id', userId)
      .order('position', { ascending: true }),
  ]);

  if (!profile) throw Object.assign(new Error('User not found'), { status: 404 });
  return {
    ...profile,
    badges: badges || [],
    recent_checkins: checkins || [],
    total_matches: matchCount || 0,
    photos: photos || [],
  };
}

async function banUser(userId, reason, adminId) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ is_banned: true, ban_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw new Error(error.message);
  await _logAdminAction(adminId, userId, 'ban', { reason });

  // Revoke all Firebase sessions for this user
  const { getFirebaseAdmin } = require('../config/firebase');
  await getFirebaseAdmin().auth().revokeRefreshTokens(userId);
}

async function unbanUser(userId, adminId) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ is_banned: false, ban_reason: null, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw new Error(error.message);
  await _logAdminAction(adminId, userId, 'unban', {});
  // User can sign back in via Firebase — no action needed on Firebase side
}

async function suspendUser(userId, { reason, suspend_until }, adminId) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ is_suspended: true, ban_reason: reason, suspension_until: suspend_until, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw new Error(error.message);
  await _logAdminAction(adminId, userId, 'suspend', { reason, suspend_until });
}

async function unsuspendUser(userId, adminId) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ is_suspended: false, suspension_until: null, ban_reason: null, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw new Error(error.message);
  await _logAdminAction(adminId, userId, 'unsuspend', {});
}

async function verifyUser(userId, adminId) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ is_verified: true, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw new Error(error.message);
  await _logAdminAction(adminId, userId, 'verify', {});
}

async function promoteToAdmin(userId, adminId) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ is_admin: true, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw new Error(error.message);
  await _logAdminAction(adminId, userId, 'promote_to_admin', {});
}

async function revokeAdmin(userId, adminId) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ is_admin: false, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw new Error(error.message);
  await _logAdminAction(adminId, userId, 'revoke_admin', {});
}

async function deleteUser(userId, adminId) {
  await _logAdminAction(adminId, userId, 'delete', {});
  // Delete from Supabase DB (cascades to all related tables via FK)
  const { error } = await supabaseAdmin.from('profiles').delete().eq('id', userId);
  if (error) throw new Error(error.message);
  // Delete Firebase Auth account
  await deleteFirebaseUser(userId);
}

async function addUserPhoto(userId, buffer, filename, mimetype) {
  // Check current count
  const { data: existing, error: countErr } = await supabaseAdmin
    .from('profile_photos').select('id, position').eq('user_id', userId).order('position', { ascending: true });
  if (countErr) throw new Error(countErr.message);
  if (existing && existing.length >= 6) throw Object.assign(new Error('Maximum 6 photos allowed'), { status: 400 });

  const nextPosition = existing && existing.length > 0 ? Math.max(...existing.map(p => p.position)) + 1 : 1;

  // Upload to storage
  const ext = (filename.split('.').pop() || 'jpg').toLowerCase();
  const storagePath = `${userId}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('profile-photos').upload(storagePath, buffer, { contentType: mimetype, upsert: false });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: { publicUrl } } = supabaseAdmin.storage.from('profile-photos').getPublicUrl(storagePath);

  const { data: photo, error: insertErr } = await supabaseAdmin
    .from('profile_photos').insert({ user_id: userId, url: publicUrl, position: nextPosition }).select().single();
  if (insertErr) throw new Error(insertErr.message);

  // If first photo, set as avatar
  if (nextPosition === 1) {
    await supabaseAdmin.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);
  }

  return photo;
}

async function reorderPhotos(userId, orderedIds) {
  // Step 1: set temp positions (100+) to avoid unique-constraint conflicts during swap
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabaseAdmin
      .from('profile_photos').update({ position: 100 + i }).eq('id', orderedIds[i]).eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  // Step 2: set final positions
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabaseAdmin
      .from('profile_photos').update({ position: i + 1 }).eq('id', orderedIds[i]).eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  // Update avatar_url to whichever photo is now position 1
  const { data: first } = await supabaseAdmin
    .from('profile_photos').select('url').eq('user_id', userId).eq('position', 1).single();
  if (first) {
    await supabaseAdmin.from('profiles').update({ avatar_url: first.url }).eq('id', userId);
  }
}

async function updateUserProfile(userId, fields) {
  const ALLOWED = ['name', 'email', 'phone', 'bio', 'gender', 'date_of_birth',
                   'height_cm', 'weight_kg', 'fitness_level', 'fitness_goals',
                   'workout_types', 'specialty', 'specialties', 'credentials', 'user_type',
                   'preferred_gender_filter', 'preferred_training_time', 'location',
                   'years_of_experience', 'session_rate',
                   'prompt_philosophy', 'prompt_best_result', 'prompt_love_working'];

  const update = {};
  for (const key of ALLOWED) {
    if (fields[key] !== undefined) update[key] = fields[key] === '' ? null : fields[key];
  }
  if (Object.keys(update).length === 0) throw new Error('No valid fields to update');

  update.updated_at = new Date().toISOString();
  const { error } = await supabaseAdmin.from('profiles').update(update).eq('id', userId);
  if (error) throw new Error(error.message);
}

async function deleteUserPhoto(photoId, targetUserId) {
  const { data: photo, error: fetchError } = await supabaseAdmin
    .from('profile_photos')
    .select('id, url, position, user_id')
    .eq('id', photoId)
    .single();

  if (fetchError || !photo) throw Object.assign(new Error('Photo not found'), { status: 404 });

  // Delete from storage
  const storagePath = photo.url.split('/profile-photos/')[1];
  if (storagePath) {
    await supabaseAdmin.storage.from('profile-photos').remove([decodeURIComponent(storagePath)]);
  }

  // Delete from DB
  await supabaseAdmin.from('profile_photos').delete().eq('id', photoId);

  // If deleted photo was position 1, promote next photo to position 1 + update avatar_url
  if (photo.position === 1) {
    const { data: next } = await supabaseAdmin
      .from('profile_photos')
      .select('id, url')
      .eq('user_id', photo.user_id)
      .order('position', { ascending: true })
      .limit(1)
      .single();

    if (next) {
      await supabaseAdmin.from('profile_photos').update({ position: 1 }).eq('id', next.id);
      await supabaseAdmin.from('profiles').update({ avatar_url: next.url }).eq('id', photo.user_id);
    } else {
      await supabaseAdmin.from('profiles').update({ avatar_url: null }).eq('id', photo.user_id);
    }
  }

  return { message: 'Photo deleted' };
}

async function _logAdminAction(adminId, targetUserId, action, metadata) {
  await supabaseAdmin.from('admin_action_logs').insert({
    admin_id: adminId,
    target_user_id: targetUserId,
    action,
    metadata,
  });
}

module.exports = { listUsers, getUserDetail, banUser, unbanUser, suspendUser, unsuspendUser, verifyUser, promoteToAdmin, revokeAdmin, deleteUser, deleteUserPhoto, addUserPhoto, reorderPhotos, updateUserProfile };
