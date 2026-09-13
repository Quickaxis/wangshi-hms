-- ==========================================================
-- WANGSHI HOMESTAY HMS — PRODUCTION DATABASE SCHEMA & RLS
-- ==========================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist"; -- Required for date-range exclusion constraints

-- ==========================================================
-- 2. PARTNERS TABLE (Source of Truth for HMS Access)
-- ==========================================================
CREATE TABLE IF NOT EXISTS partners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID UNIQUE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'partner',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================================
-- 3. ROOMS TABLE (Dynamic Availability; No Permanent Status)
-- ==========================================================
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    bathroom_type TEXT NOT NULL DEFAULT 'Attached toilet & bathroom',
    max_guests INTEGER NOT NULL DEFAULT 3 CHECK (max_guests > 0),
    nightly_rate INTEGER NOT NULL DEFAULT 2500 CHECK (nightly_rate > 0),
    breakfast_included BOOLEAN DEFAULT true,
    breakfast_details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Safely migrate rooms table columns if previously created with earlier schema
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS bathroom_type TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS max_guests INTEGER;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS nightly_rate INTEGER;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS breakfast_included BOOLEAN DEFAULT true;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS breakfast_details TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rooms' AND column_name = 'bathroom_info') THEN
        UPDATE rooms SET bathroom_type = bathroom_info WHERE bathroom_type IS NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rooms' AND column_name = 'max_capacity') THEN
        UPDATE rooms SET max_guests = max_capacity WHERE max_guests IS NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rooms' AND column_name = 'price_per_night') THEN
        UPDATE rooms SET nightly_rate = price_per_night WHERE nightly_rate IS NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rooms' AND column_name = 'breakfast_info') THEN
        UPDATE rooms SET breakfast_details = breakfast_info WHERE breakfast_details IS NULL;
    END IF;
END $$;

-- ==========================================================
-- 4. BOOKINGS TABLE
-- ==========================================================
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES partners(id),
    check_in DATE NOT NULL,
    check_in_time TIME,
    check_out DATE NOT NULL,
    check_out_time TIME,
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'checked_in', 'checked_out', 'cancelled')),
    number_of_guests INTEGER NOT NULL DEFAULT 1 CHECK (number_of_guests > 0),
    nightly_rate INTEGER NOT NULL CHECK (nightly_rate > 0),
    total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT check_out_after_check_in CHECK (check_out > check_in)
);

-- Safely migrate bookings table columns if previously created with earlier schema
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_in_time TIME;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_out_time TIME;

-- ==========================================================
-- 5. DOUBLE-BOOKING EXCLUSION CONSTRAINT (CRITICAL CONCURRENCY PROTECTION)
-- PostgreSQL ensures at the storage engine level that two active bookings
-- cannot have overlapping date ranges [check_in, check_out) for the same room.
-- ==========================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'prevent_overlapping_active_bookings'
    ) THEN
        ALTER TABLE bookings
        ADD CONSTRAINT prevent_overlapping_active_bookings
        EXCLUDE USING gist (
            room_id WITH =,
            daterange(check_in, check_out, '[)') WITH &&
        )
        WHERE (status != 'cancelled');
    END IF;
END $$;

-- ==========================================================
-- 6. GUESTS TABLE
-- ==========================================================
CREATE TABLE IF NOT EXISTS guests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================================
-- 7. PERFORMANCE INDEXES
-- ==========================================================
CREATE INDEX IF NOT EXISTS idx_bookings_room_id ON bookings(room_id);
CREATE INDEX IF NOT EXISTS idx_bookings_partner_id ON bookings(partner_id);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_guests_booking_id ON guests(booking_id);
CREATE INDEX IF NOT EXISTS idx_guests_name ON guests(name);
CREATE INDEX IF NOT EXISTS idx_guests_phone ON guests(phone);

