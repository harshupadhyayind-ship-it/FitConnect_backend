-- Migration 012: Enquiries system for professional trainers

CREATE TABLE IF NOT EXISTS enquiries (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trainer_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'pending', 'accepted', 'declined')),
  match_id    UUID REFERENCES matches(id) ON DELETE SET NULL, -- populated on accept
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trainer_id, client_id)  -- one active enquiry per pair
);

CREATE INDEX IF NOT EXISTS enquiries_trainer_idx ON enquiries(trainer_id, status);
CREATE INDEX IF NOT EXISTS enquiries_client_idx  ON enquiries(client_id);
