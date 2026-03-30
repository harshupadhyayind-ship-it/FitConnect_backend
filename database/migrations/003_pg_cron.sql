-- ============================================================
-- FitConnect — pg_cron: Nightly Streak Reset
-- Run this in Supabase SQL Editor (requires pg_cron extension)
-- ============================================================

-- Reset current_streak for users who missed yesterday's check-in
-- Runs every day at 00:05 IST (= 18:35 UTC previous day)
SELECT cron.schedule(
  'reset-missed-streaks',
  '35 18 * * *',   -- 18:35 UTC = 00:05 IST
  $$
  UPDATE profiles
  SET current_streak = 0
  WHERE current_streak > 0
    AND id NOT IN (
      SELECT user_id FROM checkins
      WHERE date = (CURRENT_DATE - INTERVAL '1 day')
    );
  $$
);
