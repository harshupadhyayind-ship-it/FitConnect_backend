const { supabaseAdmin } = require('../config/supabase');
const { computeScore, haversineKm } = require('./scoringService');

async function getPeople(userId, filters) {
  const { fitness_goal, workout_type, distance_km, gender, page, limit } = filters;

  const { data: me } = await supabaseAdmin
    .from('profiles')
    .select('fitness_goals, fitness_level, workout_types, latitude, longitude')
    .eq('id', userId)
    .single();

  let query = supabaseAdmin
    .from('profiles')
    .select('id, name, bio, avatar_url, fitness_goals, fitness_level, workout_types, gender, current_streak, latitude, longitude')
    .eq('onboarding_completed', true)
    .neq('id', userId);

  if (gender && gender !== 'everyone') {
    query = query.eq('gender', gender === 'women' ? 'female' : 'male');
  }
  if (fitness_goal) {
    query = query.contains('fitness_goals', [fitness_goal]);
  }
  if (workout_type) {
    query = query.contains('workout_types', [workout_type]);
  }

  const { data: candidates, error } = await query.limit(200);
  if (error) throw new Error(error.message);

  const scored = (candidates || [])
    .map(p => {
      const distKm = (me?.latitude && p.latitude)
        ? haversineKm(me.latitude, me.longitude, p.latitude, p.longitude)
        : 999;
      return { ...p, distance_km: Math.round(distKm), compatibility_score: me ? computeScore(me, p, distKm) : 0 };
    })
    .filter(p => p.distance_km <= distance_km)
    .sort((a, b) => b.compatibility_score - a.compatibility_score);

  const offset = (page - 1) * limit;
  return { people: scored.slice(offset, offset + limit), total: scored.length, page, limit };
}

async function getEvents(page, limit, filters = {}) {
  const offset = (page - 1) * limit;
  const { date } = filters; // optional ISO date string to filter by day

  let query = supabaseAdmin
    .from('events')
    .select('id, title, description, start_date, end_date, location, cover_image_url, participant_count, price, is_free', { count: 'exact' })
    .gte('end_date', new Date().toISOString())
    .order('start_date', { ascending: true });

  // Filter events by a specific day
  if (date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    query = query.gte('start_date', dayStart.toISOString()).lte('start_date', dayEnd.toISOString());
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return { events: data || [], total: count, page, limit };
}

async function getNearbyPlaces(userId, filters = {}) {
  const { type, distance_km = 10, page = 1, limit = 20 } = filters;

  // Get user's location
  const { data: me } = await supabaseAdmin
    .from('profiles')
    .select('latitude, longitude, location')
    .eq('id', userId)
    .single();

  let query = supabaseAdmin
    .from('venues')
    .select('id, name, type, address, city, latitude, longitude, rating, reviews_count, image_url, tags, open_hours, is_active')
    .eq('is_active', true);

  if (type && type !== 'all') {
    query = query.eq('type', type);
  }

  const { data: venues, error } = await query.limit(200);
  if (error) throw new Error(error.message);

  // Attach distance, filter and sort
  const withDistance = (venues || [])
    .map(v => {
      const distKm = (me?.latitude && v.latitude)
        ? haversineKm(me.latitude, me.longitude, v.latitude, v.longitude)
        : 9999;
      return { ...v, distance_km: parseFloat(distKm.toFixed(1)) };
    })
    .filter(v => v.distance_km <= distance_km)
    .sort((a, b) => a.distance_km - b.distance_km);

  const offset = (page - 1) * limit;
  return {
    places:  withDistance.slice(offset, offset + limit),
    total:   withDistance.length,
    page,
    limit,
    has_more: offset + limit < withDistance.length,
  };
}

async function search(userId, query) {
  // Search users, trainers, events and venues in parallel
  const [
    { data: people },
    { data: trainers },
    { data: events },
    { data: venues },
  ] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, name, avatar_url, fitness_goals, fitness_level, user_type')
      .eq('onboarding_completed', true)
      .eq('user_type', 'individual')
      .neq('id', userId)
      .ilike('name', `%${query}%`)
      .limit(10),

    supabaseAdmin
      .from('profiles')
      .select('id, name, avatar_url, specialty, session_rate, rating')
      .eq('user_type', 'professional')
      .neq('id', userId)
      .ilike('name', `%${query}%`)
      .limit(10),

    supabaseAdmin
      .from('events')
      .select('id, title, start_date, location, cover_image_url, is_free')
      .gte('end_date', new Date().toISOString())
      .ilike('title', `%${query}%`)
      .limit(10),

    supabaseAdmin
      .from('venues')
      .select('id, name, type, city, rating, image_url')
      .eq('is_active', true)
      .ilike('name', `%${query}%`)
      .limit(10),
  ]);

  return {
    people:   people   || [],
    trainers: trainers || [],
    events:   events   || [],
    venues:   venues   || [],
  };
}

module.exports = { getPeople, getEvents, getNearbyPlaces, search };
