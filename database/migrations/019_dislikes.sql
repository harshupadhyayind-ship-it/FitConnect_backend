-- Migration 019: Dislikes ("Pass") — hide a fitbuddy from discovery for a cooldown period
--
-- Algorithm:
--   1. Disliking a user upserts a row with expires_at = now() + 30 days.
--      Re-disliking the same person (shouldn't normally happen while the
--      cooldown is active, since they're excluded from discovery) resets
--      the timer rather than creating a duplicate row.
--   2. discoveryService excludes any user with an ACTIVE dislike
--      (expires_at > now()) from the candidate pool, alongside likes/matches.
--   3. Once expires_at passes, the row is simply ignored by the query filter
--      — the user reappears in discovery automatically. No cron needed for
--      correctness, but a daily cleanup job keeps the table small.

CREATE TABLE IF NOT EXISTS dislikes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  disliker_user_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  disliked_user_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,
  UNIQUE(disliker_user_id, disliked_user_id),
  CHECK (disliker_user_id <> disliked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_dislikes_disliker ON dislikes(disliker_user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_dislikes_disliked ON dislikes(disliked_user_id);

-- Daily sweep of expired dislikes (rows past cooldown are dead weight, not
-- functionally required since queries already filter on expires_at > now()).
SELECT cron.schedule(
  'cleanup-expired-dislikes',
  '0 3 * * *',   -- 03:00 UTC daily
  $$
  DELETE FROM dislikes WHERE expires_at < NOW();
  $$
);
