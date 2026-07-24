const { supabaseAdmin } = require('../config/supabase');

const DISLIKE_COOLDOWN_DAYS = 30;

async function likeUser(likerId, likedUserId) {
  if (likerId === likedUserId) throw Object.assign(new Error('Cannot like yourself'), { status: 400 });

  // Ensure the target profile exists before inserting the like
  const { data: targetProfile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', likedUserId)
    .single();

  if (profileErr || !targetProfile) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

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
    // Check for existing match in either column ordering
    // (LEAST/GREATEST unique index prevents duplicates regardless of insert order)
    const { data: existingMatch } = await supabaseAdmin
      .from('matches')
      .select('id')
      .or(
        `and(user1_id.eq.${likerId},user2_id.eq.${likedUserId}),` +
        `and(user1_id.eq.${likedUserId},user2_id.eq.${likerId})`
      )
      .maybeSingle();

    if (!existingMatch) {
      const { data: newMatch, error: matchError } = await supabaseAdmin
        .from('matches')
        .insert({ user1_id: likerId, user2_id: likedUserId })
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

async function dislikeUser(dislikerId, dislikedUserId) {
  if (dislikerId === dislikedUserId) throw Object.assign(new Error('Cannot dislike yourself'), { status: 400 });

  const { data: targetProfile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', dislikedUserId)
    .single();

  if (profileErr || !targetProfile) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  const expiresAt = new Date(Date.now() + DISLIKE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error: dislikeError } = await supabaseAdmin
    .from('dislikes')
    .upsert(
      { disliker_user_id: dislikerId, disliked_user_id: dislikedUserId, created_at: new Date().toISOString(), expires_at: expiresAt },
      { onConflict: 'disliker_user_id,disliked_user_id' }
    );

  if (dislikeError) throw new Error(dislikeError.message);

  // A pass overrides any pending like in either direction so it can't turn into a match later
  await supabaseAdmin
    .from('likes')
    .delete()
    .eq('liker_user_id', dislikerId)
    .eq('liked_user_id', dislikedUserId);

  return { disliked: true, hidden_until: expiresAt };
}

async function undoDislike(dislikerId, dislikedUserId) {
  const { error } = await supabaseAdmin
    .from('dislikes')
    .delete()
    .eq('disliker_user_id', dislikerId)
    .eq('disliked_user_id', dislikedUserId);

  if (error) throw new Error(error.message);
  return { undone: true };
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

async function getReceivedLikes(userId) {
  // Fetch everyone who liked this user, excluding people already matched
  const { data: matchRows } = await supabaseAdmin
    .from('matches')
    .select('user1_id, user2_id')
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

  const matchedIds = new Set();
  matchRows?.forEach(r => {
    matchedIds.add(r.user1_id);
    matchedIds.add(r.user2_id);
  });
  matchedIds.delete(userId); // don't exclude self twice

  const { data, error } = await supabaseAdmin
    .from('likes')
    .select('liker_user_id, created_at, profile:liker_user_id(id, name, avatar_url, fitness_goals, fitness_level, current_streak)')
    .eq('liked_user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  // Filter out already-matched users (they appear in matches, not pending likes)
  const pending = (data || []).filter(r => !matchedIds.has(r.liker_user_id));

  return { likes: pending, total: pending.length };
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

module.exports = { likeUser, unlikeUser, dislikeUser, undoDislike, getMatches, getSentLikes, getReceivedLikes, unmatch };
