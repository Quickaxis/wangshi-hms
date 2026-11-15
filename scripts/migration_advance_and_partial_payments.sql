-- ==========================================================
-- HMS MIGRATION: ADVANCE, PARTIAL PAYMENT & FORMAL RECEIPT SYSTEM
-- ==========================================================
-- Strictly additive, non-destructive, and idempotent.
-- Preserves existing immutable payments, invoices, and ledger triggers.
-- Adds payment_stage and receipt_number columns with deterministic backfill.
-- ==========================================================

BEGIN;

-- 1. Ensure prerequisite tables exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'payments'
    ) THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_PREREQUISITE_MISSING: Table "public.payments" does not exist.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'invoices'
    ) THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_PREREQUISITE_MISSING: Table "public.invoices" does not exist.';
    END IF;
END $$;

-- 2. Add columns to public.payments
DO $$
BEGIN
    -- payment_stage column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'payment_stage'
    ) THEN
        ALTER TABLE public.payments 
            ADD COLUMN payment_stage TEXT CHECK (payment_stage IN ('advance', 'partial', 'final', 'refund', 'reversal'));
    END IF;

    -- receipt_number column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'receipt_number'
    ) THEN
        ALTER TABLE public.payments 
            ADD COLUMN receipt_number TEXT;
    END IF;
END $$;

-- 3. Create high-performance indexes
CREATE INDEX IF NOT EXISTS idx_payments_payment_stage ON public.payments(payment_stage);
CREATE INDEX IF NOT EXISTS idx_payments_receipt_number ON public.payments(receipt_number);

-- 4. Safeguard Ledger Immutability while permitting unallocated advance payment linking & metadata backfill
CREATE OR REPLACE FUNCTION public.prevent_payment_ledger_mutation()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Allow linking unallocated advance payment to invoice_id,
        -- and setting payment_stage / receipt_number metadata.
        -- Core financial data (amount, booking_id, homestay_id, payment_type, etc.) remains strictly immutable.
        IF (OLD.invoice_id IS NULL OR OLD.invoice_id = NEW.invoice_id)
           AND OLD.amount = NEW.amount
           AND OLD.booking_id = NEW.booking_id
           AND OLD.homestay_id = NEW.homestay_id
           AND OLD.payment_type = NEW.payment_type
           AND OLD.payment_method = NEW.payment_method
           AND OLD.parent_payment_id IS NOT DISTINCT FROM NEW.parent_payment_id
           AND OLD.idempotency_key IS NOT DISTINCT FROM NEW.idempotency_key
           AND OLD.created_at = NEW.created_at THEN
            RETURN NEW;
        END IF;
    END IF;
    RAISE EXCEPTION 'PAYMENT_LEDGER_IMMUTABLE: Posted financial transactions are append-only. Updates to monetary values and transaction history are prohibited.';
END;
$$;

-- Grant column-level UPDATE on invoice_id, payment_stage, receipt_number to authenticated and service_role
GRANT UPDATE (invoice_id, payment_stage, receipt_number) ON public.payments TO authenticated, service_role;

