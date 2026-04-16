const { supabaseAdmin } = require('../config/supabase');

/**
 * Messaging uses the `messages` table in Supabase.
 * Supabase Realtime (Postgres CDC) is used by the mobile clients
 * to receive messages in real-time — no extra setup required on this side.
 */

async function getChatList(userId) {
  // Fetch messages + unread counts in parallel
  const [{ data: msgs, error }, { data: unreadRows }] = await Promise.all([
    supabaseAdmin
      .from('messages')
      .select(`
        match_id, content, created_at, sender_id, is_read,
        match:match_id(
          created_at,
          user1:user1_id(id, name, avatar_url, user_type),
          user2:user2_id(id, name, avatar_url, user_type)
        )
      `)
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('created_at', { ascending: false }),

    supabaseAdmin
      .from('messages')
      .select('match_id')
      .eq('recipient_id', userId)
      .eq('is_read', false),
  ]);

  if (error) throw new Error(error.message);

  // Build unread count map
  const unreadMap = {};
  (unreadRows || []).forEach(r => {
    unreadMap[r.match_id] = (unreadMap[r.match_id] || 0) + 1;
  });

  const seen = new Set();
  const conversations = [];
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const msg of msgs || []) {
    if (seen.has(msg.match_id)) continue;
    seen.add(msg.match_id);

    const match     = msg.match;
    const otherUser = match?.user1?.id === userId ? match.user2 : match?.user1;

    // Client status label (shown in Messages list)
    let client_label = null;
    if (otherUser?.user_type === 'professional') {
      client_label = 'Colleague';
    } else if (match?.created_at && new Date(match.created_at).getTime() >= sevenDaysAgo) {
      client_label = 'New Client';
    } else {
      client_label = 'Active Client';
    }

    conversations.push({
      match_id:     msg.match_id,
      other_user:   otherUser,
      client_label,
      last_message: {
        content:    msg.content,
        created_at: msg.created_at,
        is_mine:    msg.sender_id === userId,
      },
      unread_count: unreadMap[msg.match_id] || 0,
      is_read:      msg.is_read || msg.sender_id === userId,
    });
  }

  return { conversations };
}

async function getMessages(userId, matchId, page, limit) {
  // Verify user is part of this match
  const { data: match } = await supabaseAdmin
    .from('matches')
    .select('user1_id, user2_id')
    .eq('id', matchId)
    .single();

  if (!match || (match.user1_id !== userId && match.user2_id !== userId)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  const offset = (page - 1) * limit;
  const { data, error, count } = await supabaseAdmin
    .from('messages')
    .select('id, sender_id, content, is_read, created_at', { count: 'exact' })
    .eq('match_id', matchId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  return { messages: (data || []).reverse(), total: count, page, limit };
}

async function sendMessage(senderId, matchId, content) {
  // Verify sender is part of this match
  const { data: match } = await supabaseAdmin
    .from('matches')
    .select('user1_id, user2_id')
    .eq('id', matchId)
    .single();

  if (!match || (match.user1_id !== senderId && match.user2_id !== senderId)) {
    throw Object.assign(new Error('Forbidden — not a match'), { status: 403 });
  }

  const recipient_id = match.user1_id === senderId ? match.user2_id : match.user1_id;

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({ match_id: matchId, sender_id: senderId, recipient_id, content, is_read: false })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function markAsRead(userId, matchId) {
  const { error } = await supabaseAdmin
    .from('messages')
    .update({ is_read: true })
    .eq('match_id', matchId)
    .eq('recipient_id', userId)
    .eq('is_read', false);

  if (error) throw new Error(error.message);
}

module.exports = { getChatList, getMessages, sendMessage, markAsRead };
