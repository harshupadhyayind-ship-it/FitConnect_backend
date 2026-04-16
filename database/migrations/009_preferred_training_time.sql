-- Migration 009: Add preferred_training_time to profiles
-- Values: mornings, afternoons, evenings, weekends

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferred_training_time TEXT[] DEFAULT '{}';
