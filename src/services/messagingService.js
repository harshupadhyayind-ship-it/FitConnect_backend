const { supabaseAdmin } = require('../config/supabase');

/**
 * Messaging uses the `messages` table in Supabase.
 * Supabase Realtime (Postgres CDC) is used by the mobile clients
 * to receive messages in real-time — no extra setup required on this side.
 */

// ── File upload helpers ───────────────────────────────────────────────────────

const CHAT_BUCKET = 'chat-files';
const CHAT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic']);
const FILE_MIMES  = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

function messageTypeFromMime(mime) {
  if (IMAGE_MIMES.has(mime)) return 'image';
  if (FILE_MIMES.has(mime))  return 'file';
  return null; // unsupported
}

function extFromMime(mime) {
  const map = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
  };
  return map[mime] || 'bin';
}

async function ensureChatBucket() {
  await supabaseAdmin.storage.createBucket(CHAT_BUCKET, {
    public        : true,
    fileSizeLimit : CHAT_MAX_BYTES,
  }).catch(() => {}); // already exists → ignore
}

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
      .select('match_id, content, message_type, file_name, created_at, sender_id, is_read')
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
          content    : lastMsg.message_type === 'image'
            ? '📷 Photo'
            : lastMsg.message_type === 'file'
              ? `📎 ${lastMsg.file_name || 'Document'}`
              : lastMsg.content,
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
    .select('id, sender_id, content, message_type, file_url, file_name, file_size, mime_type, is_read, created_at', { count: 'exact' })
    .eq('match_id', matchId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  return { messages: (data || []).reverse(), total: count, page, limit };
}

async function sendMessage(senderId, matchId, body) {
  const { content, file_url, file_name, file_size, mime_type } = typeof body === 'string'
    ? { content: body }
    : body;

  const { data: match } = await supabaseAdmin
    .from('matches')
    .select('user1_id, user2_id')
    .eq('id', matchId)
    .single();

  if (!match || (match.user1_id !== senderId && match.user2_id !== senderId)) {
    throw Object.assign(new Error('Forbidden — not a match'), { status: 403 });
  }

  const recipient_id = match.user1_id === senderId ? match.user2_id : match.user1_id;

  const message_type = file_url
    ? (mime_type && IMAGE_MIMES.has(mime_type) ? 'image' : 'file')
    : 'text';

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      match_id: matchId,
      sender_id: senderId,
      recipient_id,
      content: content || null,
      message_type,
      file_url:   file_url   || null,
      file_name:  file_name  || null,
      file_size:  file_size  || null,
      mime_type:  mime_type  || null,
      is_read: false,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function sendFileMessage(senderId, matchId, file, caption) {
  // Validate match membership
  const { data: match } = await supabaseAdmin
    .from('matches')
    .select('user1_id, user2_id')
    .eq('id', matchId)
    .single();

  if (!match || (match.user1_id !== senderId && match.user2_id !== senderId)) {
    throw Object.assign(new Error('Forbidden — not a match'), { status: 403 });
  }

  const mime = file.mimetype;
  const msgType = messageTypeFromMime(mime);
  if (!msgType) {
    throw Object.assign(new Error('Unsupported file type'), { status: 400 });
  }

  if (file.buffer.length > CHAT_MAX_BYTES) {
    throw Object.assign(new Error('File exceeds 25 MB limit'), { status: 400 });
  }

  await ensureChatBucket();

  const ext      = extFromMime(mime);
  const fileName = `${matchId}/${senderId}-${Date.now()}.${ext}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(CHAT_BUCKET)
    .upload(fileName, file.buffer, { contentType: mime, upsert: false });

  if (upErr) throw new Error(upErr.message);

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from(CHAT_BUCKET)
    .getPublicUrl(fileName);

  const recipient_id = match.user1_id === senderId ? match.user2_id : match.user1_id;

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      match_id     : matchId,
      sender_id    : senderId,
      recipient_id,
      content      : caption || null,
      message_type : msgType,
      file_url     : publicUrl,
      file_name    : file.originalname || file.filename,
      file_size    : file.buffer.length,
      mime_type    : mime,
      is_read      : false,
    })
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

module.exports = { getChatList, getMessages, sendMessage, sendFileMessage, markAsRead };
