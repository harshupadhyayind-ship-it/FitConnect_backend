const { supabaseAdmin } = require('../config/supabase');
const { haversineKm } = require('./scoringService');

/**
 * Returns paginated list of professional trainers.
 * Sorted by: distance (if coords available) then rating.
 */
async function getTrainers(userId, filters) {
  const { specialty, location, page, limit } = filters;

  // Get requesting user's location for distance calc
  const { data: me } = await supabaseAdmin
    .from('profiles')
    .select('latitude, longitude')
    .eq('id', userId)
    .single();

  let query = supabaseAdmin
    .from('profiles')
    .select('id, name, avatar_url, location, specialty, session_rate, years_of_experience, rating, reviews_count, target_audience, latitude, longitude, fitness_level')
    .eq('user_type', 'professional')
    .eq('onboarding_completed', true)
    .neq('id', userId);

  // Filter by specialty (array contains)
  if (specialty) {
    query = query.contains('specialty', [specialty]);
  }

  // Filter by location text
  if (location) {
    query = query.ilike('location', `%${location}%`);
  }

  const { data: trainers, error } = await query.limit(200);
  if (error) throw new Error(error.message);

  // Attach distance, sort by distance then rating
  const withDistance = (trainers || []).map(t => {
    const distKm = (me?.latitude && t.latitude)
      ? haversineKm(me.latitude, me.longitude, t.latitude, t.longitude)
      : 9999;
    return { ...t, distance_km: Math.round(distKm) };
  }).sort((a, b) => {
    if (a.distance_km !== b.distance_km) return a.distance_km - b.distance_km;
    return (b.rating || 0) - (a.rating || 0);
  });

  const offset = (page - 1) * limit;
  return {
    trainers: withDistance.slice(offset, offset + limit),
    total:    withDistance.length,
    page,
    limit,
    has_more: offset + limit < withDistance.length,
  };
}

/**
 * GET single trainer profile (public detail view).
 */
async function getTrainerDetail(trainerId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, name, avatar_url, bio, location, specialty, session_rate, years_of_experience, rating, reviews_count, target_audience, credentials, prompt_philosophy, prompt_best_result, prompt_love_working, fitness_level, latitude, longitude')
    .eq('id', trainerId)
    .eq('user_type', 'professional')
    .single();

  if (error || !data) throw Object.assign(new Error('Trainer not found'), { status: 404 });
  return data;
}

module.exports = { getTrainers, getTrainerDetail };
