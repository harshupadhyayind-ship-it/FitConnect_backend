const { getFirebaseAdmin } = require('../config/firebase');
const { supabaseAdmin } = require('../config/supabase');

/**
 * Sends a push notification to a user across their registered devices.
 * Handles both FCM (Android) and APNs (iOS via FCM).
 */
async function sendPushToUser(userId, { title, body, data = {} }) {
  const { data: tokens } = await supabaseAdmin
    .from('device_tokens')
    .select('token, platform')
    .eq('user_id', userId);

  if (!tokens || tokens.length === 0) return;

  const firebase = getFirebaseAdmin();
  const messages = tokens.map(({ token }) => ({
    token,
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  }));

  for (const msg of messages) {
    try {
      await firebase.messaging().send(msg);
    } catch (err) {
      // Token may be stale — remove it
      if (err.code === 'messaging/registration-token-not-registered') {
        await supabaseAdmin.from('device_tokens').delete().eq('token', msg.token);
      } else {
        console.error('[Push] Error sending notification:', err.message);
      }
    }
  }
}

async function sendMatchNotification(userId, matchedWithUserId) {
  // Get the name of the person who liked them
  const { data: matchedUser } = await supabaseAdmin
    .from('profiles')
    .select('name')
    .eq('id', matchedWithUserId)
    .single();

  const name = matchedUser?.name || 'Someone';

  await sendPushToUser(userId, {
    title: "It's a match!",
    body: `You and ${name} matched. Start a conversation!`,
    data: { type: 'match', matched_user_id: matchedWithUserId },
  });

  // Store in-app notification
  await _storeNotification(userId, 'match', { matched_user_id: matchedWithUserId });
}

async function sendMessageNotification(recipientId, senderId, messageContent) {
  const { data: sender } = await supabaseAdmin
    .from('profiles')
    .select('name')
    .eq('id', senderId)
    .single();

  const name = sender?.name || 'Someone';
  const preview = messageContent.length > 50 ? messageContent.slice(0, 50) + '…' : messageContent;

  await sendPushToUser(recipientId, {
    title: name,
    body: preview,
    data: { type: 'message', sender_id: senderId },
  });
}

async function getNotifications(userId, page, limit) {
  const offset = (page - 1) * limit;
  const { data, error, count } = await supabaseAdmin
    .from('notifications')
    .select('id, type, payload, is_read, created_at', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return { notifications: data || [], total: count, page, limit };
}

async function markRead(userId, notificationId) {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

async function markAllRead(userId) {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw new Error(error.message);
}

async function _storeNotification(userId, type, payload) {
  await supabaseAdmin
    .from('notifications')
    .insert({ user_id: userId, type, payload, is_read: false });
}

module.exports = { sendMatchNotification, sendMessageNotification, getNotifications, markRead, markAllRead };
