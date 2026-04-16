-- Migration 011: Trainer profiles + Explore enhancements

-- ── Trainer fields on profiles ─────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS rating          NUMERIC(2,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reviews_count   INT          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_audience TEXT[]       DEFAULT '{}';
  -- target_audience values: adults, kids, seniors, athletes, beginners

-- ── Events: add price + is_free ────────────────────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS price    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_free  BOOLEAN DEFAULT TRUE;

-- ── Venues table (gyms, yoga studios, physio clinics, etc.) ───────────────
CREATE TABLE IF NOT EXISTS venues (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('gym', 'yoga', 'physio', 'sports', 'pool', 'crossfit', 'studio', 'other')),
  address       TEXT,
  city          TEXT,
  latitude      DOUBLE PRECISION,
  longitude     DOUBLE PRECISION,
  rating        NUMERIC(2,1) DEFAULT 0,
  reviews_count INT          DEFAULT 0,
  image_url     TEXT,
  tags          TEXT[]       DEFAULT '{}',
  -- e.g. ['Women Only', '24hr', 'Open Now']
  open_hours    JSONB,
  -- { mon: "6am-10pm", tue: "6am-10pm", ... , always_open: false }
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS venues_city_idx ON venues(city);
CREATE INDEX IF NOT EXISTS venues_type_idx ON venues(type);
