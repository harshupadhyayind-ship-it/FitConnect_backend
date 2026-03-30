const { supabaseAdmin } = require('../config/supabase');
const { computeScore, haversineKm } = require('./scoringService');

async function getPeople(userId, filters) {
  const { fitness_goal, distance_km, gender, page, limit } = filters;

  const { data: me } = await supabaseAdmin
    .from('profiles')
    .select('fitness_goals, fitness_level, latitude, longitude')
    .eq('id', userId)
    .single();

  let query = supabaseAdmin
    .from('profiles')
    .select('id, name, bio, avatar_url, fitness_goals, fitness_level, gender, current_streak, latitude, longitude')
    .eq('onboarding_completed', true)
    .neq('id', userId);

  if (gender && gender !== 'everyone') {
    query = query.eq('gender', gender === 'women' ? 'female' : 'male');
  }
  if (fitness_goal) {
    query = query.contains('fitness_goals', [fitness_goal]);
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

async function getEvents(page, limit) {
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('events')
    .select('id, title, description, start_date, end_date, location, cover_image_url, participant_count', { count: 'exact' })
    .gte('end_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return { events: data || [], total: count, page, limit };
}

async function search(userId, query) {
  // Search users by name or fitness goal tag
  const { data: users, error } = await supabaseAdmin
    .from('profiles')
    .select('id, name, avatar_url, fitness_goals, fitness_level, current_streak')
    .eq('onboarding_completed', true)
    .neq('id', userId)
    .or(`name.ilike.%${query}%,fitness_goals.cs.{"${query}"}`)
    .limit(30);

  if (error) throw new Error(error.message);
  return { users: users || [] };
}

module.exports = { getPeople, getEvents, search };
