const { supabaseAdmin } = require('../config/supabase');
const { computeScore, haversineKm } = require('./scoringService');

const SPORTS_CATEGORIES = [
  { id: 'badminton',    label: 'Badminton',    emoji: '🏸' },
  { id: 'football',     label: 'Football',     emoji: '⚽' },
  { id: 'box_cricket',  label: 'Box Cricket',  emoji: '🏏' },
  { id: 'basketball',   label: 'Basketball',   emoji: '🏀' },
  { id: 'boxing',       label: 'Boxing',       emoji: '🥊' },
  { id: 'swimming',     label: 'Swimming',     emoji: '🏊' },
  { id: 'running',      label: 'Running',      emoji: '🏃' },
  { id: 'cycling',      label: 'Cycling',      emoji: '🚴' },
  { id: 'yoga',         label: 'Yoga',         emoji: '🧘' },
  { id: 'gym',          label: 'Gym',          emoji: '🏋️' },
];

async function getHomeData(userId) {
  // 1. Fetch current user's profile
  const { data: me, error: meErr } = await supabaseAdmin
    .from('profiles')
    .select('id, name, location, current_streak, longest_streak, fitness_goals, fitness_level, workout_types, latitude, longitude, preferred_gender_filter, avatar_url')
    .eq('id', userId)
    .single();

  if (meErr || !me) throw Object.assign(new Error('Profile not found'), { status: 404 });

  // 2. IDs to exclude for FitBuddies (already liked or matched)
  const [{ data: likedRows }, { data: matchRows }] = await Promise.all([
    supabaseAdmin.from('likes').select('liked_user_id').eq('liker_user_id', userId),
    supabaseAdmin.from('matches').select('user1_id, user2_id').or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
  ]);

  const excludeIds = new Set([userId]);
  likedRows?.forEach(r => excludeIds.add(r.liked_user_id));
  matchRows?.forEach(r => { excludeIds.add(r.user1_id); excludeIds.add(r.user2_id); });

  const excludeList = [...excludeIds].join(',');

  // 3. Fetch trainers (professional) + fitbuddies (individual) in parallel
  const [{ data: trainersRaw }, { data: buddiesRaw }] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, name, avatar_url, specialty, session_rate, years_of_experience, location, latitude, longitude, fitness_level, current_streak')
      .eq('user_type', 'professional')
      .eq('onboarding_completed', true)
      .not('id', 'in', `(${excludeList})`)
      .limit(50),

    supabaseAdmin
      .from('profiles')
      .select('id, name, avatar_url, fitness_goals, workout_types, fitness_level, location, latitude, longitude, current_streak')
      .eq('user_type', 'individual')
      .eq('onboarding_completed', true)
      .not('id', 'in', `(${excludeList})`)
      .limit(100),
  ]);

  // 4. Score + sort trainers by distance
  const scoredTrainers = (trainersRaw || [])
    .map(t => {
      const distKm = (me.latitude && t.latitude)
        ? haversineKm(me.latitude, me.longitude, t.latitude, t.longitude)
        : 9999;
      return { ...t, distance_km: Math.round(distKm) };
    })
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, 10);

  // 5. Score + sort fitbuddies by compatibility
  const genderFilter = me.preferred_gender_filter;
  const scoredBuddies = (buddiesRaw || [])
    .filter(p => {
      if (genderFilter === 'women' || genderFilter === 'women_only') return p.gender === 'female';
      if (genderFilter === 'men') return p.gender === 'male';
      return true;
    })
    .map(p => {
      const distKm = (me.latitude && p.latitude)
        ? haversineKm(me.latitude, me.longitude, p.latitude, p.longitude)
        : 9999;
      return { ...p, distance_km: Math.round(distKm), compatibility_score: computeScore(me, p, distKm) };
    })
    .sort((a, b) => b.compatibility_score - a.compatibility_score)
    .slice(0, 10);

  return {
    user: {
      id:             me.id,
      name:           me.name,
      location:       me.location || null,
      avatar_url:     me.avatar_url,
      current_streak: me.current_streak || 0,
      longest_streak: me.longest_streak || 0,
    },
    sports_categories: SPORTS_CATEGORIES,
    trainers:    scoredTrainers,
    fit_buddies: scoredBuddies,
  };
}

module.exports = { getHomeData };
