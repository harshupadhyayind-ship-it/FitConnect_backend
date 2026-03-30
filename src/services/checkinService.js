const { supabaseAdmin } = require('../config/supabase');

const BADGE_MILESTONES = [7, 30, 90];

async function doCheckIn(userId) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Idempotent — return existing check-in if already done today
  const { data: existing } = await supabaseAdmin
    .from('checkins')
    .select('id')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (existing) {
    const streak = await getStreak(userId);
    return { already_checked_in: true, ...streak };
  }

  // Insert check-in
  const { error: insertError } = await supabaseAdmin
    .from('checkins')
    .insert({ user_id: userId, date: today });

  if (insertError) throw new Error(insertError.message);

  // Recalculate streak
  const { current_streak, longest_streak, total_checkins } = await _recalculateStreak(userId);

  // Award badge if milestone hit
  let new_badge = null;
  if (BADGE_MILESTONES.includes(current_streak)) {
    new_badge = await _awardBadge(userId, current_streak);
  }

  return { checked_in: true, date: today, current_streak, longest_streak, total_checkins, new_badge };
}

async function getStreak(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('current_streak, longest_streak, total_checkins')
    .eq('id', userId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function getBadges(userId) {
  const { data, error } = await supabaseAdmin
    .from('user_badges')
    .select('badge_type, earned_at')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });

  if (error) throw new Error(error.message);
  return { badges: data };
}

async function getHistory(userId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data, error } = await supabaseAdmin
    .from('checkins')
    .select('date, created_at')
    .eq('user_id', userId)
    .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
    .order('date', { ascending: false });

  if (error) throw new Error(error.message);
  return { history: data };
}

async function _recalculateStreak(userId) {
  // Fetch all check-in dates ordered desc
  const { data: checkins } = await supabaseAdmin
    .from('checkins')
    .select('date')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  let current_streak = 0;
  let longest_streak = 0;
  let streak = 0;
  const today = new Date().toISOString().split('T')[0];

  for (let i = 0; i < checkins.length; i++) {
    const expected = new Date();
    expected.setDate(expected.getDate() - i);
    const expectedStr = expected.toISOString().split('T')[0];

    if (checkins[i].date === expectedStr) {
      streak++;
      if (i === 0) current_streak = streak; // still building current
    } else {
      if (i === 0) { current_streak = 0; } // missed today (shouldn't happen here but safeguard)
      if (streak > longest_streak) longest_streak = streak;
      streak = 0;
    }
  }
  current_streak = streak;
  if (streak > longest_streak) longest_streak = streak;

  const total_checkins = checkins.length;

  await supabaseAdmin
    .from('profiles')
    .update({ current_streak, longest_streak, total_checkins })
    .eq('id', userId);

  return { current_streak, longest_streak, total_checkins };
}

async function _awardBadge(userId, days) {
  const badge_type = `streak_${days}`;

  // Don't duplicate
  const { data: existing } = await supabaseAdmin
    .from('user_badges')
    .select('id')
    .eq('user_id', userId)
    .eq('badge_type', badge_type)
    .single();

  if (existing) return null;

  const { data, error } = await supabaseAdmin
    .from('user_badges')
    .insert({ user_id: userId, badge_type, earned_at: new Date().toISOString() })
    .select()
    .single();

  if (error) return null;
  return data;
}

module.exports = { doCheckIn, getStreak, getBadges, getHistory };
