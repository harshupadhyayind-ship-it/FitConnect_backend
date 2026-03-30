-- ============================================================
-- FitConnect — Initial Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";       -- for nightly streak reset

-- ──────────────────────────────────────────────────────────────
-- PROFILES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_type               TEXT NOT NULL CHECK (user_type IN ('individual', 'professional')),
  name                    TEXT,
  bio                     TEXT,
  avatar_url              TEXT,
  date_of_birth           DATE,
  gender                  TEXT CHECK (gender IN ('male', 'female', 'non_binary', 'prefer_not_to_say')),
  fitness_goals           TEXT[]   DEFAULT '{}',
  fitness_level           TEXT     CHECK (fitness_level IN ('beginner', 'intermediate', 'advanced')),
  height_cm               NUMERIC,
  weight_kg               NUMERIC,
  preferred_gender_filter TEXT     DEFAULT 'everyone' CHECK (preferred_gender_filter IN ('everyone', 'men', 'women', 'women_only')),
  -- Professional fields
  specialty               TEXT,
  credentials             TEXT[]   DEFAULT '{}',
  -- Location
  latitude                DOUBLE PRECISION,
  longitude               DOUBLE PRECISION,
  -- Streak / gamification (denormalised for read performance)
  current_streak          INT      DEFAULT 0,
  longest_streak          INT      DEFAULT 0,
  total_checkins          INT      DEFAULT 0,
  -- Status
  onboarding_completed    BOOLEAN  DEFAULT FALSE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- DEVICE TOKENS (push notifications)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- ──────────────────────────────────────────────────────────────
-- CHECKINS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checkins (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);
CREATE INDEX idx_checkins_user_date ON checkins(user_id, date DESC);

-- ──────────────────────────────────────────────────────────────
-- BADGES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_badges (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_type  TEXT NOT NULL,  -- e.g. 'streak_7', 'streak_30', 'streak_90'
  earned_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, badge_type)
);

-- ──────────────────────────────────────────────────────────────
-- LIKES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS likes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  liker_user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  liked_user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(liker_user_id, liked_user_id),
  CHECK (liker_user_id <> liked_user_id)
);
CREATE INDEX idx_likes_liker    ON likes(liker_user_id);
CREATE INDEX idx_likes_liked    ON likes(liked_user_id);

-- ──────────────────────────────────────────────────────────────
-- MATCHES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user1_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user2_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user1_id, user2_id),
  CHECK (user1_id < user2_id)  -- enforces deterministic ordering
);
CREATE INDEX idx_matches_user1 ON matches(user1_id);
CREATE INDEX idx_matches_user2 ON matches(user2_id);

-- ──────────────────────────────────────────────────────────────
-- MESSAGES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id     UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  is_read      BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_match      ON messages(match_id, created_at DESC);
CREATE INDEX idx_messages_recipient  ON messages(recipient_id, is_read);

-- ──────────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,   -- 'match' | 'message'
  payload     JSONB DEFAULT '{}',
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────
-- EVENTS  (community fitness events — Explore > Events tab)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             TEXT NOT NULL,
  description       TEXT,
  start_date        TIMESTAMPTZ NOT NULL,
  end_date          TIMESTAMPTZ NOT NULL,
  location          TEXT,
  cover_image_url   TEXT,
  participant_count INT DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- updated_at trigger (auto-update profiles.updated_at)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
