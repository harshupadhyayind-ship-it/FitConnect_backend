-- Migration 020: Professional ratings & reviews
-- One rating per (professional, rater) pair — rating again updates the
-- existing review instead of creating a duplicate.
-- profiles.rating / profiles.reviews_count (added in 011) are kept as a
-- denormalised aggregate, recomputed in application code on every write.

CREATE TABLE IF NOT EXISTS professional_ratings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rater_user_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating           INT  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(professional_id, rater_user_id),
  CHECK (professional_id <> rater_user_id)
);

CREATE INDEX IF NOT EXISTS idx_professional_ratings_professional
  ON professional_ratings(professional_id, created_at DESC);
