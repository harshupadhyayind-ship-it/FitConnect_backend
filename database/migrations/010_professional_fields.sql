-- Migration 010: Add missing professional profile fields
-- Change specialty from TEXT to TEXT[] (multi-select, up to 3)
-- Add years_of_experience, session_rate, and prompts

-- Convert specialty to array (preserving existing single values)
ALTER TABLE profiles
  ALTER COLUMN specialty TYPE TEXT[] USING
    CASE WHEN specialty IS NULL OR specialty = '' THEN '{}'
         ELSE ARRAY[specialty]
    END;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS years_of_experience   TEXT,
  ADD COLUMN IF NOT EXISTS session_rate          TEXT,
  ADD COLUMN IF NOT EXISTS prompt_philosophy     TEXT,
  ADD COLUMN IF NOT EXISTS prompt_best_result    TEXT,
  ADD COLUMN IF NOT EXISTS prompt_love_working   TEXT;