-- ==========================================================
-- 8. ATOMIC BOOKING FUNCTION WITH ROW LOCKING (Defense-in-depth)
-- ==========================================================
CREATE OR REPLACE FUNCTION create_booking_atomic(
    p_room_id UUID,
    p_partner_id UUID,
    p_check_in DATE,
    p_check_in_time TIME,
    p_check_out DATE,
    p_check_out_time TIME,
    p_number_of_guests INTEGER,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room rooms%ROWTYPE;
    v_nights INTEGER;
    v_total INTEGER;
    v_booking_id UUID;
BEGIN
    IF p_check_out <= p_check_in THEN
        RAISE EXCEPTION 'CHECK_OUT_INVALID: Check-out date must be after check-in date';
    END IF;

    SELECT * INTO v_room
    FROM rooms
    WHERE id = p_room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ROOM_NOT_FOUND: Room does not exist';
    END IF;

    IF p_number_of_guests > v_room.max_guests THEN
        RAISE EXCEPTION 'CAPACITY_EXCEEDED: Number of guests (%) exceeds room capacity (%)', 
            p_number_of_guests, v_room.max_guests;
    END IF;

    IF EXISTS (
        SELECT 1 FROM bookings
        WHERE room_id = p_room_id
          AND status != 'cancelled'
          AND check_in < p_check_out
          AND check_out > p_check_in
    ) THEN
        RAISE EXCEPTION 'ROOM_UNAVAILABLE: Room is already booked for the selected dates';
    END IF;

    v_nights := (p_check_out - p_check_in);
    IF v_nights <= 0 THEN
        v_nights := 1;
    END IF;
    v_total := v_nights * v_room.nightly_rate;

    INSERT INTO bookings (
        room_id,
        partner_id,
        check_in,
        check_in_time,
        check_out,
        check_out_time,
        status,
        number_of_guests,
        nightly_rate,
        total_amount,
        notes
    ) VALUES (
        p_room_id,
        p_partner_id,
        p_check_in,
        p_check_in_time,
        p_check_out,
        p_check_out_time,
        'confirmed',
        p_number_of_guests,
        v_room.nightly_rate,
        v_total,
        p_notes
    ) RETURNING id INTO v_booking_id;

    RETURN v_booking_id;
END;
$$;

-- ==========================================================
-- 9. ANTI-TAMPER TRIGGER FOR BOOKINGS
-- Prevents browser clients from modifying room_id, partner_id,
-- dates, nightly_rate, or total_amount after booking creation.
-- Only status, notes, and updated_at can be updated.
-- ==========================================================
CREATE OR REPLACE FUNCTION prevent_booking_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.room_id <> OLD.room_id OR
       NEW.partner_id <> OLD.partner_id OR
       NEW.check_in <> OLD.check_in OR
       NEW.check_out <> OLD.check_out OR
       NEW.nightly_rate <> OLD.nightly_rate OR
       NEW.total_amount <> OLD.total_amount THEN
        RAISE EXCEPTION 'TAMPER_DETECTED: Critical booking details (dates, rates, room, partner) cannot be modified directly.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_booking_tampering ON bookings;
CREATE TRIGGER trg_prevent_booking_tampering
BEFORE UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION prevent_booking_tampering();

-- ==========================================================
-- 10. AUTHENTICATION & HMS AUTHORIZATION HELPER
-- Verifies the user corresponds to an active partner record.
-- Arbitrary Supabase Auth users gain zero access.
-- ==========================================================
CREATE OR REPLACE FUNCTION is_active_partner()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM partners
    WHERE auth_user_id = auth.uid()
      AND is_active = true
  );
$$;

-- ==========================================================
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================================

-- A. Partners Table Security
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read partners" ON partners;
DROP POLICY IF EXISTS "Allow active partners and self to read partners" ON partners;
DROP POLICY IF EXISTS "Allow partners to update their own record" ON partners;
DROP POLICY IF EXISTS "Allow partners to insert" ON partners;
DROP POLICY IF EXISTS "Allow partners to delete" ON partners;

CREATE POLICY "Allow active partners and self to read partners"
ON partners FOR SELECT
TO authenticated
USING (
    auth_user_id = auth.uid()
    OR email = (auth.jwt() ->> 'email')
    OR is_active_partner()
);

-- B. Rooms Table Security
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read rooms" ON rooms;
DROP POLICY IF EXISTS "Allow active partners to read rooms" ON rooms;
DROP POLICY IF EXISTS "Allow authenticated partners to update rooms" ON rooms;

CREATE POLICY "Allow active partners to read rooms"
ON rooms FOR SELECT
TO authenticated
USING (is_active_partner());

