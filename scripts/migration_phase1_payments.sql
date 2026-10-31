-- ==========================================================
-- PHASE 1: ATOMIC PAYMENTS LEDGER & FINANCIAL INTEGRITY
-- ==========================================================
-- Safe, strictly idempotent, additive migration.
--
-- ARCHITECTURAL GUARANTEES:
-- 1. Does NOT alter bookings, rooms, partners, or homestays structure.
-- 2. Pre-Flight Structural Diagnostic: Checks if an existing payments table
--    contains conflicting column definitions (e.g. non-numeric amount), halting
--    safely before applying changes.
-- 3. Financial History Protection: ON DELETE RESTRICT on booking_id prevents
--    accidental deletion of bookings that have financial records.
-- 4. Distinguishes 'payment', 'refund', and 'reversal' as first-class entries.
-- 5. Pre-Validation of Existing Data: Before enforcing NOT NULL, checks whether
--    any existing rows contain NULL values in critical columns. If found, halts
--    with a descriptive diagnostic and never invents or corrupts data.
-- 6. Strict Reversal & Linked Refund Invariant:
--    - A reversal or linked refund cannot exceed the unreversed AND unrefunded
--      balance of the specific parent payment.
--    - Reversals and refunds (linked or unlinked) are additionally checked against
--      global net collected cash to prevent negative cash positions.
-- 7. Concurrency-Safe: Serializes concurrent transactions on the same booking
--    via row-level lock (FOR UPDATE on bookings) inside the integrity trigger.
-- 8. Hardened Security Definer: Pins search_path to public, pg_temp to prevent
--    temporary schema injection. Trigger functions cannot be abused.
-- 9. Enforces ledger immutability (blocks UPDATE and DELETE).
-- 10. Fully idempotent against repeated execution on existing schemas.
-- ==========================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0. Comprehensive Pre-Flight Structural Diagnostic Check for Fresh Database and Existing Payments Table
DO $$
DECLARE
    v_col_type TEXT;
    v_amount_prec INTEGER;
    v_amount_scale INTEGER;
    v_conflict_triggers INTEGER := 0;
