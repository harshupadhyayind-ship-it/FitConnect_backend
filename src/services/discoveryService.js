const { supabaseAdmin } = require('../config/supabase');
const { computeScore, haversineKm } = require('./scoringService');

/**
 * Returns a paginated, scored list of user profiles for discovery.
 * Excludes: self, already-liked users, already-matched users.
 */
async function discoverUsers(userId, filters) {
  const { fitness_goal, distance_km, gender, page, limit } = filters;

  // 1. Get requester's profile
  const { data: me } = await supabaseAdmin
    .from('profiles')
    .select('id, fitness_goals, fitness_level, latitude, longitude, preferred_gender_filter')
    .eq('id', userId)
    .single();

  if (!me) throw Object.assign(new Error('Profile not found'), { status: 404 });

  // 2. Get IDs to exclude (self + already liked + already matched)
  const [{ data: likedRows }, { data: matchRows }] = await Promise.all([
    supabaseAdmin.from('likes').select('liked_user_id').eq('liker_user_id', userId),
    supabaseAdmin.from('matches').select('user1_id, user2_id').or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
  ]);

  const excludeIds = new Set([userId]);
  likedRows?.forEach(r => excludeIds.add(r.liked_user_id));
  matchRows?.forEach(r => { excludeIds.add(r.user1_id); excludeIds.add(r.user2_id); });

  // 3. Build query
  let query = supabaseAdmin
    .from('profiles')
    .select('id, name, bio, avatar_url, fitness_goals, fitness_level, gender, current_streak, latitude, longitude')
    .eq('onboarding_completed', true)
    .not('id', 'in', `(${[...excludeIds].join(',')})`);

  // Gender filter (respects women-only safety feature)
  const genderFilter = gender || me.preferred_gender_filter;
  if (genderFilter === 'women' || genderFilter === 'women_only') {
    query = query.eq('gender', 'female');
  } else if (genderFilter === 'men') {
    query = query.eq('gender', 'male');
  }

  // Fitness goal filter
  if (fitness_goal) {
    query = query.contains('fitness_goals', [fitness_goal]);
  }

  const { data: candidates, error } = await query.limit(200); // fetch broad set, score & sort
  if (error) throw new Error(error.message);

  // 4. Score + filter by distance
  const scored = (candidates || [])
    .map(profile => {
      const distKm = (me.latitude && me.longitude && profile.latitude && profile.longitude)
        ? haversineKm(me.latitude, me.longitude, profile.latitude, profile.longitude)
        : 999;
      return { ...profile, distance_km: Math.round(distKm), compatibility_score: computeScore(me, profile, distKm) };
    })
    .filter(p => p.distance_km <= distance_km)
    .sort((a, b) => b.compatibility_score - a.compatibility_score);

  // 5. Paginate
  const offset = (page - 1) * limit;
  const paged = scored.slice(offset, offset + limit);

  return {
    users: paged,
    total: scored.length,
    page,
    limit,
    has_more: offset + limit < scored.length,
  };
}

module.exports = { discoverUsers };