-- 5. Deterministic backfill of historical payments
DO $$
BEGIN
    -- Temporarily disable mutation trigger if active during batch metadata backfill
    IF EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trg_prevent_payment_ledger_mutation' 
          AND tgrelid = 'public.payments'::regclass
    ) THEN
        ALTER TABLE public.payments DISABLE TRIGGER trg_prevent_payment_ledger_mutation;
    END IF;

    -- Backfill receipt_number for all existing payments (Format: REC-YYYYMMDD-XXXXXXXX)
    UPDATE public.payments
    SET receipt_number = 'REC-' || 
        to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') || '-' || 
        upper(substring(replace(id::text, '-', ''), 1, 8))
    WHERE receipt_number IS NULL;

    -- Backfill payment_stage based on type, note tags, and booking dates
    -- 5a. Refunds and Reversals
    UPDATE public.payments SET payment_stage = 'refund' WHERE payment_type = 'refund' AND payment_stage IS NULL;
    UPDATE public.payments SET payment_stage = 'reversal' WHERE payment_type = 'reversal' AND payment_stage IS NULL;

    -- 5b. Explicit tags in audit notes
    UPDATE public.payments SET payment_stage = 'advance' WHERE notes ~* '^\\[Advance\\]' AND payment_stage IS NULL;
    UPDATE public.payments SET payment_stage = 'partial' WHERE notes ~* '^\\[Partial\\]' AND payment_stage IS NULL;
    UPDATE public.payments SET payment_stage = 'final' WHERE notes ~* '^\\[Final\\]' AND payment_stage IS NULL;

    -- 5c. Payments created before or on check-in date default to 'advance'
    UPDATE public.payments p
    SET payment_stage = 'advance'
    FROM public.bookings b
    WHERE p.booking_id = b.id
      AND p.payment_stage IS NULL
      AND (p.created_at AT TIME ZONE 'Asia/Kolkata')::date <= b.check_in;

    -- 5d. Any remaining payments default to 'partial'
    UPDATE public.payments
    SET payment_stage = 'partial'
    WHERE payment_stage IS NULL;

    -- Re-enable mutation trigger
    IF EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trg_prevent_payment_ledger_mutation' 
          AND tgrelid = 'public.payments'::regclass
    ) THEN
        ALTER TABLE public.payments ENABLE TRIGGER trg_prevent_payment_ledger_mutation;
    END IF;
END $$;

-- 5. Update atomic payment recording function to support payment_stage & receipt_number
-- Drop the legacy 6-parameter signature to prevent PostgreSQL function overload resolution ambiguity
DROP FUNCTION IF EXISTS public.record_invoice_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.record_invoice_payment(
    p_invoice_id UUID,
    p_amount NUMERIC,
    p_payment_method TEXT DEFAULT 'cash',
    p_transaction_ref TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_payment_stage TEXT DEFAULT NULL,
    p_receipt_number TEXT DEFAULT NULL
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
    v_effective_stage TEXT;
    v_effective_receipt_num TEXT;
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

    -- Lock parent booking row first
    PERFORM 1 FROM public.bookings WHERE id = v_booking_id FOR UPDATE;

    -- Lock invoice row
    SELECT homestay_id, grand_total, status, amount_paid, balance_due
    INTO v_homestay_id, v_grand_total, v_invoice_status, v_current_paid, v_balance_due
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF v_invoice_status = 'cancelled' THEN
        RAISE EXCEPTION 'INVOICE_CANCELLED: Cannot record payment against a cancelled invoice.';
    END IF;

    -- Strict overpayment validation
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
        -- Fallback for service_role or internal system calls
        SELECT id INTO v_recorder_id
        FROM public.partners
        WHERE homestay_id = v_homestay_id AND is_active = true
        ORDER BY (role = 'super_admin') DESC, id ASC
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PAYMENT_RECORDER_UNAUTHORIZED: No active partner found for this homestay.' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 5. Resolve payment stage and receipt number
    v_effective_stage := p_payment_stage;
    IF v_effective_stage IS NULL THEN
        IF p_notes ~* '^\\[Advance\\]' THEN
            v_effective_stage := 'advance';
        ELSIF p_notes ~* '^\\[Final\\]' OR (p_amount >= v_balance_due) THEN
            v_effective_stage := 'final';
        ELSE
            v_effective_stage := 'partial';
        END IF;
    END IF;

    v_payment_id := gen_random_uuid();
    v_effective_receipt_num := p_receipt_number;
    IF v_effective_receipt_num IS NULL THEN
        v_effective_receipt_num := 'REC-' || 
            to_char(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') || '-' || 
            upper(substring(replace(v_payment_id::text, '-', ''), 1, 8));
    END IF;

    -- 6. Insert immutable payment record
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
        payment_stage,
        receipt_number,
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
        v_effective_stage,
        v_effective_receipt_num,
        NOW()
    );

    -- 7. Authoritatively reconcile invoice summary
    PERFORM public.reconcile_invoice_summary(p_invoice_id);

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'receipt_number', v_effective_receipt_num,
        'payment_stage', v_effective_stage
    );
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 6. Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
