-- ============================================================
-- FitConnect — Firebase Auth Migration
-- Removes Supabase Auth dependency.
-- profiles.id is now the Firebase UID (TEXT), not a UUID
-- referencing auth.users.
--
-- ⚠️  Run this on a fresh project.
--     For existing data, migrate user IDs before running.
-- ============================================================

-- Drop old tables that referenced auth.users (clean slate)
DROP TABLE IF EXISTS broadcast_logs        CASCADE;
DROP TABLE IF EXISTS admin_action_logs     CASCADE;
DROP TABLE IF EXISTS reports               CASCADE;
DROP TABLE IF EXISTS phone_refresh_tokens  CASCADE;
DROP TABLE IF EXISTS phone_auth_map        CASCADE;
DROP TABLE IF EXISTS notifications         CASCADE;
DROP TABLE IF EXISTS device_tokens         CASCADE;
DROP TABLE IF EXISTS messages              CASCADE;
DROP TABLE IF EXISTS matches               CASCADE;
DROP TABLE IF EXISTS likes                 CASCADE;
DROP TABLE IF EXISTS user_badges           CASCADE;
DROP TABLE IF EXISTS checkins              CASCADE;
DROP TABLE IF EXISTS events                CASCADE;
DROP TABLE IF EXISTS profiles              CASCADE;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ──────────────────────────────────────────────────────────────
-- PROFILES  (id = Firebase UID, e.g. "28gkL9a3HNdZxt7Kabcd1234")
-- ──────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id                      TEXT PRIMARY KEY,   -- Firebase UID
  user_type               TEXT CHECK (user_type IN ('individual', 'professional')),
  name                    TEXT,
  email                   TEXT,
  phone                   TEXT,
  bio                     TEXT,
  avatar_url              TEXT,
  date_of_birth           DATE,
  gender                  TEXT CHECK (gender IN ('male', 'female', 'non_binary', 'prefer_not_to_say')),
  fitness_goals           TEXT[]   DEFAULT '{}',
  fitness_level           TEXT     CHECK (fitness_level IN ('beginner', 'intermediate', 'advanced')),
  height_cm               NUMERIC,
  weight_kg               NUMERIC,
  preferred_gender_filter TEXT     DEFAULT 'everyone' CHECK (preferred_gender_filter IN ('everyone', 'men', 'women', 'women_only')),
  specialty               TEXT,
  credentials             TEXT[]   DEFAULT '{}',
  latitude                DOUBLE PRECISION,
  longitude               DOUBLE PRECISION,
  -- Streak / gamification
  current_streak          INT      DEFAULT 0,
  longest_streak          INT      DEFAULT 0,
  total_checkins          INT      DEFAULT 0,
  -- Moderation flags
  is_admin                BOOLEAN  DEFAULT FALSE,
  is_banned               BOOLEAN  DEFAULT FALSE,
  is_suspended            BOOLEAN  DEFAULT FALSE,
  is_verified             BOOLEAN  DEFAULT FALSE,
  ban_reason              TEXT,
  suspension_until        TIMESTAMPTZ,
  -- Status
  onboarding_completed    BOOLEAN  DEFAULT FALSE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- DEVICE TOKENS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE device_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- ──────────────────────────────────────────────────────────────
-- CHECKINS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE checkins (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);
CREATE INDEX idx_checkins_user_date ON checkins(user_id, date DESC);

-- ──────────────────────────────────────────────────────────────
-- BADGES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE user_badges (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_type  TEXT NOT NULL,
  earned_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, badge_type)
);

-- ──────────────────────────────────────────────────────────────
-- LIKES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE likes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  liker_user_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  liked_user_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(liker_user_id, liked_user_id),
  CHECK (liker_user_id <> liked_user_id)
);
CREATE INDEX idx_likes_liker ON likes(liker_user_id);
CREATE INDEX idx_likes_liked ON likes(liked_user_id);

-- ──────────────────────────────────────────────────────────────
-- MATCHES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE matches (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user1_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user2_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user1_id, user2_id),
  CHECK (user1_id < user2_id)
);
CREATE INDEX idx_matches_user1 ON matches(user1_id);
CREATE INDEX idx_matches_user2 ON matches(user2_id);

-- ──────────────────────────────────────────────────────────────
-- MESSAGES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE messages (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id     UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  is_read      BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_match     ON messages(match_id, created_at DESC);
CREATE INDEX idx_messages_recipient ON messages(recipient_id, is_read);

-- ──────────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  payload     JSONB DEFAULT '{}',
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────
-- EVENTS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             TEXT NOT NULL,
  description       TEXT,
  start_date        TIMESTAMPTZ NOT NULL,
  end_date          TIMESTAMPTZ NOT NULL,
  location          TEXT,
  cover_image_url   TEXT,
  participant_count INT DEFAULT 0,
  created_by        TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- ADMIN TABLES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE reports (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type                 TEXT NOT NULL CHECK (type IN ('user', 'message')),
  reason               TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  action_taken         TEXT CHECK (action_taken IN ('warn', 'ban', 'delete_content', 'none')),
  admin_notes          TEXT,
  reporter_id          TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_user_id     TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  reported_message_id  UUID REFERENCES messages(id) ON DELETE SET NULL,
  resolved_by          TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_reports_status ON reports(status, created_at DESC);

CREATE TABLE admin_action_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id        TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  target_user_id  TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE broadcast_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id          TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  filters           JSONB DEFAULT '{}',
  total_recipients  INT DEFAULT 0,
  sent              INT DEFAULT 0,
  failed            INT DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- updated_at trigger
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- RLS: disabled — all DB access goes through backend service role
-- Enable Realtime on messages table manually in Supabase dashboard
-- ──────────────────────────────────────────────────────────────

-- ──────────────────────────────────────────────────────────────
-- pg_cron: nightly streak reset (00:05 IST = 18:35 UTC)
-- ──────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'reset-missed-streaks',
  '35 18 * * *',
  $$
  UPDATE profiles SET current_streak = 0
  WHERE current_streak > 0
    AND id NOT IN (
      SELECT user_id FROM checkins
      WHERE date = (CURRENT_DATE - INTERVAL '1 day')
    );
  $$
);

-- ──────────────────────────────────────────────────────────────
-- Promote first admin (replace with your Firebase UID)
-- ──────────────────────────────────────────────────────────────
-- UPDATE profiles SET is_admin = TRUE WHERE id = 'your-firebase-uid';