BEGIN
    -- 0.0 Ensure prerequisite tables exist (Guarantees safe execution on fresh database)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'homestays'
    ) THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_PREREQUISITE_MISSING: Required table "public.homestays" does not exist. Please apply the core schema before running Phase 1.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'bookings'
    ) THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_PREREQUISITE_MISSING: Required table "public.bookings" does not exist. Please apply the core schema before running Phase 1.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'partners'
    ) THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_PREREQUISITE_MISSING: Required table "public.partners" does not exist. Please apply the core schema before running Phase 1.';
    END IF;

    -- 0.1 Structural Diagnostic Check for existing/partially created payments table
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'payments'
    ) THEN
        -- Validate "id" column exists, is UUID, and is constrained as PRIMARY KEY or UNIQUE
        SELECT data_type INTO v_col_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'id';

        IF v_col_type IS NULL THEN
            RAISE EXCEPTION 'MIGRATION_HALTED_SCHEMA_CONFLICT: Existing payments table is missing the "id" column. Incompatible partially created table detected.';
        ELSIF v_col_type <> 'uuid' THEN
            RAISE EXCEPTION 'MIGRATION_HALTED_TYPE_CONFLICT: Existing column "id" has type "%" instead of UUID. Incompatible partially created table detected.', v_col_type;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
            WHERE n.nspname = 'public' AND t.relname = 'payments'
              AND c.contype IN ('p', 'u')
              AND a.attname = 'id'
        ) THEN
            RAISE EXCEPTION 'MIGRATION_HALTED_SCHEMA_CONFLICT: Existing payments table column "id" lacks a PRIMARY KEY or UNIQUE constraint. Incompatible partially created table detected.';
        END IF;

        -- Validate amount column type, precision, and scale
        SELECT data_type, numeric_precision, numeric_scale
        INTO v_col_type, v_amount_prec, v_amount_scale
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'amount';

        IF v_col_type IS NOT NULL THEN
            IF v_col_type NOT IN ('numeric') THEN
                RAISE EXCEPTION 'MIGRATION_HALTED_TYPE_CONFLICT: Existing payments table has column "amount" of data_type "%" instead of NUMERIC(12,2). Manual migration or conversion is required.',
                    v_col_type;
            END IF;
            IF v_amount_prec IS NOT NULL AND (v_amount_prec <> 12 OR v_amount_scale <> 2) THEN
                RAISE EXCEPTION 'MIGRATION_HALTED_PRECISION_CONFLICT: Existing payments column "amount" has NUMERIC(%,%) instead of NUMERIC(12,2). Precision realignment required.',
                    v_amount_prec, v_amount_scale;
            END IF;
        END IF;

        -- Validate UUID column types if present
        SELECT data_type INTO v_col_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'homestay_id';
        IF v_col_type IS NOT NULL AND v_col_type <> 'uuid' THEN
            RAISE EXCEPTION 'MIGRATION_HALTED_TYPE_CONFLICT: Existing column "homestay_id" has type "%" instead of UUID.', v_col_type;
        END IF;

        SELECT data_type INTO v_col_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'booking_id';
        IF v_col_type IS NOT NULL AND v_col_type <> 'uuid' THEN
            RAISE EXCEPTION 'MIGRATION_HALTED_TYPE_CONFLICT: Existing column "booking_id" has type "%" instead of UUID.', v_col_type;
        END IF;

        SELECT data_type INTO v_col_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'recorded_by';
        IF v_col_type IS NOT NULL AND v_col_type <> 'uuid' THEN
            RAISE EXCEPTION 'MIGRATION_HALTED_TYPE_CONFLICT: Existing column "recorded_by" has type "%" instead of UUID.', v_col_type;
        END IF;

        SELECT data_type INTO v_col_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'parent_payment_id';
        IF v_col_type IS NOT NULL AND v_col_type <> 'uuid' THEN
            RAISE EXCEPTION 'MIGRATION_HALTED_TYPE_CONFLICT: Existing column "parent_payment_id" has type "%" instead of UUID.', v_col_type;
        END IF;

        SELECT data_type INTO v_col_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'invoice_id';
        IF v_col_type IS NOT NULL AND v_col_type <> 'uuid' THEN
            RAISE EXCEPTION 'MIGRATION_HALTED_TYPE_CONFLICT: Existing column "invoice_id" has type "%" instead of UUID.', v_col_type;
        END IF;

        -- Validate string column types if present
        SELECT data_type INTO v_col_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'payment_type';
        IF v_col_type IS NOT NULL AND v_col_type NOT IN ('text', 'character varying') THEN
            RAISE EXCEPTION 'MIGRATION_HALTED_TYPE_CONFLICT: Existing column "payment_type" has type "%" instead of TEXT.', v_col_type;
        END IF;

        SELECT data_type INTO v_col_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'payment_method';
        IF v_col_type IS NOT NULL AND v_col_type NOT IN ('text', 'character varying') THEN
            RAISE EXCEPTION 'MIGRATION_HALTED_TYPE_CONFLICT: Existing column "payment_method" has type "%" instead of TEXT.', v_col_type;
        END IF;

        SELECT data_type INTO v_col_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'transaction_ref';
        IF v_col_type IS NOT NULL AND v_col_type NOT IN ('text', 'character varying') THEN
            RAISE EXCEPTION 'MIGRATION_HALTED_TYPE_CONFLICT: Existing column "transaction_ref" has type "%" instead of TEXT.', v_col_type;
        END IF;

        SELECT data_type INTO v_col_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'notes';
        IF v_col_type IS NOT NULL AND v_col_type NOT IN ('text', 'character varying') THEN
            RAISE EXCEPTION 'MIGRATION_HALTED_TYPE_CONFLICT: Existing column "notes" has type "%" instead of TEXT.', v_col_type;
        END IF;

        -- Validate timestamp column types if present
        SELECT data_type INTO v_col_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'created_at';
        IF v_col_type IS NOT NULL AND v_col_type NOT IN ('timestamp with time zone', 'timestamp without time zone') THEN
            RAISE EXCEPTION 'MIGRATION_HALTED_TYPE_CONFLICT: Existing column "created_at" has type "%" instead of TIMESTAMP WITH TIME ZONE.', v_col_type;
        END IF;

        -- Validate Foreign Keys (Guard against ON DELETE CASCADE on payments table)
        IF EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
            WHERE n.nspname = 'public' AND t.relname = 'payments'
              AND c.contype = 'f'
              AND c.confdeltype = 'c'
        ) THEN
            RAISE EXCEPTION 'MIGRATION_HALTED_FK_CASCADE_CONFLICT: Existing foreign key on payments table uses ON DELETE CASCADE. Payment records must be protected from cascading deletion with ON DELETE RESTRICT.';
        END IF;

        -- Inspect non-standard triggers that might interfere with ledger immutability
        SELECT COUNT(*) INTO v_conflict_triggers
        FROM pg_trigger
        WHERE tgrelid = 'public.payments'::regclass AND NOT tgisinternal
          AND tgname NOT IN ('trg_validate_payment_integrity', 'trg_prevent_payment_ledger_mutation');

        IF v_conflict_triggers > 0 THEN
            RAISE NOTICE 'PRE_FLIGHT_AUDIT: % external trigger(s) found on payments table. Trigger immutability safeguards will be installed.', v_conflict_triggers;
        END IF;
    END IF;
