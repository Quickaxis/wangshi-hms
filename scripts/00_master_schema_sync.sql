-- ==========================================================
-- 00_MASTER_SCHEMA_SYNC.SQL
-- ==========================================================
-- This script is strictly idempotent and safe to run on any
-- Supabase project environment. It guarantees all tables, columns,
-- RPCs, and basic policies match the exact application requirements.
-- ==========================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 2. HOMESTAYS (Missing entirely in early schemas)
CREATE TABLE IF NOT EXISTS homestays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
);
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Default Homestay';
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. PARTNERS
CREATE TABLE IF NOT EXISTS partners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Partner';
ALTER TABLE partners ADD COLUMN IF NOT EXISTS email TEXT UNIQUE NOT NULL DEFAULT 'partner' || uuid_generate_v4() || '@example.com';
ALTER TABLE partners ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'partner';
ALTER TABLE partners ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE partners ADD COLUMN IF NOT EXISTS homestay_id UUID REFERENCES homestays(id) ON DELETE RESTRICT;

-- 4. ROOMS
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_number TEXT UNIQUE NOT NULL DEFAULT uuid_generate_v4()::text;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Room';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS bathroom_type TEXT NOT NULL DEFAULT 'Attached toilet & bathroom';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS max_guests INTEGER NOT NULL DEFAULT 3 CHECK (max_guests > 0);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS nightly_rate INTEGER NOT NULL DEFAULT 2500 CHECK (nightly_rate > 0);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS breakfast_included BOOLEAN DEFAULT true;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS breakfast_details TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS homestay_id UUID REFERENCES homestays(id) ON DELETE RESTRICT;

-- 5. BOOKINGS
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_id UUID NOT NULL REFERENCES partners(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_in DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_in_time TIME;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_out DATE NOT NULL DEFAULT CURRENT_DATE + 1;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_out_time TIME;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'checked_in', 'checked_out', 'cancelled'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS number_of_guests INTEGER NOT NULL DEFAULT 1 CHECK (number_of_guests > 0);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS nightly_rate INTEGER NOT NULL DEFAULT 0 CHECK (nightly_rate >= 0);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS homestay_id UUID REFERENCES homestays(id) ON DELETE RESTRICT;

-- 6. GUESTS
CREATE TABLE IF NOT EXISTS guests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
);
ALTER TABLE guests ADD COLUMN IF NOT EXISTS booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Guest';
ALTER TABLE guests ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE guests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE guests ADD COLUMN IF NOT EXISTS homestay_id UUID REFERENCES homestays(id) ON DELETE RESTRICT;

-- 7. ATOMIC BOOKING RPC (Strict 7-argument version from update_booking_rpc_with_guests.sql)
CREATE OR REPLACE FUNCTION create_booking_atomic(
    p_room_id UUID,
    p_partner_id UUID,
    p_check_in DATE,
    p_check_out DATE,
    p_number_of_guests INTEGER,
    p_notes TEXT DEFAULT NULL,
    p_guests JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room rooms%ROWTYPE;
    v_partner partners%ROWTYPE;
    v_nights INTEGER;
    v_total INTEGER;
    v_booking_id UUID;
    v_caller_uid UUID;
    v_primary_count INTEGER := 0;
    g JSONB;
BEGIN
    v_caller_uid := auth.uid();
    
    IF p_check_out <= p_check_in THEN
        RAISE EXCEPTION 'CHECK_OUT_INVALID: Check-out date must be after check-in date';
    END IF;

    -- Guest validation
    IF jsonb_array_length(p_guests) > p_number_of_guests THEN
        RAISE EXCEPTION 'GUEST_MISMATCH: Provided guests (%) exceeds declared number of guests (%)',
            jsonb_array_length(p_guests), p_number_of_guests;
    END IF;

    IF jsonb_array_length(p_guests) > 0 THEN
        FOR g IN SELECT * FROM jsonb_array_elements(p_guests)
        LOOP
            IF COALESCE((g->>'is_primary')::BOOLEAN, false) THEN
                v_primary_count := v_primary_count + 1;
            END IF;
        END LOOP;
        
        IF v_primary_count > 1 THEN
            RAISE EXCEPTION 'GUEST_VALIDATION: Cannot have more than one primary guest';
        END IF;
    END IF;

    -- Lock room and get details
    SELECT * INTO v_room
    FROM rooms
    WHERE id = p_room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ROOM_NOT_FOUND: Room does not exist';
    END IF;

    -- Verify caller
    SELECT * INTO v_partner
    FROM partners
    WHERE auth_user_id = v_caller_uid AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Active partner not found for this authentication session';
    END IF;

    -- Verify homestay link
    IF COALESCE(v_partner.role, '') != 'super_admin' AND v_partner.homestay_id != v_room.homestay_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED: You are not authorized to book a room in this homestay';
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
    IF v_nights <= 0 THEN v_nights := 1; END IF;
    v_total := v_nights * v_room.nightly_rate;

    INSERT INTO bookings (room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes) 
    VALUES (p_room_id, v_partner.id, v_room.homestay_id, p_check_in, p_check_out, 'confirmed', p_number_of_guests, v_room.nightly_rate, v_total, p_notes) 
    RETURNING id INTO v_booking_id;

    IF jsonb_array_length(p_guests) > 0 THEN
        FOR g IN SELECT * FROM jsonb_array_elements(p_guests)
        LOOP
            INSERT INTO guests (booking_id, homestay_id, name, phone, email, is_primary) 
            VALUES (v_booking_id, v_room.homestay_id, (g->>'name')::TEXT, (g->>'phone')::TEXT, (g->>'email')::TEXT, COALESCE((g->>'is_primary')::BOOLEAN, false));
        END LOOP;
    END IF;

    RETURN v_booking_id;
END;
$$;



-- Set execute permissions for the single valid atomic booking function
REVOKE EXECUTE ON FUNCTION create_booking_atomic(UUID, UUID, DATE, DATE, INTEGER, TEXT, JSONB) FROM public;
REVOKE EXECUTE ON FUNCTION create_booking_atomic(UUID, UUID, DATE, DATE, INTEGER, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION create_booking_atomic(UUID, UUID, DATE, DATE, INTEGER, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION create_booking_atomic(UUID, UUID, DATE, DATE, INTEGER, TEXT, JSONB) TO service_role;

-- 8. STORAGE SETUP
INSERT INTO storage.buckets (id, name, public) 
VALUES ('homestay-logos', 'homestay-logos', true) 
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'homestay-logos');

-- 9. NOTIFY POSTGREST
NOTIFY pgrst, 'reload schema';
