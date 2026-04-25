-- Migration 013: Fix matches uniqueness constraint
-- The CHECK (user1_id < user2_id) constraint conflicts with PostgreSQL's
-- locale-aware collation when IDs have mixed case (Firebase UIDs).
-- Replace with a functional unique index using LEAST/GREATEST, which is
-- always self-consistent regardless of collation.

-- Drop old check constraint and unique constraint
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_check;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_user1_id_user2_id_key;

-- New functional unique index — prevents (A,B) and (B,A) duplicates
-- regardless of which order the app inserts them
CREATE UNIQUE INDEX IF NOT EXISTS matches_pair_unique
  ON matches(LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id));