END $$;

-- 1. Create table idempotently
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- 2. Add columns idempotently (handles partial/pre-existing tables safely)
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS homestay_id UUID;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS booking_id UUID;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'payment';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS parent_payment_id UUID;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS transaction_ref TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS recorded_by UUID;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. Idempotent pre-validation of NULL values, invalid data, and orphaned foreign keys before applying constraints
-- Stops safely if any existing rows contain NULLs, invalid values, or orphaned IDs, rather than failing abruptly or inventing data.
DO $$
DECLARE
    v_null_homestay INTEGER := 0;
    v_null_booking INTEGER := 0;
    v_null_amount INTEGER := 0;
    v_null_type INTEGER := 0;
    v_null_method INTEGER := 0;
    v_null_recorded INTEGER := 0;
    v_invalid_amount INTEGER := 0;
    v_invalid_type INTEGER := 0;
    v_invalid_method INTEGER := 0;
    v_orphan_homestay INTEGER := 0;
    v_orphan_booking INTEGER := 0;
    v_orphan_partner INTEGER := 0;
    v_orphan_parent INTEGER := 0;
BEGIN
    SELECT 
        COUNT(*) FILTER (WHERE homestay_id IS NULL),
        COUNT(*) FILTER (WHERE booking_id IS NULL),
        COUNT(*) FILTER (WHERE amount IS NULL),
        COUNT(*) FILTER (WHERE payment_type IS NULL),
        COUNT(*) FILTER (WHERE payment_method IS NULL),
        COUNT(*) FILTER (WHERE recorded_by IS NULL),
        COUNT(*) FILTER (WHERE amount <= 0),
        COUNT(*) FILTER (WHERE payment_type NOT IN ('payment', 'refund', 'reversal')),
        COUNT(*) FILTER (WHERE payment_method NOT IN ('cash', 'upi', 'bank_transfer', 'card', 'ota_payout'))
    INTO 
        v_null_homestay, v_null_booking, v_null_amount,
        v_null_type, v_null_method, v_null_recorded,
        v_invalid_amount, v_invalid_type, v_invalid_method
    FROM public.payments;

    IF v_null_homestay > 0 OR v_null_booking > 0 OR v_null_amount > 0 OR 
       v_null_type > 0 OR v_null_method > 0 OR v_null_recorded > 0 THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_NULL_DATA: The existing payments table contains NULL values in critical financial columns (homestay_id: %, booking_id: %, amount: %, payment_type: %, payment_method: %, recorded_by: %). Migration halted to protect financial audit integrity. Please inspect and resolve invalid records manually before applying NOT NULL constraints.',
            v_null_homestay, v_null_booking, v_null_amount, v_null_type, v_null_method, v_null_recorded;
    END IF;

    IF v_invalid_amount > 0 THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_CHECK_CONFLICT: Existing payments table contains % rows with amount <= 0. Positive amounts required.', v_invalid_amount;
    END IF;

    IF v_invalid_type > 0 THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_CHECK_CONFLICT: Existing payments table contains % rows with unrecognized payment_type. Allowed: payment, refund, reversal.', v_invalid_type;
    END IF;

    IF v_invalid_method > 0 THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_CHECK_CONFLICT: Existing payments table contains % rows with unrecognized payment_method.', v_invalid_method;
    END IF;

    -- Diagnostic pre-flight check for orphaned foreign keys
    SELECT COUNT(*) INTO v_orphan_homestay
    FROM public.payments p
    WHERE p.homestay_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM public.homestays h WHERE h.id = p.homestay_id);

    SELECT COUNT(*) INTO v_orphan_booking
    FROM public.payments p
    WHERE p.booking_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = p.booking_id);

    SELECT COUNT(*) INTO v_orphan_partner
    FROM public.payments p
    WHERE p.recorded_by IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM public.partners pt WHERE pt.id = p.recorded_by);

    SELECT COUNT(*) INTO v_orphan_parent
    FROM public.payments p
    WHERE p.parent_payment_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM public.payments pp WHERE pp.id = p.parent_payment_id);

    IF v_orphan_homestay > 0 OR v_orphan_booking > 0 OR v_orphan_partner > 0 OR v_orphan_parent > 0 THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_ORPHAN_FK: Existing payments table contains orphaned references (homestay_id: %, booking_id: %, recorded_by: %, parent_payment_id: %). Please resolve orphaned records before applying foreign key constraints.',
            v_orphan_homestay, v_orphan_booking, v_orphan_partner, v_orphan_parent;
    END IF;
