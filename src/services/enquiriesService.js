const { supabaseAdmin } = require('../config/supabase');

/* ── Individual sends enquiry to a trainer ─────────────────────────────────── */
async function sendEnquiry(clientId, trainerId, message) {
  // Ensure trainer is actually a professional
  const { data: trainer } = await supabaseAdmin
    .from('profiles').select('id, user_type, name').eq('id', trainerId).single();
  if (!trainer || trainer.user_type !== 'professional')
    throw Object.assign(new Error('Trainer not found'), { status: 404 });

  // Upsert — re-open if previously declined
  const { data, error } = await supabaseAdmin
    .from('enquiries')
    .upsert({
      trainer_id: trainerId,
      client_id:  clientId,
      message,
      status:     'new',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'trainer_id,client_id' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/* ── Trainer gets their enquiry list ───────────────────────────────────────── */
async function getEnquiries(trainerId, filters = {}) {
  const { status, page = 1, limit = 20 } = filters;

  let query = supabaseAdmin
    .from('enquiries')
    .select(`
      id, message, status, created_at, match_id,
      client:client_id (
        id, name, avatar_url, fitness_goals, fitness_level,
        location, latitude, longitude, preferred_training_time,
        prompt_philosophy
      )
    `)
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Get trainer's location for distance calc
  const { data: me } = await supabaseAdmin
    .from('profiles').select('latitude, longitude').eq('id', trainerId).single();

  const { haversineKm } = require('./scoringService');
  const enquiries = (data || []).map(e => {
    const c = e.client;
    const distKm = (me?.latitude && c?.latitude)
      ? Math.round(haversineKm(me.latitude, me.longitude, c.latitude, c.longitude))
      : null;
    return { ...e, client: { ...c, distance_km: distKm } };
  });

  const offset = (page - 1) * limit;
  return {
    enquiries: enquiries.slice(offset, offset + limit),
    total:     enquiries.length,
    page,
    limit,
    has_more:  offset + limit < enquiries.length,
  };
}

/* ── Trainer stats ─────────────────────────────────────────────────────────── */
async function getEnquiryStats(trainerId) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data, error } = await supabaseAdmin
    .from('enquiries')
    .select('id, status, created_at')
    .eq('trainer_id', trainerId);

  if (error) throw new Error(error.message);

  const all    = data || [];
  const newQ   = all.filter(e => e.status === 'new').length;
  const thisWk = all.filter(e => new Date(e.created_at) >= weekAgo).length;

  return { new: newQ, this_week: thisWk, total: all.length };
}

/* ── Single enquiry detail ─────────────────────────────────────────────────── */
async function getEnquiryDetail(trainerId, enquiryId) {
  const { data, error } = await supabaseAdmin
    .from('enquiries')
    .select(`
      id, message, status, created_at, match_id,
      client:client_id (
        id, name, avatar_url, bio,
        fitness_goals, fitness_level, workout_types,
        location, latitude, longitude,
        preferred_training_time, preferred_gender_filter,
        prompt_philosophy, prompt_best_result, prompt_love_working,
        date_of_birth
      )
    `)
    .eq('id', enquiryId)
    .eq('trainer_id', trainerId)
    .single();

  if (error || !data) throw Object.assign(new Error('Enquiry not found'), { status: 404 });

  // Compute age from date_of_birth
  const client = data.client;
  let age = null;
  if (client?.date_of_birth) {
    const dob  = new Date(client.date_of_birth);
    const diff = Date.now() - dob.getTime();
    age = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  }

  // Distance
  const { data: me } = await supabaseAdmin
    .from('profiles').select('latitude, longitude').eq('id', trainerId).single();
  const { haversineKm } = require('./scoringService');
  const distance_km = (me?.latitude && client?.latitude)
    ? Math.round(haversineKm(me.latitude, me.longitude, client.latitude, client.longitude))
    : null;

  return { ...data, client: { ...client, age, distance_km } };
}

/* ── Accept enquiry → create match + open chat ─────────────────────────────── */
async function acceptEnquiry(trainerId, enquiryId) {
  const { data: enquiry } = await supabaseAdmin
    .from('enquiries').select('*').eq('id', enquiryId).eq('trainer_id', trainerId).single();

  if (!enquiry) throw Object.assign(new Error('Enquiry not found'), { status: 404 });
  if (enquiry.status === 'accepted') {
    return { already_accepted: true, match_id: enquiry.match_id };
  }

  // Create match (deterministic ordering: smaller UUID first)
  const [u1, u2] = [trainerId, enquiry.client_id].sort();
  const { data: match, error: matchErr } = await supabaseAdmin
    .from('matches')
    .upsert({ user1_id: u1, user2_id: u2 }, { onConflict: 'user1_id,user2_id' })
    .select()
    .single();

  if (matchErr) throw new Error(matchErr.message);

  // Update enquiry status + link match
  await supabaseAdmin
    .from('enquiries')
    .update({ status: 'accepted', match_id: match.id, updated_at: new Date().toISOString() })
    .eq('id', enquiryId);

  return { accepted: true, match_id: match.id };
}

/* ── Decline enquiry ───────────────────────────────────────────────────────── */
async function declineEnquiry(trainerId, enquiryId) {
  const { error } = await supabaseAdmin
    .from('enquiries')
    .update({ status: 'declined', updated_at: new Date().toISOString() })
    .eq('id', enquiryId)
    .eq('trainer_id', trainerId);

  if (error) throw new Error(error.message);
  return { declined: true };
}

module.exports = { sendEnquiry, getEnquiries, getEnquiryStats, getEnquiryDetail, acceptEnquiry, declineEnquiry };
