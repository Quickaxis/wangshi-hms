-- ==============================================================================
-- MIGRATION: MULTI-ROOM / GROUP BOOKINGS & CONSOLIDATED INVOICING
-- Homestay Management System (HMS)
--
-- PURPOSE:
--   1. Adds non-destructive `group_id` and `is_group_lead` columns to `public.bookings`.
--   2. Adds `group_id` to `public.invoices` for group-level consolidated billing.
--   3. Adds atomic group booking RPC `create_group_booking_atomic` with sorted FOR UPDATE locks
--      and strict GiST conflict detection on each room.
--   4. Updates `create_invoice_with_items` to automatically link invoices to the booking's `group_id`.
--   5. 100% backward-compatible with all existing single-room bookings and invoices.
-- ==============================================================================

DO $$
BEGIN
    -- Assert prerequisites
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bookings') THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_PREREQUISITE_MISSING: Table "public.bookings" does not exist.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoices') THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_PREREQUISITE_MISSING: Table "public.invoices" does not exist.';
    END IF;
END $$;

-- 1. Extend bookings table
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS group_id UUID;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS is_group_lead BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bookings_group_id ON public.bookings(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_group_lead ON public.bookings(group_id, is_group_lead) WHERE group_id IS NOT NULL;

-- 2. Extend invoices table
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS group_id UUID;

CREATE INDEX IF NOT EXISTS idx_invoices_group_id ON public.invoices(group_id) WHERE group_id IS NOT NULL;

-- 2a. Check for duplicate active invoices before creating unique partial index
DO $$
DECLARE
    v_dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_dup_count
    FROM (
        SELECT homestay_id, group_id
        FROM public.invoices
        WHERE group_id IS NOT NULL AND status != 'cancelled'
        GROUP BY homestay_id, group_id
        HAVING COUNT(*) > 1
    ) dups;

    IF v_dup_count > 0 THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_DUPLICATE_GROUP_INVOICES: Found % group(s) with multiple active invoices. Resolve duplicates before applying unique constraint.', v_dup_count;
    END IF;
END $$;

-- 2b. Database-level protection against duplicate active group invoices
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_active_group 
ON public.invoices(homestay_id, group_id) 
WHERE (group_id IS NOT NULL AND status != 'cancelled');

-- 3. Atomic Group Booking Function
CREATE OR REPLACE FUNCTION public.create_group_booking_atomic(
    p_room_ids UUID[],
    p_partner_id UUID,
    p_check_in DATE,
    p_check_out DATE,
    p_number_of_guests INTEGER,
    p_notes TEXT DEFAULT NULL,
    p_guests JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_uid UUID;
    v_partner public.partners%ROWTYPE;
    v_room public.rooms%ROWTYPE;
    v_homestay_id UUID := NULL;
    v_sorted_room_ids UUID[];
    v_nights INTEGER;
    v_group_id UUID;
    v_lead_booking_id UUID := NULL;
    v_curr_booking_id UUID;
    v_booking_ids UUID[] := ARRAY[]::UUID[];
    v_grand_total INTEGER := 0;
    v_room_total INTEGER;
    v_locked_room_count INTEGER := 0;
    v_is_lead BOOLEAN;
    v_primary_count INTEGER := 0;
    g JSONB;
    i INTEGER;
BEGIN
    v_caller_uid := auth.uid();

    -- Validate dates
    IF p_check_out <= p_check_in THEN
        RAISE EXCEPTION 'CHECK_OUT_INVALID: Check-out date must be after check-in date';
    END IF;

    -- Validate room selection
    IF p_room_ids IS NULL OR array_length(p_room_ids, 1) = 0 THEN
        RAISE EXCEPTION 'NO_ROOMS_SELECTED: At least one room must be selected for booking';
    END IF;

    -- Disallow duplicate rooms in the same group booking
    IF (SELECT COUNT(*) FROM unnest(p_room_ids)) <> (SELECT COUNT(DISTINCT r_id) FROM unnest(p_room_ids) AS r_id) THEN
        RAISE EXCEPTION 'DUPLICATE_ROOM_SELECTED: The same room cannot be selected multiple times in a booking';
    END IF;

    -- Validate guests array
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

    -- Partner authentication
    IF v_caller_uid IS NOT NULL THEN
        SELECT * INTO v_partner
        FROM public.partners
        WHERE auth_user_id = v_caller_uid AND is_active = true;

        IF NOT FOUND THEN
            SELECT * INTO v_partner
            FROM public.partners
            WHERE id = p_partner_id AND is_active = true;
        END IF;
    ELSE
        SELECT * INTO v_partner
        FROM public.partners
        WHERE id = p_partner_id AND is_active = true;
    END IF;

    IF v_partner.id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Active partner not found for this authentication session';
    END IF;

    -- Sort room IDs to ensure canonical lock acquisition order (prevents deadlocks under high concurrency)
    SELECT array_agg(r_id ORDER BY r_id) INTO v_sorted_room_ids FROM unnest(p_room_ids) AS r_id;

    -- Lock and validate all rooms
    FOR v_room IN (
        SELECT * FROM public.rooms WHERE id = ANY(v_sorted_room_ids) ORDER BY id FOR UPDATE
    ) LOOP
        IF v_homestay_id IS NULL THEN
            v_homestay_id := v_room.homestay_id;
        ELSIF v_room.homestay_id <> v_homestay_id THEN
            RAISE EXCEPTION 'MULTI_HOMESTAY_NOT_ALLOWED: All rooms in a group booking must belong to the same property';
        END IF;

        IF v_room.is_active = false THEN
            RAISE EXCEPTION 'ROOM_INACTIVE: Room "%" is inactive and cannot be booked', v_room.name;
        END IF;

        -- Check individual room availability against active bookings
        IF EXISTS (
            SELECT 1 FROM public.bookings
            WHERE room_id = v_room.id
              AND status != 'cancelled'
              AND check_in < p_check_out
              AND check_out > p_check_in
        ) THEN
            RAISE EXCEPTION 'ROOM_UNAVAILABLE: Room "%" is already booked for the selected dates', v_room.name;
        END IF;

        v_locked_room_count := v_locked_room_count + 1;
    END LOOP;

    IF v_locked_room_count <> array_length(p_room_ids, 1) THEN
        RAISE EXCEPTION 'ROOM_NOT_FOUND: One or more selected rooms do not exist';
    END IF;

    -- Authorization check
    IF v_partner.role <> 'super_admin' AND v_partner.homestay_id <> v_homestay_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED: You are not authorized to book rooms in this homestay';
    END IF;

    -- Calculate stay nights
    v_nights := (p_check_out - p_check_in);
    IF v_nights <= 0 THEN
        v_nights := 1;
    END IF;

    -- Generate single unique group identifier
    v_group_id := gen_random_uuid();

    -- Insert individual booking reservations under the group
    FOR i IN 1..array_length(p_room_ids, 1)
    LOOP
        SELECT * INTO v_room FROM public.rooms WHERE id = p_room_ids[i];
        v_room_total := v_nights * v_room.nightly_rate;
        v_is_lead := (i = 1);

        INSERT INTO public.bookings (
            room_id,
            partner_id,
            homestay_id,
            check_in,
            check_out,
            status,
            number_of_guests,
            nightly_rate,
            total_amount,
            notes,
            group_id,
            is_group_lead
        ) VALUES (
            v_room.id,
            v_partner.id,
            v_homestay_id,
            p_check_in,
            p_check_out,
            'confirmed',
            GREATEST(1, ROUND(COALESCE(p_number_of_guests, 1)::numeric / array_length(p_room_ids, 1))),
            v_room.nightly_rate,
            v_room_total,
            p_notes,
            v_group_id,
            v_is_lead
        ) RETURNING id INTO v_curr_booking_id;

        IF v_is_lead THEN
            v_lead_booking_id := v_curr_booking_id;
        END IF;

        v_booking_ids := array_append(v_booking_ids, v_curr_booking_id);
        v_grand_total := v_grand_total + v_room_total;
    END LOOP;

    -- Insert guest profiles linked to the lead booking
    IF jsonb_array_length(p_guests) > 0 THEN
        FOR g IN SELECT * FROM jsonb_array_elements(p_guests)
        LOOP
            INSERT INTO public.guests (
                booking_id,
                homestay_id,
                name,
                phone,
                email,
                is_primary
            ) VALUES (
                v_lead_booking_id,
                v_homestay_id,
                TRIM(COALESCE((g->>'name')::TEXT, 'Guest')),
                NULLIF(TRIM((g->>'phone')::TEXT), ''),
                NULLIF(TRIM((g->>'email')::TEXT), ''),
                COALESCE((g->>'is_primary')::BOOLEAN, false)
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'group_id', v_group_id,
        'lead_booking_id', v_lead_booking_id,
        'booking_ids', v_booking_ids,
        'room_count', array_length(p_room_ids, 1),
        'total_amount', v_grand_total
    );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_group_booking_atomic(UUID[], UUID, DATE, DATE, INTEGER, TEXT, JSONB) TO authenticated, service_role;

-- 4. Update create_invoice_with_items to link group_id automatically
CREATE OR REPLACE FUNCTION public.create_invoice_with_items(
    p_booking_id UUID,
    p_invoice_number TEXT,
    p_guest_name TEXT,
    p_check_in DATE,
    p_check_out DATE,
    p_subtotal NUMERIC(12,2) DEFAULT NULL,
    p_tax_rate NUMERIC(5,2) DEFAULT 0.00,
    p_tax_amount NUMERIC(12,2) DEFAULT NULL,
    p_discount_amount NUMERIC(12,2) DEFAULT 0.00,
    p_grand_total NUMERIC(12,2) DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_invoice_date DATE DEFAULT CURRENT_DATE,
    p_status TEXT DEFAULT 'draft',
    p_guest_phone TEXT DEFAULT NULL,
    p_guest_email TEXT DEFAULT NULL,
    p_guest_address TEXT DEFAULT NULL,
    p_room_id UUID DEFAULT NULL,
    p_room_name TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_house_rules TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking_homestay_id UUID;
    v_booking_group_id UUID;
    v_partner_id UUID;
    v_invoice_id UUID;
    v_item RECORD;
    v_item_expected_amount NUMERIC(12,2);
    v_calc_subtotal NUMERIC(12,2) := 0.00;
    v_calc_item_discount NUMERIC(12,2) := 0.00;
    v_calc_total_discount NUMERIC(12,2) := 0.00;
    v_calc_net_before_tax NUMERIC(12,2) := 0.00;
    v_calc_tax_amount NUMERIC(12,2) := 0.00;
    v_calc_grand_total NUMERIC(12,2) := 0.00;
BEGIN
    -- 1. Explicit JSON Array Validation for p_items
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'INVALID_ITEMS_PAYLOAD: Line items payload must be a JSON array, but received %.', COALESCE(jsonb_typeof(p_items), 'null');
    END IF;

    -- 2. Verify referenced booking existence and inherit homestay_id and group_id
    SELECT homestay_id, group_id INTO v_booking_homestay_id, v_booking_group_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF NOT FOUND OR (auth.uid() IS NOT NULL AND NOT public.is_super_admin() AND (
        v_booking_homestay_id IS DISTINCT FROM public.get_user_homestay_id() OR NOT public.is_active_partner()
    )) THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Booking not found or access denied.' USING ERRCODE = '42501';
    END IF;

    -- 2a. Guard against duplicate active group invoice
    IF v_booking_group_id IS NOT NULL AND COALESCE(p_status, 'draft') != 'cancelled' THEN
        IF EXISTS (
            SELECT 1 FROM public.invoices
            WHERE homestay_id = v_booking_homestay_id
              AND group_id = v_booking_group_id
              AND status != 'cancelled'
        ) THEN
            RAISE EXCEPTION 'DUPLICATE_GROUP_INVOICE: An active invoice already exists for group %.', v_booking_group_id
                USING ERRCODE = '23505';
        END IF;
    END IF;

    -- 3. Validate line items and calculate authoritative financial totals
    IF jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN (
            SELECT 
                COALESCE(value->>'category', 'room') AS category,
                COALESCE(value->>'description', '') AS description,
                value->>'stay_period' AS stay_period,
                COALESCE((value->>'quantity')::NUMERIC(10,2), 1.00) AS quantity,
                COALESCE((value->>'rate')::NUMERIC(12,2), 0.00) AS rate,
                COALESCE((value->>'amount')::NUMERIC(12,2), 0.00) AS amount,
                COALESCE((value->>'sort_order')::INTEGER, 0) AS sort_order
            FROM jsonb_array_elements(p_items)
        ) LOOP
            IF v_item.description = '' THEN
                RAISE EXCEPTION 'INVALID_ITEM: Description cannot be empty.';
            END IF;
            IF v_item.quantity <= 0 THEN
                RAISE EXCEPTION 'INVALID_ITEM: Quantity must be greater than zero for %.', v_item.description;
            END IF;
            IF v_item.rate < 0 THEN
                RAISE EXCEPTION 'INVALID_ITEM: Rate cannot be negative for %.', v_item.description;
            END IF;

            v_item_expected_amount := ROUND(v_item.quantity * v_item.rate, 2);
            IF ABS(v_item.amount - v_item_expected_amount) > 0.01 THEN
                RAISE EXCEPTION 'ITEM_AMOUNT_MISMATCH: Stored amount (%) does not match calculated amount (%) for %.', 
                    v_item.amount, v_item_expected_amount, v_item.description;
            END IF;

            IF v_item.category = 'discount' THEN
                v_calc_item_discount := v_calc_item_discount + v_item.amount;
            ELSE
                v_calc_subtotal := v_calc_subtotal + v_item.amount;
            END IF;
        END LOOP;
    END IF;

    v_calc_total_discount := v_calc_item_discount + COALESCE(p_discount_amount, 0.00);
    v_calc_net_before_tax := GREATEST(0.00, v_calc_subtotal - v_calc_total_discount);
    v_calc_tax_amount := ROUND((v_calc_net_before_tax * COALESCE(p_tax_rate, 0.00)) / 100.0, 2);
    v_calc_grand_total := v_calc_net_before_tax + v_calc_tax_amount;

    -- Validate client totals against calculated
    IF p_subtotal IS NOT NULL AND ABS(p_subtotal - v_calc_subtotal) > 0.01 THEN
        RAISE EXCEPTION 'TOTAL_MISMATCH: Subtotal mismatch (expected %, received %)', v_calc_subtotal, p_subtotal;
    END IF;
    IF p_tax_amount IS NOT NULL AND ABS(p_tax_amount - v_calc_tax_amount) > 0.01 THEN
        RAISE EXCEPTION 'TOTAL_MISMATCH: Tax amount mismatch (expected %, received %)', v_calc_tax_amount, p_tax_amount;
    END IF;
    IF p_grand_total IS NOT NULL AND ABS(p_grand_total - v_calc_grand_total) > 0.01 THEN
        RAISE EXCEPTION 'TOTAL_MISMATCH: Grand total mismatch (expected %, received %)', v_calc_grand_total, p_grand_total;
    END IF;

    SELECT id INTO v_partner_id FROM public.partners WHERE auth_user_id = auth.uid();

    -- 4. Insert invoice header with group_id inherited from booking
    INSERT INTO public.invoices (
        homestay_id,
        booking_id,
        group_id,
        invoice_number,
        invoice_date,
        status,
        guest_name,
        guest_phone,
        guest_email,
        guest_address,
        check_in,
        check_out,
        room_id,
        room_name,
        subtotal,
        tax_rate,
        tax_amount,
        discount_amount,
        grand_total,
        amount_paid,
        balance_due,
        notes,
        house_rules,
        created_by
    ) VALUES (
        v_booking_homestay_id,
        p_booking_id,
        v_booking_group_id,
        p_invoice_number,
        COALESCE(p_invoice_date, CURRENT_DATE),
        COALESCE(p_status, 'draft'),
        TRIM(p_guest_name),
        NULLIF(TRIM(p_guest_phone), ''),
        NULLIF(TRIM(p_guest_email), ''),
        NULLIF(TRIM(p_guest_address), ''),
        p_check_in,
        p_check_out,
        p_room_id,
        NULLIF(TRIM(p_room_name), ''),
        v_calc_subtotal,
        COALESCE(p_tax_rate, 0.00),
        v_calc_tax_amount,
        v_calc_total_discount,
        v_calc_grand_total,
        0.00,
        v_calc_grand_total,
        NULLIF(TRIM(p_notes), ''),
        NULLIF(TRIM(p_house_rules), ''),
        v_partner_id
    ) RETURNING id INTO v_invoice_id;

    -- 5. Insert invoice items
    IF jsonb_array_length(p_items) > 0 THEN
        INSERT INTO public.invoice_items (
            invoice_id,
            homestay_id,
            category,
            description,
            stay_period,
            quantity,
            rate,
            amount,
            sort_order
        )
        SELECT 
            v_invoice_id,
            v_booking_homestay_id,
            COALESCE(value->>'category', 'room'),
            TRIM(value->>'description'),
            NULLIF(TRIM(value->>'stay_period'), ''),
            COALESCE((value->>'quantity')::NUMERIC(10,2), 1.00),
            COALESCE((value->>'rate')::NUMERIC(12,2), 0.00),
            COALESCE((value->>'amount')::NUMERIC(12,2), 0.00),
            COALESCE((value->>'sort_order')::INTEGER, 0)
        FROM jsonb_array_elements(p_items);
    END IF;

    RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invoice_with_items(UUID, TEXT, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, DATE, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 5. Refresh PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';

