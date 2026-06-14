-- Migration 017: File/image support in messages
-- Adds file metadata columns to the messages table.
-- message_type: 'text' (default) | 'image' | 'file'

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'image', 'file')),
  ADD COLUMN IF NOT EXISTS file_url   TEXT,    -- Supabase Storage public URL
  ADD COLUMN IF NOT EXISTS file_name  TEXT,    -- original filename shown in UI
  ADD COLUMN IF NOT EXISTS file_size  INT,     -- bytes
  ADD COLUMN IF NOT EXISTS mime_type  TEXT;    -- e.g. image/jpeg, application/pdf

-- content is now nullable (file-only messages have no text)
ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;

-- ⚠️  Also create a 'chat-files' bucket in Supabase Storage:
--     Storage → New bucket → Name: chat-files | Public: true | Max: 25 MB
--     (or the ensureBucket() call in the service will create it automatically)
