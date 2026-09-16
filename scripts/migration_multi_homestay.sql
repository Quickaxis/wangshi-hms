-- ==========================================================
-- SAFE MULTI-HOMESTAY MIGRATION SCRIPT
-- ==========================================================

-- 1. Create homestays table with exact required schema
CREATE TABLE IF NOT EXISTS homestays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    location TEXT,
    phone TEXT,
    email TEXT,
    logo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Insert Wangshi Homestay safely
INSERT INTO homestays (id, name, slug)
SELECT uuid_generate_v4(), 'Wangshi Homestay', 'wangshi-homestay'
WHERE NOT EXISTS (SELECT 1 FROM homestays WHERE name = 'Wangshi Homestay');

-- 3. Add homestay_id to core tables using RESTRICT to prevent accidental business data deletion
ALTER TABLE partners ADD COLUMN IF NOT EXISTS homestay_id UUID REFERENCES homestays(id) ON DELETE RESTRICT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS homestay_id UUID REFERENCES homestays(id) ON DELETE RESTRICT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS homestay_id UUID REFERENCES homestays(id) ON DELETE RESTRICT;

-- Add homestay_id to guests for explicit tenant tracking (safer RLS)
ALTER TABLE guests ADD COLUMN IF NOT EXISTS homestay_id UUID REFERENCES homestays(id) ON DELETE RESTRICT;

-- 4. Backfill existing records with Wangshi Homestay ID
DO $$
DECLARE
    v_wangshi_id UUID;
BEGIN
    SELECT id INTO v_wangshi_id FROM homestays WHERE name = 'Wangshi Homestay' LIMIT 1;
    
    -- Partners: Assign normal partners to Wangshi
    UPDATE partners SET homestay_id = v_wangshi_id WHERE homestay_id IS NULL AND role != 'super_admin';
    
    -- Rooms, Bookings, Guests
    UPDATE rooms SET homestay_id = v_wangshi_id WHERE homestay_id IS NULL;
    UPDATE bookings SET homestay_id = v_wangshi_id WHERE homestay_id IS NULL;
    UPDATE guests SET homestay_id = v_wangshi_id WHERE homestay_id IS NULL;
END $$;

-- 5. Enforce NOT NULL constraints on core data (partners can be NULL if super_admin)
ALTER TABLE rooms ALTER COLUMN homestay_id SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN homestay_id SET NOT NULL;
ALTER TABLE guests ALTER COLUMN homestay_id SET NOT NULL;

-- 6. Helper functions for strictly isolated RLS
CREATE OR REPLACE FUNCTION get_user_homestay_id() RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT homestay_id FROM partners WHERE auth_user_id = auth.uid() AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM partners
    WHERE auth_user_id = auth.uid()
      AND is_active = true
      AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION is_active_partner() RETURNS BOOLEAN
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

-- 7. Secure RLS Policies

-- A. Partners Table Security
DROP POLICY IF EXISTS "Allow active partners and self to read partners" ON partners;
CREATE POLICY "Allow active partners and self to read partners"
ON partners FOR SELECT
TO authenticated
USING (
    is_super_admin()
    OR auth_user_id = auth.uid()
    OR email = (auth.jwt() ->> 'email')
    OR (homestay_id = get_user_homestay_id() AND is_active_partner())
);

-- Super Admin can manage partners
CREATE POLICY "Allow super_admin to manage partners"
ON partners FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- B. Rooms Table Security
DROP POLICY IF EXISTS "Allow active partners to read rooms" ON rooms;
CREATE POLICY "Allow active partners to read rooms"
ON rooms FOR SELECT
TO authenticated
USING (
    is_super_admin() OR 
    (homestay_id = get_user_homestay_id() AND is_active_partner())
);

CREATE POLICY "Allow super_admin to manage rooms"
ON rooms FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- C. Bookings Table Security
DROP POLICY IF EXISTS "Allow active partners to read bookings" ON bookings;
CREATE POLICY "Allow active partners to read bookings"
ON bookings FOR SELECT
TO authenticated
USING (
    is_super_admin() OR 
    (homestay_id = get_user_homestay_id() AND is_active_partner())
);

