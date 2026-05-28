-- ─────────────────────────────────────────────────────────────────────────────
-- 014_events_places.sql
-- Upgrade events table + add event_attendees tracking
-- ─────────────────────────────────────────────────────────────────────────────

-- Add missing columns to events table
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS price          NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_free        BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS type           TEXT DEFAULT 'event'
    CHECK (type IN ('event','gym','yoga','physio','sports','run','cycle','other')),
  ADD COLUMN IF NOT EXISTS latitude       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS tags           TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS organizer_id   TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS max_participants INT,
  ADD COLUMN IF NOT EXISTS going_count    INT DEFAULT 0;

-- Track who is attending which event
CREATE TABLE IF NOT EXISTS event_attendees (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);

-- Auto-update going_count when attendee joins/leaves
CREATE OR REPLACE FUNCTION update_event_going_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE events SET going_count = going_count + 1 WHERE id = NEW.event_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE events SET going_count = GREATEST(going_count - 1, 0) WHERE id = OLD.event_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_going_count ON event_attendees;
CREATE TRIGGER trg_event_going_count
  AFTER INSERT OR DELETE ON event_attendees
  FOR EACH ROW EXECUTE FUNCTION update_event_going_count();

-- Index for date + type filtering
CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);
CREATE INDEX IF NOT EXISTS idx_events_type       ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_location   ON events(latitude, longitude);

-- RLS
ALTER TABLE events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'events_read_all') THEN
    CREATE POLICY "events_read_all" ON events FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_attendees' AND policyname = 'attendees_read_all') THEN
    CREATE POLICY "attendees_read_all" ON event_attendees FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_attendees' AND policyname = 'attendees_insert_own') THEN
    CREATE POLICY "attendees_insert_own" ON event_attendees FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_attendees' AND policyname = 'attendees_delete_own') THEN
    CREATE POLICY "attendees_delete_own" ON event_attendees FOR DELETE USING (true);
  END IF;
END $$;
