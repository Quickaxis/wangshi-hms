-- ==============================================================================
-- ROLLBACK: MULTI-ROOM / GROUP BOOKINGS & CONSOLIDATED INVOICING
-- ==============================================================================
-- Sequence:
--   1. Drop group booking atomic function.
--   2. Restore the original Phase 2 `create_invoice_with_items` function
--      (which has no reference to invoices.group_id).
--   3. Drop indexes associated with group bookings and consolidated invoicing.
--   4. Drop group_id and is_group_lead columns safely.
-- ==============================================================================

-- 1. Drop group booking atomic function
DROP FUNCTION IF EXISTS public.create_group_booking_atomic(UUID[], UUID, DATE, DATE, INTEGER, TEXT, JSONB);

-- 2. Restore original Phase 2 create_invoice_with_items (before dropping group_id)
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

    -- 2. Verify referenced booking existence and enforce tenant authorization uniformly
    SELECT homestay_id INTO v_booking_homestay_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF NOT FOUND OR (auth.uid() IS NOT NULL AND NOT public.is_super_admin() AND (
        v_booking_homestay_id IS DISTINCT FROM public.get_user_homestay_id() OR NOT public.is_active_partner()
    )) THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Booking not found or access denied.' USING ERRCODE = '42501';
    END IF;

    -- 3. Validate line items and calculate authoritative financial totals inside PostgreSQL
    IF jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN (
            SELECT 
                COALESCE(value->>'category', 'room') AS category,
                COALESCE(value->>'description', '') AS description,
                value->>'stay_period' AS stay_period,
                COALESCE((value->>'quantity')::numeric, 1.00) AS quantity,
                COALESCE((value->>'rate')::numeric, 0.00) AS rate,
                (value->>'amount')::numeric AS amount,
                COALESCE((value->>'sort_order')::integer, ord::integer) AS sort_order
            FROM jsonb_array_elements(p_items) WITH ORDINALITY AS arr(value, ord)
        ) LOOP
            IF v_item.quantity <= 0 THEN
                RAISE EXCEPTION 'INVALID_ITEM_QUANTITY: Line item "%" quantity must be greater than zero.', v_item.description;
            END IF;
            IF v_item.rate < 0 THEN
                RAISE EXCEPTION 'INVALID_ITEM_RATE: Line item "%" rate cannot be negative.', v_item.description;
            END IF;

            v_item_expected_amount := ROUND(v_item.quantity * v_item.rate, 2);
            IF v_item.amount IS NOT NULL THEN
                IF v_item.amount < 0 THEN
                    RAISE EXCEPTION 'INVALID_ITEM_AMOUNT: Line item "%" amount (%) cannot be negative. Discounts must be non-negative amounts under category "discount".', v_item.description, v_item.amount;
                END IF;
                IF v_item.amount <> v_item_expected_amount THEN
                    RAISE EXCEPTION 'INVALID_ITEM_AMOUNT: Line item "%" amount (%) does not match rounded quantity (%) × rate (%) = %.', v_item.description, v_item.amount, v_item.quantity, v_item.rate, v_item_expected_amount;
                END IF;
            ELSE
                v_item.amount := v_item_expected_amount;
            END IF;

            IF v_item.category = 'discount' THEN
                v_calc_item_discount := v_calc_item_discount + v_item.amount;
            ELSE
                v_calc_subtotal := v_calc_subtotal + v_item.amount;
            END IF;
        END LOOP;
    END IF;

    IF COALESCE(p_discount_amount, 0.00) < 0 THEN
        RAISE EXCEPTION 'INVALID_DISCOUNT: Flat discount amount (%) cannot be negative.', p_discount_amount;
    END IF;

    v_calc_total_discount := v_calc_item_discount + COALESCE(p_discount_amount, 0.00);
    IF v_calc_total_discount > v_calc_subtotal THEN
        RAISE EXCEPTION 'DISCOUNT_EXCEEDS_SUBTOTAL: Total discount (%) cannot exceed line item subtotal (%).', v_calc_total_discount, v_calc_subtotal;
    END IF;

    v_calc_net_before_tax := v_calc_subtotal - v_calc_total_discount;

    IF COALESCE(p_tax_rate, 0.00) < 0 THEN
        RAISE EXCEPTION 'INVALID_TAX_RATE: Tax rate (%) cannot be negative.', p_tax_rate;
    END IF;

    v_calc_tax_amount := ROUND(v_calc_net_before_tax * (COALESCE(p_tax_rate, 0.00) / 100.0), 2);
    v_calc_grand_total := v_calc_net_before_tax + v_calc_tax_amount;

    -- 4. Strict paise-level comparison against calculated values
    IF p_subtotal IS NOT NULL AND p_subtotal <> v_calc_subtotal THEN
        RAISE EXCEPTION 'INVOICE_TOTAL_MISMATCH: Provided subtotal (%) does not match calculated line item subtotal (%).', p_subtotal, v_calc_subtotal;
    END IF;
    IF p_tax_amount IS NOT NULL AND p_tax_amount <> v_calc_tax_amount THEN
        RAISE EXCEPTION 'INVOICE_TOTAL_MISMATCH: Provided tax amount (%) does not match calculated tax amount (%).', p_tax_amount, v_calc_tax_amount;
    END IF;
    IF p_grand_total IS NOT NULL AND p_grand_total <> v_calc_grand_total THEN
        RAISE EXCEPTION 'INVOICE_TOTAL_MISMATCH: Provided grand total (%) does not match calculated grand total (%).', p_grand_total, v_calc_grand_total;
    END IF;

    -- 5. Resolve creating partner ID
    IF auth.uid() IS NOT NULL THEN
        SELECT id INTO v_partner_id
        FROM public.partners
        WHERE (auth_user_id = auth.uid() OR (auth_user_id IS NULL AND email = (auth.jwt() ->> 'email')))
          AND is_active = true
        LIMIT 1;
    END IF;

    -- 6. Atomically insert invoice header using verified financial totals (original Phase 2 columns)
    INSERT INTO public.invoices (
        homestay_id, booking_id, invoice_number, invoice_date, status,
        guest_name, guest_phone, guest_email, guest_address,
        check_in, check_out, room_id, room_name,
        subtotal, tax_rate, tax_amount, discount_amount, grand_total,
        amount_paid, balance_due, notes, house_rules, created_by
    ) VALUES (
        v_booking_homestay_id, p_booking_id, p_invoice_number, COALESCE(p_invoice_date, CURRENT_DATE), COALESCE(p_status, 'draft'),
        p_guest_name, p_guest_phone, p_guest_email, p_guest_address,
        p_check_in, p_check_out, p_room_id, p_room_name,
        v_calc_subtotal, COALESCE(p_tax_rate, 0.00), v_calc_tax_amount,
        v_calc_total_discount, v_calc_grand_total,
        0.00, v_calc_grand_total, p_notes, p_house_rules, v_partner_id
    ) RETURNING id INTO v_invoice_id;

    -- 7. Atomically insert line items
    IF jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN (
            SELECT 
                COALESCE(value->>'category', 'room') AS category,
                COALESCE(value->>'description', '') AS description,
                value->>'stay_period' AS stay_period,
                COALESCE((value->>'quantity')::numeric, 1.00) AS quantity,
                COALESCE((value->>'rate')::numeric, 0.00) AS rate,
                (value->>'amount')::numeric AS amount,
                COALESCE((value->>'sort_order')::integer, ord::integer) AS sort_order
            FROM jsonb_array_elements(p_items) WITH ORDINALITY AS arr(value, ord)
        ) LOOP
            v_item_expected_amount := ROUND(v_item.quantity * v_item.rate, 2);
            INSERT INTO public.invoice_items (
                invoice_id, homestay_id, category, description, stay_period,
                quantity, rate, amount, sort_order
            ) VALUES (
                v_invoice_id, v_booking_homestay_id, v_item.category, v_item.description, v_item.stay_period,
                v_item.quantity, v_item.rate, COALESCE(v_item.amount, v_item_expected_amount), v_item.sort_order
            );
        END LOOP;
    END IF;

    RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invoice_with_items(UUID, TEXT, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, DATE, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 3. Drop indexes
DROP INDEX IF EXISTS public.uq_invoices_active_group;
DROP INDEX IF EXISTS public.idx_invoices_group_id;
DROP INDEX IF EXISTS public.idx_bookings_group_lead;
DROP INDEX IF EXISTS public.idx_bookings_group_id;

-- 4. Drop columns
ALTER TABLE public.invoices DROP COLUMN IF EXISTS group_id;
ALTER TABLE public.bookings DROP COLUMN IF EXISTS is_group_lead;
ALTER TABLE public.bookings DROP COLUMN IF EXISTS group_id;

-- 5. Refresh PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
