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

/**
 * Recompute the denormalised rating/reviews_count on the trainer's profile
 * from the professional_ratings table.
 */
async function recomputeTrainerRating(trainerId) {
  const { data: ratings, error } = await supabaseAdmin
    .from('professional_ratings')
    .select('rating')
    .eq('professional_id', trainerId);

  if (error) throw new Error(error.message);

  const count = ratings.length;
  const avg = count ? ratings.reduce((sum, r) => sum + r.rating, 0) / count : 0;

  await supabaseAdmin
    .from('profiles')
    .update({ rating: Math.round(avg * 10) / 10, reviews_count: count })
    .eq('id', trainerId);
}

/**
 * Rate (or update a previous rating of) a professional.
 * One rating per (professional, rater) pair — rating again edits the review.
 */
async function rateTrainer(raterId, trainerId, { rating, review }) {
  if (raterId === trainerId) throw Object.assign(new Error('Cannot rate yourself'), { status: 400 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw Object.assign(new Error('rating must be an integer between 1 and 5'), { status: 400 });
  }

  const { data: trainer } = await supabaseAdmin
    .from('profiles').select('id, user_type').eq('id', trainerId).single();
  if (!trainer || trainer.user_type !== 'professional') {
    throw Object.assign(new Error('Trainer not found'), { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from('professional_ratings')
    .upsert({
      professional_id: trainerId,
      rater_user_id:   raterId,
      rating,
      review:     review || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'professional_id,rater_user_id' })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await recomputeTrainerRating(trainerId);

  return data;
}

/**
 * Paginated list of ratings/reviews for a trainer.
 */
async function getTrainerRatings(trainerId, page, limit) {
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('professional_ratings')
    .select('id, rating, review, created_at, rater:rater_user_id(id, name, avatar_url)', { count: 'exact' })
    .eq('professional_id', trainerId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  return { ratings: data || [], total: count, page, limit, has_more: offset + limit < count };
}

/**
 * Remove the caller's own rating of a trainer.
 */
async function deleteTrainerRating(raterId, trainerId) {
  const { error } = await supabaseAdmin
    .from('professional_ratings')
    .delete()
    .eq('professional_id', trainerId)
    .eq('rater_user_id', raterId);

  if (error) throw new Error(error.message);

  await recomputeTrainerRating(trainerId);
  return { deleted: true };
}

module.exports = { getTrainers, getTrainerDetail, rateTrainer, getTrainerRatings, deleteTrainerRating };
