const { supabaseAdmin } = require('../config/supabase');
const { haversineKm }   = require('./scoringService');

// ─── Specialty → Section mapping ──────────────────────────────────────────────
// Each section shows on the Social screen as a horizontal row.
// A professional is placed in the FIRST section whose keywords match any of
// their specialty array entries (case-insensitive).
const SPECIALTY_SECTIONS = [
  {
    key   : 'trainers',
    title : 'TRAINERS NEAR YOU',
    match : ['personal trainer', 'strength coach', 'fitness trainer', 'fitness coach',
             'hiit', 'bodybuilding', 'crossfit', 'weight training', 'powerlifting'],
  },
  {
    key   : 'yoga_wellness',
    title : 'YOGA & WELLNESS',
    match : ['yoga', 'meditation', 'pilates', 'mindfulness', 'wellness', 'flexibility',
             'breathwork', 'zumba', 'dance'],
  },
  {
    key   : 'nutrition',
    title : 'NUTRITION & DIET',
    match : ['nutrition', 'nutritionist', 'dietitian', 'diet', 'weight loss', 'meal planning'],
  },
  {
    key   : 'physio',
    title : 'PHYSIO & REHAB',
    match : ['physiotherapy', 'physiotherapist', 'rehabilitation', 'sports medicine',
             'sports therapy', 'injury recovery', 'chiropractic'],
  },
  {
    key   : 'sports',
    title : 'SPORTS COACHING',
    match : ['sports coach', 'athletics', 'swimming coach', 'cricket', 'football',
             'tennis', 'badminton', 'boxing', 'martial arts', 'running coach'],
  },
];

function matchSection(specialties = []) {
  const lower = specialties.map(s => s.toLowerCase());
  for (const section of SPECIALTY_SECTIONS) {
    if (section.match.some(kw => lower.some(sp => sp.includes(kw)))) {
      return section.key;
    }
  }
  return null; // doesn't fit any section → excluded from social screen
}

// ─── Professionals Near You ───────────────────────────────────────────────────

async function getProfessionalsNearYou(userId, filters = {}) {
  const { distance_km = 50, limit_per_section = 10 } = filters;

  // Requesting user's location
  const { data: me } = await supabaseAdmin
    .from('profiles')
    .select('latitude, longitude')
    .eq('id', userId)
    .single();

  // Fetch all professionals with onboarding done
  const { data: pros, error } = await supabaseAdmin
    .from('profiles')
    .select('id, name, avatar_url, specialty, location, rating, reviews_count, latitude, longitude, user_type')
    .eq('user_type', 'professional')
    .eq('onboarding_completed', true)
    .neq('id', userId)
    .not('specialty', 'is', null)
    .limit(500);

  if (error) throw new Error(error.message);

  // Attach distance
  const withDist = (pros || []).map(p => {
    const distKm = (me?.latitude && p.latitude)
      ? parseFloat(haversineKm(me.latitude, me.longitude, p.latitude, p.longitude).toFixed(1))
      : 9999;
    return { ...p, distance_km: distKm };
  });

  // Filter by distance if user has location
  const nearby = me?.latitude
    ? withDist.filter(p => p.distance_km <= distance_km)
    : withDist;

  // Sort by distance then rating
  nearby.sort((a, b) => {
    if (a.distance_km !== b.distance_km) return a.distance_km - b.distance_km;
    return (b.rating || 0) - (a.rating || 0);
  });

  // Group into sections
  const sectionMap = {};
  for (const pro of nearby) {
    const key = matchSection(pro.specialty || []);
    if (!key) continue;
    if (!sectionMap[key]) sectionMap[key] = [];
    if (sectionMap[key].length < limit_per_section) {
      sectionMap[key].push({
        id           : pro.id,
        name         : pro.name,
        avatar_url   : pro.avatar_url,
        specialty    : pro.specialty,
        location     : pro.location,
        rating       : pro.rating   ?? null,
        reviews_count: pro.reviews_count ?? 0,
        distance_km  : pro.distance_km,
      });
    }
  }

  // Build ordered sections, skip empty ones
  const sections = SPECIALTY_SECTIONS
    .filter(s => sectionMap[s.key]?.length > 0)
    .map(s => ({
      key          : s.key,
      title        : s.title,
      professionals: sectionMap[s.key],
    }));

  return { sections, total_professionals: nearby.length };
}

// ─── Groups ───────────────────────────────────────────────────────────────────

