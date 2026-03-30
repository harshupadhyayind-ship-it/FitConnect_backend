-- ============================================================
-- FitConnect — Custom Phone OTP Table
-- Run in Supabase SQL Editor
-- ============================================================

-- Stores OTPs for phone verification (custom, not Firebase Phone Auth)
CREATE TABLE IF NOT EXISTS phone_otps (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone       TEXT NOT NULL,          -- E.164 format e.g. +919876543210
  otp         TEXT NOT NULL,          -- 6-digit code (hashed)
  expires_at  TIMESTAMPTZ NOT NULL,   -- OTP valid for 10 minutes
  attempts    INT DEFAULT 0,          -- max 5 wrong attempts
  verified    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Only keep one active OTP per phone at a time
CREATE INDEX idx_phone_otps_phone ON phone_otps(phone, created_at DESC);

-- Auto-delete expired OTPs after 1 hour (keeps table clean)
-- Run this via pg_cron
SELECT cron.schedule(
  'cleanup-phone-otps',
  '0 * * * *',   -- every hour
  $$DELETE FROM phone_otps WHERE expires_at < NOW() - INTERVAL '1 hour';$$
);
