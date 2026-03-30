const cron = require('node-cron');
const { supabaseAdmin } = require('../config/supabase');

/**
 * Nightly cron job — runs at 00:05 every day.
 * Resets `current_streak` to 0 for users who missed yesterday's check-in.
 *
 * Note: For production you should use pg_cron inside Supabase for reliability.
 * This Node.js cron is provided as a fallback / development convenience.
 */
function startStreakCron() {
  cron.schedule('5 0 * * *', resetMissedStreaks, { timezone: 'Asia/Kolkata' });
  console.log('[Cron] Streak reset job scheduled (00:05 IST daily)');
}

async function resetMissedStreaks() {
  console.log('[Cron] Running nightly streak reset...');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Find users with current_streak > 0 who did NOT check in yesterday
  const { data: checkedInYesterday } = await supabaseAdmin
    .from('checkins')
    .select('user_id')
    .eq('date', yesterdayStr);

  const checkedInSet = new Set((checkedInYesterday || []).map(r => r.user_id));

  // Get all profiles with non-zero streaks
  const { data: activeStreaks } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .gt('current_streak', 0);

  const toReset = (activeStreaks || [])
    .map(p => p.id)
    .filter(id => !checkedInSet.has(id));

  if (toReset.length === 0) {
    console.log('[Cron] No streaks to reset today.');
    return;
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ current_streak: 0 })
    .in('id', toReset);

  if (error) {
    console.error('[Cron] Streak reset error:', error.message);
  } else {
    console.log(`[Cron] Reset streaks for ${toReset.length} users.`);
  }
}

module.exports = { startStreakCron, resetMissedStreaks };
