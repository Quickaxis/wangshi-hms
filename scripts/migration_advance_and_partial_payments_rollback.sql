-- ==========================================================
-- HMS MIGRATION ROLLBACK: ADVANCE, PARTIAL PAYMENT & FORMAL RECEIPT SYSTEM
-- ==========================================================
-- Safe rollback restoring Phase 2 schema state.
-- Does NOT delete any payment or invoice records.
-- ==========================================================

BEGIN;

-- 1. Drop 8-parameter record_invoice_payment function first
DROP FUNCTION IF EXISTS public.record_invoice_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

-- 2. Restore Phase 2 6-parameter record_invoice_payment function with standard partner auth
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
    p_invoice_id UUID,
    p_amount NUMERIC,
    p_payment_method TEXT DEFAULT 'cash',
    p_transaction_ref TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_homestay_id UUID;
    v_booking_id UUID;
    v_grand_total NUMERIC(12,2);
    v_current_paid NUMERIC(12,2);
    v_balance_due NUMERIC(12,2);
    v_invoice_status TEXT;
    v_payment_id UUID;
    v_existing_payment_id UUID;
    v_recorder_id UUID;
    v_recorder_homestay_id UUID;
    v_recorder_role TEXT;
BEGIN
    -- 1. Idempotency Check
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
        SELECT id INTO v_existing_payment_id
        FROM public.payments
        WHERE idempotency_key = trim(p_idempotency_key)
        LIMIT 1;

        IF v_existing_payment_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'payment_id', v_existing_payment_id,
                'idempotent_replay', true
            );
        END IF;
    END IF;

    -- 2. Input validation
    IF p_amount IS NULL OR p_amount <= 0.00 THEN
        RAISE EXCEPTION 'PAYMENT_AMOUNT_INVALID: Payment amount must be strictly greater than zero.';
    END IF;

    -- 3. Lock booking and invoice in deterministic order
    SELECT booking_id INTO v_booking_id
    FROM public.invoices
    WHERE id = p_invoice_id;

    IF v_booking_id IS NULL THEN
        RAISE EXCEPTION 'INVOICE_NOT_FOUND: Referenced invoice does not exist.';
    END IF;

    PERFORM 1 FROM public.bookings WHERE id = v_booking_id FOR UPDATE;

    SELECT homestay_id, grand_total, status, amount_paid, balance_due
    INTO v_homestay_id, v_grand_total, v_invoice_status, v_current_paid, v_balance_due
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF v_invoice_status = 'cancelled' THEN
        RAISE EXCEPTION 'INVOICE_CANCELLED: Cannot record payment against a cancelled invoice.';
    END IF;

    IF p_amount > v_balance_due THEN
        RAISE EXCEPTION 'INVOICE_OVERPAYMENT_EXCEEDED: Payment of ₹% exceeds remaining balance of ₹%.',
            p_amount, v_balance_due;
    END IF;

    -- 4. Verify caller authorization (supports Supabase Auth JWT and service_role fallback)
    IF auth.uid() IS NOT NULL THEN
        SELECT id, homestay_id, role INTO v_recorder_id, v_recorder_homestay_id, v_recorder_role
        FROM public.partners
        WHERE (auth_user_id = auth.uid() OR (auth_user_id IS NULL AND email = (auth.jwt() ->> 'email')))
          AND is_active = true
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PAYMENT_RECORDER_UNAUTHORIZED: Current user is not authorized as an active partner.' USING ERRCODE = '42501';
        END IF;

        IF COALESCE(v_recorder_role, 'partner') <> 'super_admin' AND v_recorder_homestay_id <> v_homestay_id THEN
            RAISE EXCEPTION 'PAYMENT_RECORDER_UNAUTHORIZED: Current user is not authorized to record payments for this homestay.' USING ERRCODE = '42501';
        END IF;
    ELSE
        SELECT id INTO v_recorder_id
        FROM public.partners
        WHERE homestay_id = v_homestay_id AND is_active = true
        ORDER BY (role = 'super_admin') DESC, id ASC
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PAYMENT_RECORDER_UNAUTHORIZED: No active partner found for this homestay.' USING ERRCODE = '42501';
        END IF;
    END IF;

    v_payment_id := gen_random_uuid();

    INSERT INTO public.payments (
        id,
        homestay_id,
        booking_id,
        invoice_id,
        amount,
        payment_type,
        payment_method,
        transaction_ref,
        notes,
        recorded_by,
        idempotency_key,
        created_at
    ) VALUES (
        v_payment_id,
        v_homestay_id,
        v_booking_id,
        p_invoice_id,
        p_amount,
        'payment',
        p_payment_method,
        trim(p_transaction_ref),
        trim(p_notes),
        v_recorder_id,
        trim(p_idempotency_key),
        NOW()
    );

    PERFORM public.reconcile_invoice_summary(p_invoice_id);

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_invoice_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 3. Restore Phase 1 strict prevent_payment_ledger_mutation trigger function
CREATE OR REPLACE FUNCTION public.prevent_payment_ledger_mutation()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'PAYMENT_LEDGER_IMMUTABLE: Posted financial transactions are append-only. Updates and deletes are prohibited. Use compensating reversal entries.';
END;
$$;

-- 4. Drop indexes
DROP INDEX IF EXISTS public.idx_payments_payment_stage;
DROP INDEX IF EXISTS public.idx_payments_receipt_number;

-- 5. Drop columns
ALTER TABLE public.payments DROP COLUMN IF EXISTS payment_stage;
ALTER TABLE public.payments DROP COLUMN IF EXISTS receipt_number;

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;

