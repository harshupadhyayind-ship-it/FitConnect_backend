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
  // Also clean up the cover image from storage if it's ours
  const { data: event } = await supabaseAdmin.from('events').select('cover_image_url').eq('id', eventId).single();
  if (event?.cover_image_url) {
    try {
      const match = event.cover_image_url.match(/\/event-covers\/(.+)$/);
      if (match) await supabaseAdmin.storage.from('event-covers').remove([decodeURIComponent(match[1])]);
    } catch (_) { /* ignore storage errors */ }
  }
  const { error } = await supabaseAdmin.from('events').delete().eq('id', eventId);
  if (error) throw new Error(error.message);
}

async function uploadCoverImage(buffer, fileName, mimetype) {
  const { error } = await supabaseAdmin.storage
    .from('event-covers')
    .upload(fileName, buffer, { contentType: mimetype, upsert: false });

  if (error) throw new Error(error.message);

  const { data } = supabaseAdmin.storage.from('event-covers').getPublicUrl(fileName);
  return data.publicUrl;
}

module.exports = { listEvents, getEvent, createEvent, updateEvent, deleteEvent, uploadCoverImage };
