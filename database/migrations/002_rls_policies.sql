-- ============================================================
-- FitConnect — Row Level Security Policies
-- Run AFTER 001_initial_schema.sql
-- ============================================================

-- Enable RLS on every table
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges   ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE events        ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────
-- PROFILES
-- ──────────────────────────────────────────────────────────────
-- Anyone authenticated can read any profile (needed for discovery)
CREATE POLICY "profiles: authenticated read"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can only insert/update their own profile
CREATE POLICY "profiles: own write"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles: own update"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- DEVICE TOKENS
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "device_tokens: own all"
  ON device_tokens FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- CHECKINS
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "checkins: own all"
  ON checkins FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- BADGES
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "badges: read any"
  ON user_badges FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "badges: own insert"
  ON user_badges FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- LIKES
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "likes: liker can manage own likes"
  ON likes FOR ALL
  TO authenticated
  USING (liker_user_id = auth.uid())
  WITH CHECK (liker_user_id = auth.uid());

-- Can see likes received (to detect mutual matches)
CREATE POLICY "likes: see received"
  ON likes FOR SELECT
  TO authenticated
  USING (liked_user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- MATCHES
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "matches: participants can read"
  ON matches FOR SELECT
  TO authenticated
  USING (user1_id = auth.uid() OR user2_id = auth.uid());

CREATE POLICY "matches: participants can delete (unmatch)"
  ON matches FOR DELETE
  TO authenticated
  USING (user1_id = auth.uid() OR user2_id = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- MESSAGES
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "messages: participants can read"
  ON messages FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "messages: sender can insert"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "messages: recipient can mark read"
  ON messages FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "notifications: own all"
  ON notifications FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- EVENTS  (public read, admin write via service role)
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "events: public read"
  ON events FOR SELECT
  TO authenticated
  USING (true);
