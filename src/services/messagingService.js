const { supabaseAdmin } = require('../config/supabase');

/**
 * Messaging uses the `messages` table in Supabase.
 * Supabase Realtime (Postgres CDC) is used by the mobile clients
 * to receive messages in real-time — no extra setup required on this side.
 */

async function getChatList(userId) {
  // Fetch all matches + messages + unread counts in parallel
  const [
    { data: allMatches, error: matchErr },
    { data: msgs,       error: msgErr   },
    { data: unreadRows },
  ] = await Promise.all([
    // All matches for this user (to catch new matches with no messages)
    supabaseAdmin
      .from('matches')
      .select(`
        id, created_at,
        user1:user1_id(id, name, avatar_url, fitness_goals, current_streak, user_type),
        user2:user2_id(id, name, avatar_url, fitness_goals, current_streak, user_type)
      `)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order('created_at', { ascending: false }),

    // Latest message per match
    supabaseAdmin
      .from('messages')
      .select('match_id, content, created_at, sender_id, is_read')
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('created_at', { ascending: false }),

    // Unread counts
    supabaseAdmin
      .from('messages')
      .select('match_id')
      .eq('recipient_id', userId)
      .eq('is_read', false),
  ]);

  if (matchErr) throw new Error(matchErr.message);
  if (msgErr)   throw new Error(msgErr.message);

  // Build last-message map  { match_id → message }
  const lastMsgMap = {};
  for (const msg of msgs || []) {
    if (!lastMsgMap[msg.match_id]) lastMsgMap[msg.match_id] = msg;
  }

  // Build unread count map
  const unreadMap = {};
  (unreadRows || []).forEach(r => {
    unreadMap[r.match_id] = (unreadMap[r.match_id] || 0) + 1;
  });

  const sevenDaysAgo  = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const new_matches   = [];
  const conversations = [];

  for (const match of allMatches || []) {
    const otherUser  = match.user1?.id === userId ? match.user2 : match.user1;
    const lastMsg    = lastMsgMap[match.id];
    const isNew      = new Date(match.created_at).getTime() >= sevenDaysAgo;

    let client_label = null;
    if (otherUser?.user_type === 'professional') {
      client_label = 'Colleague';
    } else if (isNew) {
      client_label = 'New Match';
    } else {
      client_label = 'Active Match';
    }

    if (!lastMsg) {
      // ── New match — no messages yet ──────────────────────────────────────
      new_matches.push({
        match_id    : match.id,
        matched_at  : match.created_at,
        other_user  : otherUser,
        client_label,
      });
    } else {
      // ── Active conversation ───────────────────────────────────────────────
      conversations.push({
        match_id     : match.id,
        matched_at   : match.created_at,
        other_user   : otherUser,
        client_label,
        last_message : {
          content    : lastMsg.content,
          created_at : lastMsg.created_at,
          is_mine    : lastMsg.sender_id === userId,
        },
        unread_count : unreadMap[match.id] || 0,
        is_read      : lastMsg.is_read || lastMsg.sender_id === userId,
      });
    }
  }

  // Sort conversations by last message time (newest first)
  conversations.sort((a, b) =>
    new Date(b.last_message.created_at) - new Date(a.last_message.created_at)
  );

  return {
    new_matches,          // matched but no messages — show as avatar row
    conversations,        // active chats — show as chat list
    total_matches      : (allMatches || []).length,
    total_unread       : Object.values(unreadMap).reduce((s, n) => s + n, 0),
  };
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