END $$;

-- 4. Idempotently enforce NOT NULL on verified columns
ALTER TABLE public.payments ALTER COLUMN homestay_id SET NOT NULL;
ALTER TABLE public.payments ALTER COLUMN booking_id SET NOT NULL;
ALTER TABLE public.payments ALTER COLUMN amount SET NOT NULL;
ALTER TABLE public.payments ALTER COLUMN payment_type SET NOT NULL;
ALTER TABLE public.payments ALTER COLUMN payment_method SET NOT NULL;
ALTER TABLE public.payments ALTER COLUMN recorded_by SET NOT NULL;

-- 5. Deterministic Foreign Key Enforcement
-- Detect and safely replace any missing, incorrectly defined, or legacy FK constraints.
-- Verifies exact source column, target schema/table, target column (id), and confdeltype = 'r'.
DO $$
DECLARE
    r RECORD;
    v_has_homestay_fk BOOLEAN := false;
    v_has_booking_fk BOOLEAN := false;
    v_has_recorded_by_fk BOOLEAN := false;
    v_has_parent_fk BOOLEAN := false;
BEGIN
    FOR r IN (
        SELECT 
            c.conname,
            c.confdeltype,
            fn.nspname AS target_schema,
            ft.relname AS target_table,
            (
                SELECT array_agg(a.attname::text ORDER BY u.ord)
                FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
            ) AS source_cols,
            (
                SELECT array_agg(fa.attname::text ORDER BY u.ord)
                FROM unnest(c.confkey) WITH ORDINALITY AS u(attnum, ord)
                JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = u.attnum
            ) AS target_cols
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        JOIN pg_class ft ON c.confrelid = ft.oid
        JOIN pg_namespace fn ON ft.relnamespace = fn.oid
        WHERE n.nspname = 'public'
          AND t.relname = 'payments'
          AND c.contype = 'f'
        GROUP BY c.oid, c.conname, c.confdeltype, fn.nspname, ft.relname, c.conrelid, c.confrelid, c.conkey, c.confkey
    ) LOOP
        -- homestay_id FK
        IF r.source_cols = ARRAY['homestay_id']::text[] THEN
            IF r.conname = 'fk_payments_homestay_restrict'
               AND r.confdeltype = 'r'
               AND r.target_schema = 'public'
               AND r.target_table = 'homestays'
               AND r.target_cols = ARRAY['id']::text[] THEN
                v_has_homestay_fk := true;
            ELSE
                EXECUTE 'ALTER TABLE public.payments DROP CONSTRAINT ' || quote_ident(r.conname);
            END IF;
        END IF;

        -- booking_id FK
        IF r.source_cols = ARRAY['booking_id']::text[] THEN
            IF r.conname = 'fk_payments_booking_restrict'
               AND r.confdeltype = 'r'
               AND r.target_schema = 'public'
               AND r.target_table = 'bookings'
               AND r.target_cols = ARRAY['id']::text[] THEN
                v_has_booking_fk := true;
            ELSE
                EXECUTE 'ALTER TABLE public.payments DROP CONSTRAINT ' || quote_ident(r.conname);
            END IF;
        END IF;

        -- recorded_by FK
        IF r.source_cols = ARRAY['recorded_by']::text[] THEN
            IF r.conname = 'fk_payments_recorded_by_restrict'
               AND r.confdeltype = 'r'
               AND r.target_schema = 'public'
               AND r.target_table = 'partners'
               AND r.target_cols = ARRAY['id']::text[] THEN
                v_has_recorded_by_fk := true;
            ELSE
                EXECUTE 'ALTER TABLE public.payments DROP CONSTRAINT ' || quote_ident(r.conname);
            END IF;
        END IF;

        -- parent_payment_id FK
        IF r.source_cols = ARRAY['parent_payment_id']::text[] THEN
            IF r.conname = 'fk_payments_parent_restrict'
               AND r.confdeltype = 'r'
               AND r.target_schema = 'public'
               AND r.target_table = 'payments'
               AND r.target_cols = ARRAY['id']::text[] THEN
                v_has_parent_fk := true;
            ELSE
                EXECUTE 'ALTER TABLE public.payments DROP CONSTRAINT ' || quote_ident(r.conname);
            END IF;
        END IF;
    END LOOP;

    IF NOT v_has_homestay_fk THEN
        ALTER TABLE public.payments ADD CONSTRAINT fk_payments_homestay_restrict 
            FOREIGN KEY (homestay_id) REFERENCES public.homestays(id) ON DELETE RESTRICT;
    END IF;

    IF NOT v_has_booking_fk THEN
        ALTER TABLE public.payments ADD CONSTRAINT fk_payments_booking_restrict 
            FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE RESTRICT;
    END IF;

    IF NOT v_has_recorded_by_fk THEN
        ALTER TABLE public.payments ADD CONSTRAINT fk_payments_recorded_by_restrict 
            FOREIGN KEY (recorded_by) REFERENCES public.partners(id) ON DELETE RESTRICT;
    END IF;

    IF NOT v_has_parent_fk THEN
        ALTER TABLE public.payments ADD CONSTRAINT fk_payments_parent_restrict 
            FOREIGN KEY (parent_payment_id) REFERENCES public.payments(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- 5. Idempotent check constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payments_positive_amount'
    ) THEN
        ALTER TABLE public.payments ADD CONSTRAINT chk_payments_positive_amount CHECK (amount > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payments_type'
    ) THEN
        ALTER TABLE public.payments ADD CONSTRAINT chk_payments_type CHECK (payment_type IN ('payment', 'refund', 'reversal'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payments_method'
    ) THEN
        ALTER TABLE public.payments ADD CONSTRAINT chk_payments_method CHECK (payment_method IN ('cash', 'upi', 'bank_transfer', 'card', 'ota_payout'));
    END IF;
END $$;

-- 6. Performance indexes
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON public.payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_homestay_created ON public.payments(homestay_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_parent_id ON public.payments(parent_payment_id) WHERE parent_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_homestay_idempotency_key 
    ON public.payments(homestay_id, idempotency_key) 
    WHERE idempotency_key IS NOT NULL;

-- 7. Atomic integrity trigger: Concurrency lock, tenant verification, linked refund & reversal checks
CREATE OR REPLACE FUNCTION validate_payment_integrity()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking_homestay_id UUID;
    v_partner_homestay_id UUID;
    v_partner_role TEXT;
    v_parent_payment payments%ROWTYPE;
    v_parent_allocated NUMERIC(12,2);
    v_parent_remaining NUMERIC(12,2);
    v_current_net_collected NUMERIC(12,2);
BEGIN
    -- A. Atomically lock parent booking row to serialize concurrent transactions for this booking
    SELECT homestay_id INTO v_booking_homestay_id
    FROM bookings 
    WHERE id = NEW.booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYMENT_INVALID_BOOKING: Referenced booking (%) does not exist.', NEW.booking_id;
    END IF;

    -- B. Verify payment homestay_id matches booking homestay_id
    IF NEW.homestay_id <> v_booking_homestay_id THEN
        RAISE EXCEPTION 'PAYMENT_TENANT_MISMATCH: Payment homestay_id (%) does not match booking homestay_id (%).',
            NEW.homestay_id, v_booking_homestay_id;
    END IF;

    -- C. Verify recorded_by partner exists and check tenant authorization
    SELECT homestay_id, role INTO v_partner_homestay_id, v_partner_role
    FROM partners 
    WHERE id = NEW.recorded_by AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYMENT_INVALID_RECORDER: Partner (%) does not exist or is inactive.', NEW.recorded_by;
    END IF;

    IF COALESCE(v_partner_role, 'partner') <> 'super_admin' AND v_partner_homestay_id <> NEW.homestay_id THEN
        RAISE EXCEPTION 'PAYMENT_RECORDER_UNAUTHORIZED: Partner (%) is not authorized for homestay (%).',
            NEW.recorded_by, NEW.homestay_id;
    END IF;

    -- Original payment entries cannot link to a parent payment
    IF NEW.payment_type = 'payment' AND NEW.parent_payment_id IS NOT NULL THEN
        RAISE EXCEPTION 'PAYMENT_CANNOT_HAVE_PARENT: An original payment entry cannot reference a parent_payment_id.';
    END IF;

    -- D. Validation for transactions linked to a parent payment (mandatory for reversals, optional for refunds)
    IF NEW.parent_payment_id IS NOT NULL THEN
        SELECT * INTO v_parent_payment
        FROM payments
        WHERE id = NEW.parent_payment_id AND booking_id = NEW.booking_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PARENT_PAYMENT_NOT_FOUND: Parent payment (%) not found on booking (%).',
                NEW.parent_payment_id, NEW.booking_id;
        END IF;

        IF v_parent_payment.payment_type <> 'payment' THEN
            RAISE EXCEPTION 'PARENT_INVALID_TYPE: Parent payment (%) must be an original "payment" entry, but found "%".',
                NEW.parent_payment_id, v_parent_payment.payment_type;
        END IF;

        -- Calculate cumulative reversals AND refunds already applied to THIS parent payment
        SELECT COALESCE(SUM(amount), 0) INTO v_parent_allocated
        FROM payments
        WHERE parent_payment_id = NEW.parent_payment_id
          AND payment_type IN ('reversal', 'refund');

        v_parent_remaining := v_parent_payment.amount - v_parent_allocated;

        IF NEW.amount > v_parent_remaining THEN
            RAISE EXCEPTION 'PARENT_BALANCE_EXCEEDED: Transaction amount (%) exceeds remaining available balance (%) of parent payment (%). Original: %, Already Allocated to Refunds/Reversals: %.',
                NEW.amount, v_parent_remaining, NEW.parent_payment_id, v_parent_payment.amount, v_parent_allocated;
        END IF;
    END IF;

    -- E. Specific rule for REVERSALS: must have a parent payment and audit note
    IF NEW.payment_type = 'reversal' THEN
        IF NEW.parent_payment_id IS NULL THEN
            RAISE EXCEPTION 'REVERSAL_PARENT_REQUIRED: A reversal entry must link to an existing parent payment (parent_payment_id).';
        END IF;

        IF NEW.notes IS NULL OR TRIM(NEW.notes) = '' THEN
            RAISE EXCEPTION 'REVERSAL_REASON_REQUIRED: A detailed audit note must be provided for all reversal entries.';
        END IF;

        -- Global booking net cash check for reversals
        SELECT COALESCE(SUM(
            CASE 
                WHEN payment_type = 'payment' THEN amount 
                WHEN payment_type = 'reversal' THEN -amount 
                WHEN payment_type = 'refund' THEN -amount 
            END
        ), 0)
        INTO v_current_net_collected
        FROM payments
        WHERE booking_id = NEW.booking_id;

        IF (v_current_net_collected - NEW.amount) < 0 THEN
            RAISE EXCEPTION 'REVERSAL_EXCEEDS_GLOBAL_CASH: Reversal of % would result in negative net cash collected (%) on booking due to previous refunds.',
                NEW.amount, (v_current_net_collected - NEW.amount);
        END IF;
    END IF;

    -- F. Specific rule for GUEST REFUNDS: reason required and global booking net cash cannot go negative
    IF NEW.payment_type = 'refund' THEN
        IF NEW.notes IS NULL OR TRIM(NEW.notes) = '' THEN
            RAISE EXCEPTION 'REFUND_REASON_REQUIRED: A valid reason must be documented for all refunds.';
        END IF;

        SELECT COALESCE(SUM(
            CASE 
                WHEN payment_type = 'payment' THEN amount 
                WHEN payment_type = 'reversal' THEN -amount 
                WHEN payment_type = 'refund' THEN -amount 
            END
        ), 0)
        INTO v_current_net_collected
        FROM payments
        WHERE booking_id = NEW.booking_id;

        IF (v_current_net_collected - NEW.amount) < 0 THEN
            RAISE EXCEPTION 'OVER_REFUND_EXCEEDED: Cannot refund %. Available collected balance across booking is %.',
                NEW.amount, v_current_net_collected;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_payment_integrity ON public.payments;
CREATE TRIGGER trg_validate_payment_integrity
BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION validate_payment_integrity();

-- 8. Enforce ledger immutability: Updates and deletes are prohibited
CREATE OR REPLACE FUNCTION prevent_payment_ledger_mutation()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'PAYMENT_LEDGER_IMMUTABLE: Posted financial transactions are append-only. Updates and deletes are prohibited. Use compensating reversal entries.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_payment_ledger_mutation ON public.payments;
CREATE TRIGGER trg_prevent_payment_ledger_mutation
BEFORE UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION prevent_payment_ledger_mutation();

-- 9. Permissions: Narrow, explicit privileges
REVOKE ALL ON public.payments FROM public;
REVOKE ALL ON public.payments FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES ON public.payments FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES ON public.payments FROM service_role;

GRANT SELECT, INSERT ON public.payments TO authenticated;
GRANT SELECT, INSERT ON public.payments TO service_role;

REVOKE ALL ON FUNCTION validate_payment_integrity() FROM public;
REVOKE ALL ON FUNCTION prevent_payment_ledger_mutation() FROM public;
GRANT EXECUTE ON FUNCTION validate_payment_integrity() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION prevent_payment_ledger_mutation() TO authenticated, service_role;
ALTER FUNCTION validate_payment_integrity() OWNER TO postgres;
ALTER FUNCTION prevent_payment_ledger_mutation() OWNER TO postgres;

-- 10. Row Level Security Policies
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolated payments select" ON public.payments;
CREATE POLICY "Tenant isolated payments select" ON public.payments
FOR SELECT TO authenticated
USING (
    public.is_super_admin() OR 
    (homestay_id = public.get_user_homestay_id() AND public.is_active_partner())
);

DROP POLICY IF EXISTS "Tenant isolated payments insert" ON public.payments;
CREATE POLICY "Tenant isolated payments insert" ON public.payments
FOR INSERT TO authenticated
WITH CHECK (
    (public.is_super_admin() OR (homestay_id = public.get_user_homestay_id() AND public.is_active_partner())) AND
    recorded_by IN (
        SELECT id FROM public.partners 
        WHERE (auth_user_id = auth.uid() OR (auth_user_id IS NULL AND email = (auth.jwt() ->> 'email')))
          AND is_active = true
    )
);

DROP POLICY IF EXISTS "Allow service_role full access to payments" ON public.payments;
CREATE POLICY "Allow service_role full access to payments" ON public.payments
FOR ALL TO service_role
USING (true) WITH CHECK (true);

COMMIT;

-- ==========================================================
-- SAFE MANUAL RECOVERY PROCEDURE (DOCUMENTATION ONLY):
-- If you need to deactivate payment triggers and RLS without data loss:
-- 1. DROP TRIGGER IF EXISTS trg_validate_payment_integrity ON payments;
-- 2. DROP TRIGGER IF EXISTS trg_prevent_payment_ledger_mutation ON payments;
-- 3. DROP FUNCTION IF EXISTS validate_payment_integrity();
-- 4. DROP FUNCTION IF EXISTS prevent_payment_ledger_mutation();
-- Note: Do NOT execute DROP TABLE payments CASCADE in a live environment,
-- as it destroys financial history and violates audit retention policies.
-- ==========================================================
