const https  = require('https');
const { supabaseAdmin } = require('../config/supabase');
const { computeScore, haversineKm } = require('./scoringService');

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// ─── Google Places config per filter ─────────────────────────────────────────
// type        : Google Places API `type` param  (constrains result category)
// keyword     : Narrows Google results — matched against name + address + reviews
// mustHaveAll : result must contain EVERY tag in this list (AND check)
//               Left empty when `type` already guarantees uniqueness (gym, pool, physio)
// mustHaveAny : result must contain AT LEAST ONE tag from this list (OR check)
//               Used to remove noise that sneaks through with loose Google types
const FILTER_CONFIG = {
  gym:      {
    type: 'gym',
    keyword: 'gym fitness centre',
    mustHaveAll: [],
    mustHaveAny: ['gym'],
  },
  yoga:     {
    type: 'gym',
    keyword: 'yoga',
    mustHaveAll: [],
    mustHaveAny: ['gym', 'health', 'yoga_studio'],
  },
  physio:   {
    type: 'physiotherapist',
    keyword: 'physiotherapy rehabilitation',
    mustHaveAll: [],
    mustHaveAny: ['physiotherapist', 'health', 'doctor'],
  },
  sports:   {
    type: 'sports_club',
    keyword: 'sports club',
    mustHaveAll: [],
    mustHaveAny: ['sports_club', 'stadium', 'gym', 'health'],
  },
  pool:     {
    type: 'swimming_pool',
    keyword: 'swimming pool aquatic',
    mustHaveAll: [],
    mustHaveAny: ['swimming_pool', 'gym', 'health'],
  },
  crossfit: {
    type: 'gym',
    keyword: 'crossfit box',
    mustHaveAll: [],
    mustHaveAny: ['gym'],
  },
  studio:   {
    type: 'gym',
    keyword: 'dance fitness studio',
    mustHaveAll: [],
    mustHaveAny: ['gym', 'health'],
  },
  other:    {
    type: 'spa',
    keyword: 'spa wellness',
    mustHaveAll: [],
    mustHaveAny: ['spa', 'beauty_salon', 'health'],
  },
};

