-- ==========================================================
-- UPDATE: ATOMIC BOOKING FUNCTION WITH GUESTS
-- ==========================================================
-- This script replaces the existing create_booking_atomic function
-- to include atomic guest insertion inheriting the room's homestay_id.

-- 1. Create the new 7-argument signature first

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

    -- Insert guests atomically within the same transaction, inheriting homestay_id
    IF jsonb_array_length(p_guests) > 0 THEN
        FOR g IN SELECT * FROM jsonb_array_elements(p_guests)
        LOOP
            INSERT INTO guests (
                booking_id,
                homestay_id,
                name,
                phone,
                email,
                is_primary
            ) VALUES (
                v_booking_id,
                v_room.homestay_id,
                (g->>'name')::TEXT,
                (g->>'phone')::TEXT,
                (g->>'email')::TEXT,
                COALESCE((g->>'is_primary')::BOOLEAN, false)
            );
        END LOOP;
    END IF;

    RETURN v_booking_id;
END;
$$;

-- 2. Drop the old 6-argument overload so it doesn't conflict or linger
DROP FUNCTION IF EXISTS create_booking_atomic(UUID, UUID, DATE, DATE, INTEGER, TEXT);

-- 3. Explicitly harden execute permissions
REVOKE EXECUTE ON FUNCTION create_booking_atomic(UUID, UUID, DATE, DATE, INTEGER, TEXT, JSONB) FROM public;
REVOKE EXECUTE ON FUNCTION create_booking_atomic(UUID, UUID, DATE, DATE, INTEGER, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION create_booking_atomic(UUID, UUID, DATE, DATE, INTEGER, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION create_booking_atomic(UUID, UUID, DATE, DATE, INTEGER, TEXT, JSONB) TO service_role;
