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

/**
 * Returns everything the Streaks page needs in a single call.
 */
async function getStreaksPage(userId) {
  const today = new Date().toISOString().split('T')[0];

  // Current month bounds
  const now        = new Date();
  const year       = now.getFullYear();
  const month      = now.getMonth(); // 0-indexed
  const monthStart = new Date(year, month, 1).toISOString().split('T')[0];
  const monthEnd   = new Date(year, month + 1, 0).toISOString().split('T')[0];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayOfMonth  = now.getDate();

  // Fetch profile + this month's checkins in parallel
  const [{ data: profile }, { data: monthCheckins }] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('current_streak, longest_streak, total_checkins, fitness_goals, name')
      .eq('id', userId)
      .single(),
    supabaseAdmin
      .from('checkins')
      .select('date')
      .eq('user_id', userId)
      .gte('date', monthStart)
      .lte('date', monthEnd),
  ]);

  if (!profile) throw Object.assign(new Error('Profile not found'), { status: 404 });

  const checkedDays    = (monthCheckins || []).map(c => parseInt(c.date.split('-')[2]));
  const checkedInToday = checkedDays.includes(dayOfMonth);

  // Consistency % = checkins this month / days elapsed so far, capped at 100
  const consistencyPct = dayOfMonth > 0
    ? Math.min(100, Math.round((checkedDays.length / dayOfMonth) * 100))
    : 0;

  const GOAL_LABELS = {
    weight_loss:     'Lose Weight',
    muscle_gain:     'Build Muscle',
    endurance:       'Build Endurance',
    flexibility:     'Improve Flexibility',
    general_fitness: 'Get Fitter',
    sport_specific:  'Sport Specific',
    stress_relief:   'Stress Relief',
    rehabilitation:  'Rehabilitation',
  };

  const goals_progress = (profile.fitness_goals || []).map(goal => ({
    goal,
    label:    GOAL_LABELS[goal] || goal.replace(/_/g, ' '),
    progress: consistencyPct,
  }));

  // Motivational message based on streak
  const streak = profile.current_streak || 0;
  const message =
    checkedInToday ? `You're on fire! ${streak} days strong 🔥`   :
    streak === 0   ? 'Start your streak — check in today!'        :
    streak < 3     ? 'Keep it going — check in today!'            :
    streak < 7     ? `${streak} days! Don't break the chain 💪`   :
    streak < 30    ? `${streak} days strong! You're unstoppable!` :
                     `${streak} day legend! Keep crushing it! 🏆`;

  return {
    streak: {
      current: profile.current_streak || 0,
      longest: profile.longest_streak || 0,
      total:   profile.total_checkins || 0,
    },
    checked_in_today: checkedInToday,
    message,
    calendar: {
      year,
      month:        month + 1,   // 1-indexed
      days_in_month: daysInMonth,
      checked_days:  checkedDays, // [1, 2, 3, 5, ...] days of month that were checked in
    },
    goals_progress,              // [{ goal, label, progress }]
  };
}

module.exports = { doCheckIn, getStreak, getBadges, getHistory, getStreaksPage };
