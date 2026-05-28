const https  = require('https');
const { supabaseAdmin } = require('../config/supabase');
const { computeScore, haversineKm } = require('./scoringService');

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// ─── Google Places type map ───────────────────────────────────────────────────
const FILTER_TO_PLACES_TYPE = {
  gym:      'gym',
  yoga:     'yoga_studio',
  physio:   'physiotherapist',
  sports:   'sports_club',
  pool:     'swimming_pool',
  crossfit: 'gym',        // no dedicated crossfit type in Google Places
  studio:   'health',     // closest match for dance/fitness studios
  other:    'spa',        // wellness/other health places
};

// All Google types fetched when filter = "all"
const ALL_PLACE_TYPES = [
  'gym',
  'yoga_studio',
  'physiotherapist',
  'sports_club',
  'swimming_pool',
  'health',
  'spa',
];

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
// filter: all | gyms | yoga | physio | sports

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

  console.log(`[Places] Fetching for user=${userId} lat=${me.latitude} lng=${me.longitude} radius=${Math.min(distance_km * 1000, 50000)}m type=${type}`);

  const { latitude: lat, longitude: lng } = me;
  const radiusMeters = Math.min(distance_km * 1000, 50000); // max 50km

  // Build list of Google Places types to fetch
  const uniqueTypes = type === 'all'
    ? ALL_PLACE_TYPES
    : [...new Set([FILTER_TO_PLACES_TYPE[type] || type])];

  // Fetch all types in parallel
  const allResults = await Promise.all(
    uniqueTypes.map(async placeType => {
      const url =
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
        `?location=${lat},${lng}` +
        `&radius=${radiusMeters}` +
        `&type=${placeType}` +
        `&key=${PLACES_API_KEY}`;
      try {
        const res = await fetchJson(url);
        // Log Google's status for debugging
        if (res.status !== 'OK' && res.status !== 'ZERO_RESULTS') {
          console.error(`[Places] type=${placeType} status=${res.status} error=${res.error_message || ''}`);
        }
        return res.results || [];
      } catch (err) {
        console.error(`[Places] fetch failed for type=${placeType}:`, err.message);
        return [];
      }
    })
  );

  // Flatten + deduplicate by place_id
  const seen    = new Set();
  const places  = [];

  for (const results of allResults) {
    for (const p of results) {
      if (seen.has(p.place_id)) continue;
      seen.add(p.place_id);

      const pLat = p.geometry?.location?.lat;
      const pLng = p.geometry?.location?.lng;
      const distKm = (pLat && pLng)
        ? parseFloat(haversineKm(lat, lng, pLat, pLng).toFixed(1))
        : null;

      places.push({
        place_id    : p.place_id,
        name        : p.name,
        address     : p.vicinity || '',
        rating      : p.rating ?? null,
        reviews     : p.user_ratings_total ?? 0,
        is_open     : p.opening_hours?.open_now ?? null,
        tags        : p.types?.filter(t => !['point_of_interest','establishment'].includes(t)) || [],
        photo_url   : p.photos?.[0]?.photo_reference
                        ? getPhotoUrl(p.photos[0].photo_reference)
                        : null,
        latitude    : pLat,
        longitude   : pLng,
        distance_km : distKm,
        source      : 'google',
      });
    }
  }

  // Sort by distance
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
