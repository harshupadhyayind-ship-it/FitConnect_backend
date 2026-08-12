const { supabaseAdmin } = require('../config/supabase');

/**
 * Builds the set of user IDs that must not appear as candidates for `userId`:
 *   • self
 *   • already liked (waiting on them to like back)
 *   • already matched
 *   • actively disliked / passed — only while the 30-day cooldown is running.
 *     Once expires_at passes the row is ignored here and the user resurfaces.
 *
 * Shared by every candidate-listing surface (home, discovery) so a new
 * exclusion rule only has to be added in one place.
 */
async function getExcludedUserIds(userId) {
  const [{ data: likedRows }, { data: matchRows }, { data: dislikedRows }] = await Promise.all([
    supabaseAdmin.from('likes').select('liked_user_id').eq('liker_user_id', userId),
    supabaseAdmin.from('matches').select('user1_id, user2_id').or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
    supabaseAdmin.from('dislikes').select('disliked_user_id').eq('disliker_user_id', userId).gt('expires_at', new Date().toISOString()),
  ]);

  const excludeIds = new Set([userId]);
  likedRows?.forEach(r => excludeIds.add(r.liked_user_id));
  matchRows?.forEach(r => { excludeIds.add(r.user1_id); excludeIds.add(r.user2_id); });
  dislikedRows?.forEach(r => excludeIds.add(r.disliked_user_id));

  return excludeIds;
}

module.exports = { getExcludedUserIds };
