const { supabaseAdmin } = require('../config/supabase');

async function listEvents(page, limit, status) {
  const offset = (page - 1) * limit;
  const now = new Date().toISOString();

  let query = supabaseAdmin
    .from('events')
    .select('*', { count: 'exact' })
    .order('start_date', { ascending: false });

  if (status === 'upcoming') query = query.gte('end_date', now);
  else if (status === 'past')  query = query.lt('end_date', now);

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return { events: data || [], total: count, page, limit };
}

async function getEvent(eventId) {
  const { data, error } = await supabaseAdmin
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (error) throw Object.assign(new Error('Event not found'), { status: 404 });
  return data;
}

async function createEvent(body, adminId) {
  const { data, error } = await supabaseAdmin
    .from('events')
    .insert({ ...body, created_by: adminId })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function updateEvent(eventId, updates) {
  const allowed = ['title', 'description', 'start_date', 'end_date', 'location', 'cover_image_url'];
  const sanitized = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) sanitized[key] = updates[key];
  }

  const { data, error } = await supabaseAdmin
    .from('events')
    .update(sanitized)
    .eq('id', eventId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function deleteEvent(eventId) {
  const { error } = await supabaseAdmin.from('events').delete().eq('id', eventId);
  if (error) throw new Error(error.message);
}

module.exports = { listEvents, getEvent, createEvent, updateEvent, deleteEvent };