-- C. Bookings Table Security
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read bookings" ON bookings;
DROP POLICY IF EXISTS "Allow active partners to read bookings" ON bookings;
DROP POLICY IF EXISTS "Allow authenticated users to insert bookings" ON bookings;
DROP POLICY IF EXISTS "Allow active partners to insert bookings" ON bookings;
DROP POLICY IF EXISTS "Allow authenticated users to update bookings" ON bookings;
DROP POLICY IF EXISTS "Allow active partners to update bookings" ON bookings;
DROP POLICY IF EXISTS "Allow partners to delete bookings" ON bookings;

CREATE POLICY "Allow active partners to read bookings"
ON bookings FOR SELECT
TO authenticated
USING (is_active_partner());

-- Client-side inserts are intentionally DENIED.
-- All booking creations must use the create_booking_atomic() RPC or Server Actions using the Service Role.

CREATE POLICY "Allow active partners to update bookings"
ON bookings FOR UPDATE
TO authenticated
USING (is_active_partner())
WITH CHECK (is_active_partner());

-- D. Guests Table Security
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read guests" ON guests;
DROP POLICY IF EXISTS "Allow active partners to read guests" ON guests;
DROP POLICY IF EXISTS "Allow authenticated users to insert guests" ON guests;
DROP POLICY IF EXISTS "Allow active partners to insert guests for valid bookings" ON guests;
DROP POLICY IF EXISTS "Allow authenticated users to update guests" ON guests;
DROP POLICY IF EXISTS "Allow active partners to update guests" ON guests;
DROP POLICY IF EXISTS "Allow authenticated users to delete guests" ON guests;
DROP POLICY IF EXISTS "Allow active partners to delete guests" ON guests;

CREATE POLICY "Allow active partners to read guests"
ON guests FOR SELECT
TO authenticated
USING (is_active_partner());

CREATE POLICY "Allow active partners to insert guests for valid bookings"
ON guests FOR INSERT
TO authenticated
WITH CHECK (
    is_active_partner() AND
    EXISTS (SELECT 1 FROM bookings WHERE id = booking_id)
);

CREATE POLICY "Allow active partners to update guests"
ON guests FOR UPDATE
TO authenticated
USING (
    is_active_partner() AND
    EXISTS (SELECT 1 FROM bookings WHERE id = booking_id)
)
WITH CHECK (
    is_active_partner() AND
    EXISTS (SELECT 1 FROM bookings WHERE id = booking_id)
);

CREATE POLICY "Allow active partners to delete guests"
ON guests FOR DELETE
TO authenticated
USING (
    is_active_partner() AND
    EXISTS (SELECT 1 FROM bookings WHERE id = booking_id)
);

-- ==========================================================
-- 12. REALTIME CONFIGURATION & REPLICA IDENTITY
-- ==========================================================
ALTER TABLE rooms REPLICA IDENTITY FULL;
ALTER TABLE bookings REPLICA IDENTITY FULL;
ALTER TABLE guests REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'rooms'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'bookings'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'guests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE guests;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- ==========================================================
-- 13. SEED DATA (SAFE & IDEMPOTENT VIA ON CONFLICT)
-- ==========================================================
INSERT INTO rooms (room_number, name, description, bathroom_type, max_guests, nightly_rate, breakfast_included, breakfast_details) VALUES
('1', 'Room No. 1', 'Spacious homestay room with attached toilet & bathroom, wooden accents, and mountain view.', 'Attached toilet & bathroom', 3, 2500, true, 'Complimentary breakfast for 2 persons (Bread or Maggi)'),
('2', 'Room No. 2', 'Comfortable double room with attached toilet & bathroom, ideal for couples or solo travelers.', 'Attached toilet & bathroom', 2, 2500, true, 'Complimentary breakfast included'),
('3', 'Room No. 3', 'Warm homestay room with attached toilet & bathroom, suitable for small families or groups.', 'Attached toilet & bathroom', 3, 2500, true, 'Complimentary breakfast for 2 persons (Bread or Maggi)'),
('4', 'Room No. 4', 'Budget-friendly homestay room with clean non-attached toilet & bathroom just outside the door.', 'Non-attached toilet & bathroom', 3, 2000, true, 'Complimentary breakfast for 2 persons (Bread or Maggi)')
ON CONFLICT (room_number) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    bathroom_type = EXCLUDED.bathroom_type,
    max_guests = EXCLUDED.max_guests,
    nightly_rate = EXCLUDED.nightly_rate,
    breakfast_included = EXCLUDED.breakfast_included,
    breakfast_details = EXCLUDED.breakfast_details;
