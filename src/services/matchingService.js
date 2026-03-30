const { supabaseAdmin } = require('../config/supabase');

async function likeUser(likerId, likedUserId) {
  if (likerId === likedUserId) throw Object.assign(new Error('Cannot like yourself'), { status: 400 });

  // Upsert like
  const { error: likeError } = await supabaseAdmin
    .from('likes')
    .upsert({ liker_user_id: likerId, liked_user_id: likedUserId }, { onConflict: 'liker_user_id,liked_user_id' });

  if (likeError) throw new Error(likeError.message);

  // Check for mutual like (the other person already liked us)
  const { data: mutualLike } = await supabaseAdmin
    .from('likes')
    .select('id')
    .eq('liker_user_id', likedUserId)
    .eq('liked_user_id', likerId)
    .single();

  let matched = false;
  let match = null;

  if (mutualLike) {
    // Ensure deterministic ordering to avoid duplicate match rows
    const [user1_id, user2_id] = [likerId, likedUserId].sort();

    const { data: existingMatch } = await supabaseAdmin
      .from('matches')
      .select('id')
      .eq('user1_id', user1_id)
      .eq('user2_id', user2_id)
      .single();

    if (!existingMatch) {
      const { data: newMatch, error: matchError } = await supabaseAdmin
        .from('matches')
        .insert({ user1_id, user2_id })
        .select()
        .single();

      if (matchError) throw new Error(matchError.message);
      match = newMatch;
    } else {
      match = existingMatch;
    }
    matched = true;
  }

  return { liked: true, matched, match };
}

async function unlikeUser(likerId, likedUserId) {
  const { error } = await supabaseAdmin
    .from('likes')
    .delete()
    .eq('liker_user_id', likerId)
    .eq('liked_user_id', likedUserId);

  if (error) throw new Error(error.message);
  return { unliked: true };
}

async function getMatches(userId, page, limit) {
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('matches')
    .select(`
      id, created_at,
      user1:user1_id(id, name, avatar_url, fitness_goals, current_streak),
      user2:user2_id(id, name, avatar_url, fitness_goals, current_streak)
    `, { count: 'exact' })
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  // Return the "other" user from each match
  const matches = (data || []).map(m => ({
    match_id: m.id,
    matched_at: m.created_at,
    user: m.user1?.id === userId ? m.user2 : m.user1,
  }));

  return { matches, total: count, page, limit, has_more: offset + limit < count };
}

async function getSentLikes(userId) {
  const { data, error } = await supabaseAdmin
    .from('likes')
    .select('liked_user_id, created_at, profile:liked_user_id(id, name, avatar_url)')
    .eq('liker_user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return { likes: data };
}

async function unmatch(userId, matchId) {
  // Verify user is part of this match
  const { data: match, error: fetchErr } = await supabaseAdmin
    .from('matches')
    .select('id, user1_id, user2_id')
    .eq('id', matchId)
    .single();

  if (fetchErr || !match) throw Object.assign(new Error('Match not found'), { status: 404 });
  if (match.user1_id !== userId && match.user2_id !== userId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  const { error } = await supabaseAdmin.from('matches').delete().eq('id', matchId);
  if (error) throw new Error(error.message);
}

module.exports = { likeUser, unlikeUser, getMatches, getSentLikes, unmatch };