async function getMyGroups(userId) {
  const [
    { data: userProfile },
    { data: memberships, error },
  ] = await Promise.all([
    supabaseAdmin.from('profiles').select('latitude, longitude').eq('id', userId).single(),
    supabaseAdmin
      .from('group_members')
      .select(`
        role, joined_at,
        group:group_id (
          id, name, description, cover_image_url, category,
          creator_id, is_private, member_count,
          location, latitude, longitude, created_at
        )
      `)
      .eq('user_id', userId)
      .order('joined_at', { ascending: false }),
  ]);

  if (error) throw new Error(error.message);

  const groupIds = (memberships || []).map(m => m.group?.id).filter(Boolean);

  // Fetch next upcoming event for each group in one query
  const nextEventMap = {};
  if (groupIds.length > 0) {
    const { data: events } = await supabaseAdmin
      .from('group_events')
      .select('group_id, id, title, start_date, location, going_count')
      .in('group_id', groupIds)
      .gte('start_date', new Date().toISOString())
      .order('start_date', { ascending: true });

    for (const ev of (events || [])) {
      if (!nextEventMap[ev.group_id]) nextEventMap[ev.group_id] = ev;
    }
  }

  const uLat = userProfile?.latitude;
  const uLon = userProfile?.longitude;

  const groups = (memberships || []).map(m => {
    const g = m.group;
    const distance_km = (uLat && uLon && g.latitude && g.longitude)
      ? Math.round(haversineKm(uLat, uLon, g.latitude, g.longitude) * 10) / 10
      : null;

    return {
      ...g,
      role       : m.role,
      joined_at  : m.joined_at,
      distance_km,
      next_event : nextEventMap[g.id] || null,
    };
  });

  return { groups, total: groups.length };
}

