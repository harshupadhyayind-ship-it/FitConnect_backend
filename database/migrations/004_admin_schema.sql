-- ============================================================
-- FitConnect — Admin Panel Schema
-- Run AFTER 003_pg_cron.sql
-- ============================================================

-- ── Add admin/moderation columns to profiles ──────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_banned     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_suspended  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_verified   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ban_reason    TEXT,
  ADD COLUMN IF NOT EXISTS suspension_until TIMESTAMPTZ;

-- Add created_by to events (set by admin who created the event)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ── REPORTS (user/message moderation queue) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type                 TEXT NOT NULL CHECK (type IN ('user', 'message')),
  reason               TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  action_taken         TEXT CHECK (action_taken IN ('warn', 'ban', 'delete_content', 'none')),
  admin_notes          TEXT,
  reporter_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reported_message_id  UUID REFERENCES messages(id) ON DELETE SET NULL,
  resolved_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX idx_reports_type   ON reports(type, status);

-- ── ADMIN ACTION LOGS (audit trail) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_action_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  target_user_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,  -- 'ban' | 'unban' | 'suspend' | 'unsuspend' | 'verify' | 'delete'
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_admin_logs_admin  ON admin_action_logs(admin_id, created_at DESC);
CREATE INDEX idx_admin_logs_target ON admin_action_logs(target_user_id, created_at DESC);

-- ── BROADCAST LOGS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcast_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  filters           JSONB DEFAULT '{}',
  total_recipients  INT DEFAULT 0,
  sent              INT DEFAULT 0,
  failed            INT DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS for new tables ────────────────────────────────────────────────────────
ALTER TABLE reports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_logs    ENABLE ROW LEVEL SECURITY;

-- Reports: anyone can create; only admins (via service role) can read/update
CREATE POLICY "reports: authenticated users can create"
  ON reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- Admin tables are only accessible via service role key (no RLS policy needed
-- for anon/authenticated — they simply have no access without a policy).
-- The backend always uses the service role key for admin operations.

-- ── Promote the first admin (run once with your user ID) ─────────────────────
-- UPDATE profiles SET is_admin = TRUE WHERE id = 'your-user-uuid-here';
