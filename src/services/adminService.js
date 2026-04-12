const { supabaseAdmin } = require('../config/supabase');
const { deleteFirebaseUser } = require('./authService');

async function listUsers({ search, user_type, status, page, limit }) {
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('profiles')
    .select(`
      id, name, email:id, avatar_url, user_type,
      fitness_goals, fitness_level, gender,
      current_streak, total_checkins,
      is_banned, is_suspended, suspension_until, is_verified,
      onboarding_completed, created_at
    `, { count: 'exact' });

  if (search) {
    query = query.ilike('name', `%${search}%`);
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
        id, name, bio, avatar_url, user_type,
        fitness_goals, fitness_level, workout_types, gender,
        height_cm, weight_kg, preferred_gender_filter,
        specialty, credentials,
        current_streak, longest_streak, total_checkins,
        latitude, longitude,
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

async function deleteUser(userId, adminId) {
  await _logAdminAction(adminId, userId, 'delete', {});
  // Delete from Supabase DB (cascades to all related tables via FK)
  const { error } = await supabaseAdmin.from('profiles').delete().eq('id', userId);
  if (error) throw new Error(error.message);
  // Delete Firebase Auth account
  await deleteFirebaseUser(userId);
}

async function _logAdminAction(adminId, targetUserId, action, metadata) {
  await supabaseAdmin.from('admin_action_logs').insert({
    admin_id: adminId,
    target_user_id: targetUserId,
    action,
    metadata,
  });
}

module.exports = { listUsers, getUserDetail, banUser, unbanUser, suspendUser, unsuspendUser, verifyUser, deleteUser };