async function createGroup(userId, body) {
  const { name, description, category, is_private, cover_image_url, location, latitude, longitude } = body;

  if (!name?.trim()) {
    throw Object.assign(new Error('name is required'), { statusCode: 400 });
  }

  const { data: group, error } = await supabaseAdmin
    .from('groups')
    .insert({
      name           : name.trim(),
      description    : description    || null,
      category       : category       || 'general',
      is_private     : is_private     ?? false,
      cover_image_url: cover_image_url || null,
      location       : location       || null,
      latitude       : latitude       ?? null,
      longitude      : longitude      ?? null,
      creator_id     : userId,
      member_count   : 1,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from('group_members')
    .insert({ group_id: group.id, user_id: userId, role: 'admin' });

  return { ...group, role: 'admin' };
}

async function getGroupDetail(userId, groupId) {
  const [
    { data: userProfile },
    { data: group, error },
    { data: membership },
    { data: members },
    { data: upcomingEvents },
  ] = await Promise.all([
    supabaseAdmin.from('profiles').select('latitude, longitude').eq('id', userId).single(),

    supabaseAdmin
      .from('groups')
      .select('id, name, description, cover_image_url, category, creator_id, is_private, member_count, location, latitude, longitude, created_at')
      .eq('id', groupId)
      .single(),

    supabaseAdmin
      .from('group_members')
      .select('role, joined_at')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single(),

    // First 8 members (admin first, then by join date)
    supabaseAdmin
      .from('group_members')
      .select('role, joined_at, user:user_id (id, name, avatar_url)')
      .eq('group_id', groupId)
      .order('role',      { ascending: true })  // 'admin' < 'member' alphabetically
      .order('joined_at', { ascending: true })
      .limit(8),

    // Next 5 upcoming events
    supabaseAdmin
      .from('group_events')
      .select('id, title, description, start_date, end_date, location, going_count, cover_image_url, is_free, price')
      .eq('group_id', groupId)
      .gte('start_date', new Date().toISOString())
      .order('start_date', { ascending: true })
      .limit(5),
  ]);

  if (error || !group) {
    throw Object.assign(new Error('Group not found'), { statusCode: 404 });
  }

  const uLat = userProfile?.latitude;
  const uLon = userProfile?.longitude;
  const distance_km = (uLat && uLon && group.latitude && group.longitude)
    ? Math.round(haversineKm(uLat, uLon, group.latitude, group.longitude) * 10) / 10
    : null;

  const membersList = (members || []).map(m => ({
    ...m.user,
    role     : m.role,
    is_admin : m.role === 'admin',
    joined_at: m.joined_at,
  }));

  return {
    ...group,
    distance_km,
    is_member       : !!membership,
    role            : membership?.role || null,
    joined_at       : membership?.joined_at || null,
    members_preview : membersList,
    upcoming_events : upcomingEvents || [],
  };
}

async function joinGroup(userId, groupId) {
  // Check group exists
  const { data: group, error: groupErr } = await supabaseAdmin
    .from('groups')
    .select('id, name, is_private, member_count')
    .eq('id', groupId)
    .single();

  if (groupErr || !group) {
    throw Object.assign(new Error('Group not found'), { statusCode: 404 });
  }

  // Check not already a member
  const { data: existing } = await supabaseAdmin
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .single();

  if (existing) {
    throw Object.assign(new Error('Already a member of this group'), { statusCode: 409 });
  }

  // Add member
  await supabaseAdmin
    .from('group_members')
    .insert({ group_id: groupId, user_id: userId, role: 'member' });

  // Increment member_count
  await supabaseAdmin
    .from('groups')
    .update({ member_count: group.member_count + 1 })
    .eq('id', groupId);

  return { message: `Joined "${group.name}" successfully`, group_id: groupId };
}

async function addMember(requesterId, groupId, targetUserId) {
  // Only admins can add members
  const { data: requesterMembership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', requesterId)
    .single();

  if (!requesterMembership || requesterMembership.role !== 'admin') {
    throw Object.assign(new Error('Only group admins can add members'), { statusCode: 403 });
  }

  // Check target user exists
  const { data: target } = await supabaseAdmin
    .from('profiles')
    .select('id, name')
    .eq('id', targetUserId)
    .single();

  if (!target) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }

  // Check not already a member
  const { data: existing } = await supabaseAdmin
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', targetUserId)
    .single();

  if (existing) {
    throw Object.assign(new Error('User is already in this group'), { statusCode: 409 });
  }

  await supabaseAdmin
    .from('group_members')
    .insert({ group_id: groupId, user_id: targetUserId, role: 'member' });

  // Increment member_count
  const { data: group } = await supabaseAdmin
    .from('groups').select('member_count').eq('id', groupId).single();

  await supabaseAdmin
    .from('groups')
    .update({ member_count: (group?.member_count || 0) + 1 })
    .eq('id', groupId);

  return { message: `${target.name} added to group`, group_id: groupId };
}

async function leaveGroup(userId, groupId) {
  const { data: group, error: groupErr } = await supabaseAdmin
    .from('groups')
    .select('id, name, creator_id, member_count')
    .eq('id', groupId)
    .single();

  if (groupErr || !group) {
    throw Object.assign(new Error('Group not found'), { statusCode: 404 });
  }

  // Creator cannot leave — must delete group or transfer ownership
  if (group.creator_id === userId) {
    throw Object.assign(
      new Error('You created this group. Delete the group or transfer admin to someone else first.'),
      { statusCode: 400 }
    );
  }

  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .single();

  if (!membership) {
    throw Object.assign(new Error('You are not a member of this group'), { statusCode: 404 });
  }

  await supabaseAdmin
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  // Decrement member_count
  await supabaseAdmin
    .from('groups')
    .update({ member_count: Math.max(0, (group.member_count || 1) - 1) })
    .eq('id', groupId);

  return { message: `Left "${group.name}" successfully` };
}

// ─── Group Events ─────────────────────────────────────────────────────────────

async function createGroupEvent(userId, groupId, body) {
  const { title, description, start_date, end_date, location, latitude, longitude, cover_image_url, is_free, price } = body;

  if (!title?.trim())  throw Object.assign(new Error('title is required'),      { statusCode: 400 });
  if (!start_date)     throw Object.assign(new Error('start_date is required'), { statusCode: 400 });
  if (!end_date)       throw Object.assign(new Error('end_date is required'),   { statusCode: 400 });

  // Requester must be a member (any role can create events)
  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .single();

  if (!membership) {
    throw Object.assign(new Error('You must be a member to create events'), { statusCode: 403 });
  }

  const { data: event, error } = await supabaseAdmin
    .from('group_events')
    .insert({
      group_id        : groupId,
      title           : title.trim(),
      description     : description    || null,
      start_date,
      end_date,
      location        : location       || null,
      latitude        : latitude       || null,
      longitude       : longitude      || null,
      cover_image_url : cover_image_url || null,
      is_free         : is_free        ?? true,
      price           : is_free        ? 0 : (price || 0),
      created_by      : userId,
      going_count     : 1,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Auto-RSVP the creator
  try {
    await supabaseAdmin
      .from('group_event_attendees')
      .insert({ group_event_id: event.id, user_id: userId });
  } catch (_) {
    // ignore if somehow duplicate
  }

  return { ...event, is_going: true };
}

async function getGroupEvents(userId, groupId, page = 1, limit = 20) {
  // Verify membership
  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .single();

  if (!membership) {
    throw Object.assign(new Error('You must be a member to view group events'), { statusCode: 403 });
  }

  const offset = (page - 1) * limit;

  const { data: events, error, count } = await supabaseAdmin
    .from('group_events')
    .select('id, title, description, start_date, end_date, location, latitude, longitude, cover_image_url, going_count, is_free, price, created_by, created_at', { count: 'exact' })
    .eq('group_id', groupId)
    .gte('end_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  // Check which events the user is attending
  const eventIds = (events || []).map(e => e.id);
  let attendingSet = new Set();
  if (eventIds.length > 0) {
    const { data: attending } = await supabaseAdmin
      .from('group_event_attendees')
      .select('group_event_id')
      .eq('user_id', userId)
      .in('group_event_id', eventIds);
    attendingSet = new Set((attending || []).map(a => a.group_event_id));
  }

  const eventsWithRsvp = (events || []).map(e => ({
    ...e,
    is_going: attendingSet.has(e.id),
  }));

  return { events: eventsWithRsvp, total: count, page, limit, has_more: offset + limit < count };
}

async function toggleGroupEventAttendance(userId, groupId, eventId) {
  // Must be group member
  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .single();

  if (!membership) {
    throw Object.assign(new Error('You must be a group member to RSVP'), { statusCode: 403 });
  }

  const { data: event } = await supabaseAdmin
    .from('group_events')
    .select('id, going_count')
    .eq('id', eventId)
    .eq('group_id', groupId)
    .single();

  if (!event) {
    throw Object.assign(new Error('Event not found'), { statusCode: 404 });
  }

  const { data: existing } = await supabaseAdmin
    .from('group_event_attendees')
    .select('id')
    .eq('group_event_id', eventId)
    .eq('user_id', userId)
    .single();

  if (existing) {
    await supabaseAdmin
      .from('group_event_attendees')
      .delete()
      .eq('group_event_id', eventId)
      .eq('user_id', userId);

    await supabaseAdmin
      .from('group_events')
      .update({ going_count: Math.max(0, event.going_count - 1) })
      .eq('id', eventId);

    return { is_going: false };
  } else {
    await supabaseAdmin
      .from('group_event_attendees')
      .insert({ group_event_id: eventId, user_id: userId });

    await supabaseAdmin
      .from('group_events')
      .update({ going_count: event.going_count + 1 })
      .eq('id', eventId);

    return { is_going: true };
  }
}

async function searchGroups(userId, { q, category, page, limit }) {
  let query = supabaseAdmin
    .from('groups')
    .select('id, name, description, cover_image_url, category, is_private, member_count, location, latitude, longitude, created_at, creator_id', { count: 'exact' })
    .eq('is_private', false);

  if (q?.trim()) {
    query = query.ilike('name', `%${q.trim()}%`);
  }

  if (category) {
    query = query.eq('category', category);
  }

  const offset = (page - 1) * limit;
  const [
    { data: groups, error, count },
    { data: userProfile },
  ] = await Promise.all([
    query.order('member_count', { ascending: false }).range(offset, offset + limit - 1),
    supabaseAdmin.from('profiles').select('latitude, longitude').eq('id', userId).single(),
  ]);

  if (error) throw new Error(error.message);

  const { data: memberships } = await supabaseAdmin
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
    .in('group_id', (groups || []).map(g => g.id));

  const joinedSet = new Set((memberships || []).map(m => m.group_id));
  const uLat = userProfile?.latitude;
  const uLon = userProfile?.longitude;

  return {
    groups: (groups || []).map(g => ({
      ...g,
      is_member  : joinedSet.has(g.id),
      distance_km: (uLat && uLon && g.latitude && g.longitude)
        ? Math.round(haversineKm(uLat, uLon, g.latitude, g.longitude) * 10) / 10
        : null,
    })),
    total: count,
    page,
    limit,
  };
}

module.exports = {
  getProfessionalsNearYou,
  getMyGroups,
  searchGroups,
  createGroup,
  getGroupDetail,
  joinGroup,
  addMember,
  leaveGroup,
  createGroupEvent,
  getGroupEvents,
  toggleGroupEventAttendance,
};
