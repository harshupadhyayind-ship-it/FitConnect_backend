const { supabaseAdmin } = require('../config/supabase');

/**
 * Register interest in FitConnect Pro. Only professional accounts can
 * register. Idempotent — calling again just returns the original timestamp.
 */
async function registerInterest(userId) {
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('id, user_type').eq('id', userId).single();

  if (!profile) throw Object.assign(new Error('Profile not found'), { status: 404 });
  if (profile.user_type !== 'professional') {
    throw Object.assign(new Error('Only professional accounts can register interest in Pro'), { status: 403 });
  }

  const { data: existing } = await supabaseAdmin
    .from('pro_interest').select('created_at').eq('user_id', userId).maybeSingle();

  if (existing) {
    return { registered: true, already_registered: true, registered_at: existing.created_at };
  }

  const { data, error } = await supabaseAdmin
    .from('pro_interest')
    .insert({ user_id: userId })
    .select('created_at')
    .single();

  if (error) throw new Error(error.message);
  return { registered: true, already_registered: false, registered_at: data.created_at };
}

async function getMyInterestStatus(userId) {
  const { data } = await supabaseAdmin
    .from('pro_interest').select('created_at').eq('user_id', userId).maybeSingle();

  return { registered: !!data, registered_at: data?.created_at || null };
}

async function withdrawInterest(userId) {
  const { error } = await supabaseAdmin.from('pro_interest').delete().eq('user_id', userId);
  if (error) throw new Error(error.message);
  return { withdrawn: true };
}

/**
 * Admin panel — paginated list of professionals who registered interest.
 */
async function listInterestRegistrations({ page, limit }) {
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('pro_interest')
    .select(`
      id, created_at,
      user:user_id(id, name, email, phone, avatar_url, specialty, location)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return { registrations: data || [], total: count, page, limit, has_more: offset + limit < count };
}

module.exports = { registerInterest, getMyInterestStatus, withdrawInterest, listInterestRegistrations };
