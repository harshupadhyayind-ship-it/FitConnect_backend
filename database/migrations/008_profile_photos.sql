-- Profile Photos Table
-- Supports up to 6 photos per user. Position 1 = profile picture (avatar).

CREATE TABLE IF NOT EXISTS profile_photos (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url        TEXT        NOT NULL,
  position   INT         NOT NULL CHECK (position BETWEEN 1 AND 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, position)
);

CREATE INDEX IF NOT EXISTS idx_profile_photos_user_id ON profile_photos(user_id);

-- RLS
ALTER TABLE profile_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own photos"
  ON profile_photos FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Photos are publicly viewable"
  ON profile_photos FOR SELECT
  USING (true);
