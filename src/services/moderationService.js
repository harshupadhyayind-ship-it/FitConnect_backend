const { supabaseAdmin } = require('../config/supabase');

async function listReports({ status, type, page, limit }) {
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('reports')
    .select(`
      id, type, reason, status, created_at,
      reporter:reporter_id(id, name, avatar_url),
      reported_user:reported_user_id(id, name, avatar_url, is_banned),
      reported_message:reported_message_id(id, content, created_at)
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (type)   query = query.eq('type', type);

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return { reports: data || [], total: count, page, limit };
}

async function getReport(reportId) {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select(`
      *,
      reporter:reporter_id(id, name, avatar_url),
      reported_user:reported_user_id(id, name, avatar_url, is_banned, ban_reason),
      reported_message:reported_message_id(id, content, created_at, sender_id)
    `)
    .eq('id', reportId)
    .single();

  if (error) throw Object.assign(new Error('Report not found'), { status: 404 });
  return data;
}

async function resolveReport(reportId, { action, notes }, adminId) {
  const { error } = await supabaseAdmin
    .from('reports')
    .update({
      status:      'resolved',
      action_taken: action || 'none',
      admin_notes: notes,
      resolved_by: adminId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', reportId);

  if (error) throw new Error(error.message);
}

async function dismissReport(reportId, adminId) {
  const { error } = await supabaseAdmin
    .from('reports')
    .update({
      status:      'dismissed',
      resolved_by: adminId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', reportId);

  if (error) throw new Error(error.message);
}

async function getFlaggedMessages(page, limit) {
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('reports')
    .select(`
      id, reason, created_at,
      reporter:reporter_id(id, name),
      reported_message:reported_message_id(id, content, created_at, sender_id, match_id)
    `, { count: 'exact' })
    .eq('type', 'message')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return { flagged_messages: data || [], total: count, page, limit };
}

module.exports = { listReports, getReport, resolveReport, dismissReport, getFlaggedMessages };
