-- Migration 021: FitConnect Pro — interest registrations
-- Lets professional users register interest in the upcoming Pro plan
-- ("Register Interest" CTA on the Pro upsell screen).
-- One row per user; admins view the running list/count in the admin panel.

CREATE TABLE IF NOT EXISTS pro_interest (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_pro_interest_created ON pro_interest(created_at DESC);