// Filter options returned in every /places response for frontend chips
const PLACE_FILTERS = [
  { key: 'all',      label: 'All',        icon: 'filter_list'    },
  { key: 'gym',      label: 'Gyms',       icon: 'fitness_center' },
  { key: 'yoga',     label: 'Yoga',       icon: 'self_improvement' },
  { key: 'physio',   label: 'Physio',     icon: 'medical_services' },
  { key: 'sports',   label: 'Sports',     icon: 'sports'         },
  { key: 'pool',     label: 'Pool',       icon: 'pool'           },
  { key: 'crossfit', label: 'CrossFit',   icon: 'directions_run' },
  { key: 'studio',   label: 'Studio',     icon: 'music_note'     },
  { key: 'other',    label: 'Other',      icon: 'spa'            },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function getPhotoUrl(photoRef, maxWidth = 400) {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${photoRef}&key=${PLACES_API_KEY}`;
}

// ─── People ───────────────────────────────────────────────────────────────────

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
  if (fitness_goal)  query = query.contains('fitness_goals',  [fitness_goal]);
  if (workout_type)  query = query.contains('workout_types', [workout_type]);

  const { data: candidates, error } = await query.limit(200);
  if (error) throw new Error(error.message);

  const scored = (candidates || [])
    .map(p => {
      const distKm = (me?.latitude && p.latitude)
        ? haversineKm(me.latitude, me.longitude, p.latitude, p.longitude)
        : 999;
      return {
        ...p,
        distance_km: Math.round(distKm),
        compatibility_score: me ? computeScore(me, p, distKm) : 0,
      };
    })
    .filter(p => p.distance_km <= distance_km)
    .sort((a, b) => b.compatibility_score - a.compatibility_score);

  const offset = (page - 1) * limit;
  return { people: scored.slice(offset, offset + limit), total: scored.length, page, limit };
}

// ─── Events ───────────────────────────────────────────────────────────────────
// Supports filter: type (all | gym | yoga | physio | sports | run | event)
//                  date  (YYYY-MM-DD — filter by day)
//                  lat, lng + distance_km (proximity filter)

async function getEvents(userId, page, limit, filters = {}) {
  const offset   = (page - 1) * limit;
  const { date, type, lat, lng, distance_km = 50 } = filters;

  let query = supabaseAdmin
    .from('events')
    .select(
      'id, title, description, type, start_date, end_date, location, ' +
      'latitude, longitude, cover_image_url, going_count, price, is_free, tags',
      { count: 'exact' }
    )
    .gte('end_date', new Date().toISOString())
    .order('start_date', { ascending: true });

  // Filter by type chip (All / Gyms / Yoga / Physio / Events)
  if (type && type !== 'all') {
    query = query.eq('type', type);
  }

  // Filter by selected calendar date
  if (date) {
    const dayStart = new Date(date); dayStart.setHours(0,  0,  0,   0);
    const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999);
    query = query
      .gte('start_date', dayStart.toISOString())
      .lte('start_date', dayEnd.toISOString());
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  // Proximity filter (if user location is provided)
  let events = data || [];
  if (lat && lng) {
    events = events
      .map(e => ({
        ...e,
        distance_km: (e.latitude && e.longitude)
          ? parseFloat(haversineKm(lat, lng, e.latitude, e.longitude).toFixed(1))
          : null,
      }))
      .filter(e => !e.distance_km || e.distance_km <= distance_km)
      .sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
  }

  // Check which events the current user is attending
  const { data: attending } = await supabaseAdmin
    .from('event_attendees')
    .select('event_id')
    .eq('user_id', userId);

  const attendingSet = new Set((attending || []).map(a => a.event_id));
  events = events.map(e => ({ ...e, is_going: attendingSet.has(e.id) }));

  return { events, total: count, page, limit };
}

// ─── RSVP to event ────────────────────────────────────────────────────────────

async function toggleEventAttendance(userId, eventId) {
  // Check if already attending
  const { data: existing } = await supabaseAdmin
    .from('event_attendees')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .single();

  if (existing) {
    // Leave event
    await supabaseAdmin
      .from('event_attendees')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId);
    return { is_going: false };
  } else {
    // Join event
    await supabaseAdmin
      .from('event_attendees')
      .insert({ event_id: eventId, user_id: userId });
    return { is_going: true };
  }
}

// ─── Nearby Places (Google Places API) ───────────────────────────────────────
// filter: all | gym | yoga | physio | sports | pool | crossfit | studio | other

async function getNearbyPlaces(userId, filters = {}) {
  const { type = 'all', distance_km = 5, page = 1, limit = 20 } = filters;

  // Get user location
  const { data: me } = await supabaseAdmin
    .from('profiles')
    .select('latitude, longitude')
    .eq('id', userId)
    .single();

  if (!me?.latitude || !me?.longitude) {
    return { filters: PLACE_FILTERS, places: [], total: 0, page, limit, source: 'google', error: 'User location not set' };
  }

  const { latitude: lat, longitude: lng } = me;
  const radiusMeters = Math.min(distance_km * 1000, 50000); // max 50 km

  console.log(`[Places] user=${userId} lat=${lat} lng=${lng} radius=${radiusMeters}m type=${type}`);

  // ── Helper: one Google Places Nearby Search call ──────────────────────────
  async function fetchGoogleType(placeType, keyword) {
    let url =
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
      `?location=${lat},${lng}` +
      `&radius=${radiusMeters}` +
      `&type=${encodeURIComponent(placeType)}` +
      `&key=${PLACES_API_KEY}`;
    if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`;
    try {
      const res = await fetchJson(url);
      if (res.status !== 'OK' && res.status !== 'ZERO_RESULTS') {
        console.error(`[Places] placeType=${placeType} status=${res.status} err=${res.error_message || ''}`);
      }
      return res.results || [];
    } catch (err) {
      console.error(`[Places] fetch failed placeType=${placeType}:`, err.message);
      return [];
    }
  }

  // ── Helper: deduplicate + validate + shape raw Google results ─────────────
  // mustHaveAll : every tag must be present (AND)
  // mustHaveAny : at least one tag must be present (OR) — empty = no filter
  function shapePlaces(rawList, mustHaveAll = [], mustHaveAny = []) {
    const seen   = new Set();
    const result = [];

    for (const p of rawList) {
      if (seen.has(p.place_id)) continue;

      const types = p.types || [];

      // AND check — all required tags must be present
      if (mustHaveAll.length > 0 && !mustHaveAll.every(t => types.includes(t))) {
        console.log(`[Places] skip(AND) "${p.name}" types=[${types.join(',')}]`);
        continue;
      }

      // OR check — at least one tag must be present
      if (mustHaveAny.length > 0 && !mustHaveAny.some(t => types.includes(t))) {
        console.log(`[Places] skip(OR) "${p.name}" types=[${types.join(',')}]`);
        continue;
      }

      seen.add(p.place_id);

      const pLat   = p.geometry?.location?.lat;
      const pLng   = p.geometry?.location?.lng;
      const distKm = (pLat && pLng)
        ? parseFloat(haversineKm(lat, lng, pLat, pLng).toFixed(1))
        : null;

      result.push({
        place_id    : p.place_id,
        name        : p.name,
        address     : p.vicinity || '',
        rating      : p.rating   ?? null,
        reviews     : p.user_ratings_total ?? 0,
        is_open     : p.opening_hours?.open_now ?? null,
        tags        : types.filter(t => !['point_of_interest', 'establishment'].includes(t)),
        photo_url   : p.photos?.[0]?.photo_reference
                        ? getPhotoUrl(p.photos[0].photo_reference)
                        : null,
        latitude    : pLat,
        longitude   : pLng,
        distance_km : distKm,
        source      : 'google',
      });
    }

    return result;
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────
  let places = [];

  if (type === 'all') {
    // Fetch only fitness types: gym | yoga | physio | sports | pool | crossfit | studio
    // 'spa' (other) is intentionally excluded
    const fitnessFetchTypes = ['gym', 'physiotherapist', 'sports_club', 'swimming_pool'];

    // A result is kept for 'all' if it has at least one fitness-related Google tag
    const fitnessAnyTags = [
      'gym', 'yoga_studio', 'health',
      'physiotherapist', 'doctor',
      'sports_club', 'stadium',
      'swimming_pool',
    ];

    const allRaw = await Promise.all(fitnessFetchTypes.map(t => fetchGoogleType(t, null)));
    places = shapePlaces(allRaw.flat(), [], fitnessAnyTags);

  } else {
    const config = FILTER_CONFIG[type];

    if (!config) {
      return { filters: PLACE_FILTERS, places: [], total: 0, page, limit, source: 'google', error: `Unknown filter type: ${type}` };
    }

    const rawResults = await fetchGoogleType(config.type, config.keyword);
    places = shapePlaces(rawResults, config.mustHaveAll, config.mustHaveAny);
  }

  // Sort by distance, nearest first
  places.sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));

  // Paginate
  const offset = (page - 1) * limit;
  return {
    filters  : PLACE_FILTERS,
    places   : places.slice(offset, offset + limit),
    total    : places.length,
    page,
    limit,
    has_more : offset + limit < places.length,
    source   : 'google',
  };
}

// ─── Search ───────────────────────────────────────────────────────────────────

async function search(userId, query) {
  const [
    { data: people   },
    { data: trainers },
    { data: events   },
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
      .select('id, title, start_date, location, cover_image_url, is_free, type')
      .gte('end_date', new Date().toISOString())
      .ilike('title', `%${query}%`)
      .limit(10),
  ]);

  return {
    people   : people    || [],
    trainers : trainers  || [],
    events   : events    || [],
  };
}

module.exports = {
  getPeople,
  getEvents,
  toggleEventAttendance,
  getNearbyPlaces,
  search,
};
