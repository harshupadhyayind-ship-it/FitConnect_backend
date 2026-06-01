-- Migration 015: Professional certifications
-- Stores uploaded credential documents for professional users
-- Each professional can hold multiple certifications (NSCA-CSCS, ACE, etc.)
--
-- ⚠️  Before running this migration:
--     Go to Supabase Dashboard → Storage → New bucket
--     Name: certifications  |  Public: true  |  Max file size: 10 MB
--     Allowed MIME types: image/jpeg, image/png, application/pdf

CREATE TABLE IF NOT EXISTS professional_certifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cert_type    TEXT NOT NULL,          -- NSCA-CSCS | ACE | NASM-CPT | RYT-200 | Precision Nutrition | Other
  custom_type  TEXT,                   -- filled when cert_type = 'Other'
  document_url TEXT,                   -- Supabase Storage public URL (PDF / JPG / PNG)
  issue_date   TEXT,                   -- MM/YYYY
  expiry_date  TEXT,                   -- MM/YYYY  (null = no expiry)
  issuing_org  TEXT,                   -- e.g. "National Strength & Conditioning Assoc."
  is_verified  BOOLEAN DEFAULT false,  -- set by admin after manual review
  verified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_certifications_user_id
  ON professional_certifications(user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE professional_certifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN

  -- Owners can do everything on their own rows
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'professional_certifications'
      AND policyname = 'Owners can manage their certifications'
  ) THEN
    CREATE POLICY "Owners can manage their certifications"
    ON professional_certifications FOR ALL
    USING  (user_id = auth.uid()::text)
    WITH CHECK (user_id = auth.uid()::text);
  END IF;

  -- Any authenticated user can read certifications (for viewing a pro profile)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'professional_certifications'
      AND policyname = 'Authenticated users can view certifications'
  ) THEN
    CREATE POLICY "Authenticated users can view certifications"
    ON professional_certifications FOR SELECT
    USING (auth.role() = 'authenticated');
  END IF;

END $$;
