const { supabaseAdmin } = require('../config/supabase');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

function err(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

/** Combines a DATE string and a TIME string into a JS Date. */
function toDateTime(date, time) {
  const t = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${t}`);
}

/** True if [aStart,aEnd) overlaps [bStart,bEnd) — covers every overlap scenario
 *  (partial start/end overlap, and either interval fully containing the other). */
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function validateBookingInput({ date, start_time, end_time }) {
  if (!date || !DATE_RE.test(date)) {
    throw err('date is required in YYYY-MM-DD format', 400);
  }
  if (!start_time || !TIME_RE.test(start_time)) {
    throw err('start_time is required in HH:MM (24-hour) format', 400);
  }
  if (!end_time || !TIME_RE.test(end_time)) {
    throw err('end_time is required in HH:MM (24-hour) format', 400);
  }

  const start = toDateTime(date, start_time);
  const end = toDateTime(date, end_time);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw err('date/start_time/end_time do not form a valid date-time', 400);
  }
  if (start >= end) {
    throw err('start_time must be before end_time', 400);
  }
  if (start < new Date()) {
    throw err('Cannot book a slot in the past', 400);
  }

  return { start, end };
}

/**
 * App-level pre-check purely for a clean, specific error message.
 * The database exclusion constraints (migration 022) are the actual
 * safety net for concurrent requests racing this check — see bookSlot().
 */
async function assertNoOverlap({ professionalId, userId, date, start, end }) {
  const { data: sameDay, error } = await supabaseAdmin
    .from('training_slots')
    .select('id, professional_id, user_id, start_time, end_time')
    .eq('date', date)
    .eq('status', 'booked')
    .or(`professional_id.eq.${professionalId},user_id.eq.${userId}`);

  if (error) throw new Error(error.message);

  for (const slot of sameDay || []) {
    const slotStart = toDateTime(date, slot.start_time);
    const slotEnd = toDateTime(date, slot.end_time);
    if (!overlaps(start, end, slotStart, slotEnd)) continue;

    if (slot.professional_id === professionalId) {
      throw err('This professional already has a booking during the requested time', 409);
    }
    if (slot.user_id === userId) {
      throw err('You already have another booking during the requested time', 409);
    }
  }
}

/* ── Book a slot ────────────────────────────────────────────────────────────── */
async function bookSlot(userId, body) {
  const { professional_id: professionalId, date, start_time, end_time, notes } = body;

  if (!professionalId) throw err('professional_id is required', 400);
  if (professionalId === userId) throw err('Cannot book a training slot with yourself', 400);

  const { start, end } = validateBookingInput(body);

  const { data: professional, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('id, user_type, onboarding_completed, is_banned, is_suspended')
    .eq('id', professionalId)
    .single();

  if (profErr || !professional || professional.user_type !== 'professional') {
    throw err('Professional not found', 404);
  }
  if (!professional.onboarding_completed) {
    throw err('This professional has not completed onboarding yet', 400);
  }
  if (professional.is_banned || professional.is_suspended) {
    throw err('This professional is not currently available for booking', 400);
  }

  await assertNoOverlap({ professionalId, userId, date, start, end });

  const { data, error } = await supabaseAdmin
    .from('training_slots')
    .insert({
      professional_id: professionalId,
      user_id: userId,
      date,
      start_time,
      end_time,
      notes: notes || null,
    })
    .select('id, professional_id, user_id, date, start_time, end_time, status, notes, created_at')
    .single();

  if (error) {
    // 23P01 = Postgres exclusion_violation — lost a race to a concurrent booking
    // that landed between our pre-check above and this insert.
    if (error.code === '23P01') {
      throw err('This slot was just booked by someone else. Please choose a different time.', 409);
    }
    throw new Error(error.message);
  }

  return data;
}

/* ── List slots (shared by getUserSlots / getProfessionalSlots) ──────────────── */

function isUpcoming(slot, now) {
  return slot.status === 'booked' && toDateTime(slot.date, slot.start_time) >= now;
}
function isPast(slot, now) {
  return slot.status !== 'cancelled' && toDateTime(slot.date, slot.start_time) < now;
}

async function _listSlots({ column, id, status, date, page = 1, limit = 20, otherPartySelect }) {
  let query = supabaseAdmin
    .from('training_slots')
    .select(`
      id, date, start_time, end_time, status, notes, cancel_reason, cancelled_at, created_at,
      ${otherPartySelect}
    `)
    .eq(column, id);

  if (date) {
    query = query.eq('date', date);
  } else if (status === 'cancelled') {
    query = query.eq('status', 'cancelled');
  } else if (status === 'booked') {
    query = query.eq('status', 'booked');
  }
  // 'upcoming' / 'past' need a same-day time-of-day comparison that SQL
  // columns alone can't express here — filtered in-process below, same
  // fetch-then-filter-then-paginate pattern used by discoveryService/enquiriesService.

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const now = new Date();
  let slots = data || [];

  if (!date) {
    if (status === 'upcoming') slots = slots.filter(s => isUpcoming(s, now));
    else if (status === 'past') slots = slots.filter(s => isPast(s, now));
  }

  slots.sort((a, b) => {
    const cmp = a.date === b.date
      ? a.start_time.localeCompare(b.start_time)
      : a.date.localeCompare(b.date);
    return status === 'past' ? -cmp : cmp; // past: most recent first; else soonest first
  });

  const total = slots.length;
  const offset = (page - 1) * limit;
  const paged = slots.slice(offset, offset + limit);

  return { slots: paged, total, page, limit, has_more: offset + limit < total };
}

async function getUserSlots(userId, opts) {
  return _listSlots({
    column: 'user_id',
    id: userId,
    ...opts,
    otherPartySelect: 'professional:professional_id (id, name, avatar_url, specialty, session_rate, location)',
  });
}

async function getProfessionalSlots(professionalId, opts) {
  return _listSlots({
    column: 'professional_id',
    id: professionalId,
    ...opts,
    otherPartySelect: 'user:user_id (id, name, avatar_url, fitness_goals, fitness_level)',
  });
}

/* ── Single slot detail ────────────────────────────────────────────────────── */
async function getSlotDetail(requesterId, slotId) {
  const { data: slot, error } = await supabaseAdmin
    .from('training_slots')
    .select(`
      id, date, start_time, end_time, status, notes, cancel_reason, cancelled_at, created_at,
      professional:professional_id (id, name, avatar_url, specialty, session_rate, location),
      user:user_id (id, name, avatar_url)
    `)
    .eq('id', slotId)
    .single();

  if (error || !slot) throw err('Training slot not found', 404);

  if (slot.professional?.id !== requesterId && slot.user?.id !== requesterId) {
    throw err('You are not authorized to view this booking', 403);
  }

  return slot;
}

/* ── Cancel (soft delete) ──────────────────────────────────────────────────── */
async function cancelSlot(requesterId, slotId, reason) {
  const { data: slot, error } = await supabaseAdmin
    .from('training_slots')
    .select('id, user_id, professional_id, status')
    .eq('id', slotId)
    .single();

  if (error || !slot) throw err('Training slot not found', 404);

  if (slot.user_id !== requesterId && slot.professional_id !== requesterId) {
    throw err('You are not authorized to cancel this booking', 403);
  }

  if (slot.status === 'cancelled') {
    return { already_cancelled: true };
  }

  const { error: updateErr } = await supabaseAdmin
    .from('training_slots')
    .update({
      status: 'cancelled',
      cancelled_by: requesterId,
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', slotId);

  if (updateErr) throw new Error(updateErr.message);

  return { cancelled: true };
}

/* ── Availability check (optional helper for building a slot picker) ─────────── */
async function getAvailability(professionalId, date) {
  if (!professionalId) throw err('professional_id is required', 400);
  if (!date || !DATE_RE.test(date)) throw err('date is required in YYYY-MM-DD format', 400);

  const { data, error } = await supabaseAdmin
    .from('training_slots')
    .select('start_time, end_time')
    .eq('professional_id', professionalId)
    .eq('date', date)
    .eq('status', 'booked')
    .order('start_time', { ascending: true });

  if (error) throw new Error(error.message);

  return { professional_id: professionalId, date, booked_slots: data || [] };
}

module.exports = {
  bookSlot,
  getUserSlots,
  getProfessionalSlots,
  getSlotDetail,
  cancelSlot,
  getAvailability,
};
