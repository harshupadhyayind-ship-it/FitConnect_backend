-- Migration 018: Add location + expanded categories to groups

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS location  TEXT,
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Update category comment (data stays valid; new categories accepted at app layer)
COMMENT ON COLUMN groups.category IS
  'running | yoga | gym | badminton | cycling | swimming | cricket | football | basketball | meditation | general';
