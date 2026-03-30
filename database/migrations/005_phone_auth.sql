-- ============================================================
-- FitConnect — Firebase Phone Auth Tables
-- Run AFTER 004_admin_schema.sql
-- ============================================================

-- Maps phone number → Supabase user ID (avoids duplicate user creation)
CREATE TABLE IF NOT EXISTS phone_auth_map (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone        TEXT NOT NULL UNIQUE,      -- E.164 e.g. +919876543210
  user_id      UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  firebase_uid TEXT NOT NULL,             -- Firebase UID for audit trail
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Stores refresh tokens for phone-auth users (Supabase doesn't manage these)
CREATE TABLE IF NOT EXISTS phone_refresh_tokens (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: these are internal tables — accessible via service role key only
ALTER TABLE phone_auth_map        ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_refresh_tokens  ENABLE ROW LEVEL SECURITY;
-- No policies = no access for anon/authenticated roles
-- Backend always uses service role key for these tables
