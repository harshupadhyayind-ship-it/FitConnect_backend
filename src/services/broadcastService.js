const { getFirebaseAdmin } = require('../config/firebase');
const { supabaseAdmin } = require('../config/supabase');

/**
 * Sends a push notification to all users matching the given filters.
 * Uses FCM sendEachForMulticast for batched delivery (max 500 tokens per batch).
 */
async function sendBroadcast({ title, body, filters = {}, data = {} }, adminId) {
  // 1. Build device token query with optional filters
  let query = supabaseAdmin
    .from('device_tokens')
    .select('token, platform, user_id, profile:user_id(user_type, fitness_level, fitness_goals)');

  if (filters.platform) query = query.eq('platform', filters.platform);

  const { data: tokenRows, error } = await query;
  if (error) throw new Error(error.message);

  // 2. Apply profile-level filters in memory
  let filtered = tokenRows || [];
  if (filters.user_type) {
    filtered = filtered.filter(r => r.profile?.user_type === filters.user_type);
  }
  if (filters.fitness_level) {
    filtered = filtered.filter(r => r.profile?.fitness_level === filters.fitness_level);
  }
  if (filters.fitness_goal) {
    filtered = filtered.filter(r => r.profile?.fitness_goals?.includes(filters.fitness_goal));
  }

  const tokens = filtered.map(r => r.token);
  if (tokens.length === 0) {
    return { sent: 0, failed: 0, message: 'No matching devices found' };
  }

  // 3. Send in batches of 500 (FCM limit)
  const firebase = getFirebaseAdmin();
  let totalSent = 0;
  let totalFailed = 0;
  const staleTokens = [];

  const BATCH_SIZE = 500;
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const message = {
      tokens: batch,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    };

    const response = await firebase.messaging().sendEachForMulticast(message);
    totalSent += response.successCount;
    totalFailed += response.failureCount;

    // Collect stale tokens
    response.responses.forEach((r, idx) => {
      if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
        staleTokens.push(batch[idx]);
      }
    });
  }

  // 4. Remove stale tokens
  if (staleTokens.length > 0) {
    await supabaseAdmin.from('device_tokens').delete().in('token', staleTokens);
  }

  // 5. Log the broadcast
  await supabaseAdmin.from('broadcast_logs').insert({
    admin_id: adminId,
    title,
    body,
    filters,
    total_recipients: tokens.length,
    sent: totalSent,
    failed: totalFailed,
  });

  return { sent: totalSent, failed: totalFailed, total_targeted: tokens.length };
}

async function getBroadcastHistory(page, limit) {
  const offset = (page - 1) * limit;
  const { data, error, count } = await supabaseAdmin
    .from('broadcast_logs')
    .select('id, title, body, filters, total_recipients, sent, failed, created_at, admin:admin_id(id, name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return { history: data || [], total: count, page, limit };
}

module.exports = { sendBroadcast, getBroadcastHistory };