DROP POLICY IF EXISTS "Allow active partners to update bookings" ON bookings;
CREATE POLICY "Allow active partners to update bookings"
ON bookings FOR UPDATE
TO authenticated
USING (
    is_super_admin() OR 
    (homestay_id = get_user_homestay_id() AND is_active_partner())
)
WITH CHECK (
    is_super_admin() OR 
    (homestay_id = get_user_homestay_id() AND is_active_partner())
);

-- D. Guests Table Security
DROP POLICY IF EXISTS "Allow active partners to read guests" ON guests;
CREATE POLICY "Allow active partners to read guests"
ON guests FOR SELECT
TO authenticated
USING (
    is_super_admin() OR 
    (homestay_id = get_user_homestay_id() AND is_active_partner())
);

DROP POLICY IF EXISTS "Allow active partners to insert guests for valid bookings" ON guests;
CREATE POLICY "Allow active partners to insert guests for valid bookings"
ON guests FOR INSERT
TO authenticated
WITH CHECK (
    (is_super_admin() OR homestay_id = get_user_homestay_id()) AND
    EXISTS (SELECT 1 FROM bookings WHERE id = booking_id)
);

DROP POLICY IF EXISTS "Allow active partners to update guests" ON guests;
CREATE POLICY "Allow active partners to update guests"
ON guests FOR UPDATE
TO authenticated
USING (
    (is_super_admin() OR homestay_id = get_user_homestay_id()) AND
    EXISTS (SELECT 1 FROM bookings WHERE id = booking_id)
)
WITH CHECK (
    (is_super_admin() OR homestay_id = get_user_homestay_id()) AND
    EXISTS (SELECT 1 FROM bookings WHERE id = booking_id)
);

DROP POLICY IF EXISTS "Allow active partners to delete guests" ON guests;
CREATE POLICY "Allow active partners to delete guests"
ON guests FOR DELETE
TO authenticated
USING (
    (is_super_admin() OR homestay_id = get_user_homestay_id()) AND
    EXISTS (SELECT 1 FROM bookings WHERE id = booking_id)
);

-- 8. Fix create_booking_atomic to strictly enforce tenant authorization
CREATE OR REPLACE FUNCTION create_booking_atomic(
    p_room_id UUID,
    p_partner_id UUID,
    p_check_in DATE,
    p_check_out DATE,
    p_number_of_guests INTEGER,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room rooms%ROWTYPE;
    v_partner partners%ROWTYPE;
    v_nights INTEGER;
    v_total INTEGER;
    v_booking_id UUID;
    v_caller_uid UUID;
BEGIN
    v_caller_uid := auth.uid();
    
    IF p_check_out <= p_check_in THEN
        RAISE EXCEPTION 'CHECK_OUT_INVALID: Check-out date must be after check-in date';
    END IF;

    -- Lock room and get details
    SELECT * INTO v_room
    FROM rooms
    WHERE id = p_room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ROOM_NOT_FOUND: Room does not exist';
    END IF;

    -- SECURITY: Instead of trusting the p_partner_id passed from frontend, 
    -- we derive the actual partner record linked to the authenticated user token.
    -- This ensures a partner cannot impersonate another partner.
    SELECT * INTO v_partner
    FROM partners
    WHERE auth_user_id = v_caller_uid AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Active partner not found for this authentication session';
    END IF;

    -- SECURITY: Verify the derived partner has access to the room's homestay
    IF v_partner.role != 'super_admin' AND v_partner.homestay_id != v_room.homestay_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED: You are not authorized to book a room in this homestay';
    END IF;

    -- Capacity validation
    IF p_number_of_guests > v_room.max_guests THEN
        RAISE EXCEPTION 'CAPACITY_EXCEEDED: Number of guests (%) exceeds room capacity (%)', 
            p_number_of_guests, v_room.max_guests;
    END IF;

    -- Double-booking check
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

    -- Insert the booking using the room's homestay_id and the strictly verified v_partner.id
    INSERT INTO bookings (
        room_id,
        partner_id,
        homestay_id,
        check_in,
        check_out,
        status,
        number_of_guests,
        nightly_rate,
        total_amount,
        notes
    ) VALUES (
        p_room_id,
        v_partner.id,
        v_room.homestay_id,
        p_check_in,
        p_check_out,
        'confirmed',
        p_number_of_guests,
        v_room.nightly_rate,
        v_total,
        p_notes
    ) RETURNING id INTO v_booking_id;

    RETURN v_booking_id;
END;
$$;
