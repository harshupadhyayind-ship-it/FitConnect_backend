-- Migration 010: Add missing professional profile fields
-- specialties (multi, up to 3), years_of_experience, session_rate, prompts

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS specialties           TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS years_of_experience   TEXT,
  ADD COLUMN IF NOT EXISTS session_rate          TEXT,
  ADD COLUMN IF NOT EXISTS prompt_philosophy     TEXT,
  ADD COLUMN IF NOT EXISTS prompt_best_result    TEXT,
  ADD COLUMN IF NOT EXISTS prompt_love_working   TEXT;
