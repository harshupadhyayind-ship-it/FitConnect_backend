-- Migration 016: Social — Groups & Group Events
-- Powers the Social screen: Groups tab + group-specific events

-- ── Groups ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  description     TEXT,
  cover_image_url TEXT,
  category        TEXT,           -- 'running' | 'yoga' | 'gym' | 'cycling' | 'sports' | 'general'
  creator_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_private      BOOLEAN DEFAULT false,
  member_count    INT DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_groups_creator ON groups(creator_id);

-- ── Group Members ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_members (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group   ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user    ON group_members(user_id);

-- ── Group Events ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  start_date      TIMESTAMPTZ NOT NULL,
  end_date        TIMESTAMPTZ NOT NULL,
  location        TEXT,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  cover_image_url TEXT,
  created_by      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  going_count     INT DEFAULT 0,
  is_free         BOOLEAN DEFAULT true,
  price           NUMERIC(10,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_events_group ON group_events(group_id, start_date);

-- ── Group Event Attendees ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_event_attendees (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_event_id UUID NOT NULL REFERENCES group_events(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(group_event_id, user_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE groups                ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_event_attendees ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN

  -- groups: visible to authenticated users; only members can see private groups
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='groups' AND policyname='Authenticated users can view groups') THEN
    CREATE POLICY "Authenticated users can view groups" ON groups FOR SELECT
    USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='groups' AND policyname='Creators can manage their groups') THEN
    CREATE POLICY "Creators can manage their groups" ON groups FOR ALL
    USING (creator_id = auth.uid()::text)
    WITH CHECK (creator_id = auth.uid()::text);
  END IF;

  -- group_members: members can read; joining/leaving controlled by service
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='group_members' AND policyname='Members can view group membership') THEN
    CREATE POLICY "Members can view group membership" ON group_members FOR SELECT
    USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='group_members' AND policyname='Users manage their own membership') THEN
    CREATE POLICY "Users manage their own membership" ON group_members FOR ALL
    USING (user_id = auth.uid()::text)
    WITH CHECK (user_id = auth.uid()::text);
  END IF;

  -- group_events: visible to all authenticated; created by members
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='group_events' AND policyname='Authenticated users can view group events') THEN
    CREATE POLICY "Authenticated users can view group events" ON group_events FOR SELECT
    USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='group_events' AND policyname='Event creators can manage their events') THEN
    CREATE POLICY "Event creators can manage their events" ON group_events FOR ALL
    USING (created_by = auth.uid()::text)
    WITH CHECK (created_by = auth.uid()::text);
  END IF;

  -- group_event_attendees
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='group_event_attendees' AND policyname='Users manage their own event attendance') THEN
    CREATE POLICY "Users manage their own event attendance" ON group_event_attendees FOR ALL
    USING (user_id = auth.uid()::text)
    WITH CHECK (user_id = auth.uid()::text);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='group_event_attendees' AND policyname='Authenticated users can view event attendees') THEN
    CREATE POLICY "Authenticated users can view event attendees" ON group_event_attendees FOR SELECT
    USING (auth.role() = 'authenticated');
  END IF;

END $$;
