-- Migration 022: Training Slot Booking
-- Lets an individual user book a 1:1 training session with a professional.
--
-- Overlap prevention is enforced at the DATABASE level via exclusion
-- constraints (not just application-code checks). This is what makes double
-- booking impossible even when two requests race each other concurrently —
-- a plain "check for conflicts, then insert" in JS has a window between the
-- check and the insert where two simultaneous requests can both pass the
-- check before either has written a row. A Postgres EXCLUDE constraint is
-- enforced atomically by the database itself, so the second of two
-- colliding inserts always fails with a constraint violation (23P01),
-- regardless of timing.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS training_slots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  -- Computed once and stored so both exclusion constraints below can index it.
  slot_range      TSRANGE GENERATED ALWAYS AS (
                     tsrange((date + start_time)::timestamp, (date + end_time)::timestamp, '[)')
                   ) STORED,
  status          TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled')),
  notes           TEXT,
  cancelled_by    TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CHECK (start_time < end_time),
  CHECK (professional_id <> user_id)
);

CREATE INDEX IF NOT EXISTS idx_training_slots_professional ON training_slots(professional_id, date);
CREATE INDEX IF NOT EXISTS idx_training_slots_user          ON training_slots(user_id, date);

-- A professional can't have two overlapping *booked* sessions.
-- WHERE clause means cancelled slots free up the time — re-booking the same
-- window after a cancellation is allowed.
ALTER TABLE training_slots
  ADD CONSTRAINT training_slots_professional_no_overlap
  EXCLUDE USING gist (professional_id WITH =, slot_range WITH &&)
  WHERE (status = 'booked');

-- A user can't have two overlapping *booked* sessions, even across
-- different professionals.
ALTER TABLE training_slots
  ADD CONSTRAINT training_slots_user_no_overlap
  EXCLUDE USING gist (user_id WITH =, slot_range WITH &&)
  WHERE (status = 'booked');

CREATE TRIGGER training_slots_updated_at
  BEFORE UPDATE ON training_slots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
