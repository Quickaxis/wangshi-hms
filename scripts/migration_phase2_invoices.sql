-- ==========================================================
-- PHASE 2: INVOICING & BILLING SYSTEM SCHEMA
-- ==========================================================
-- Safe, strictly idempotent, additive migration.
-- Does NOT drop or alter existing bookings, rooms, or homestays.
-- Scoped with strict tenant isolation via RLS policies.
-- ==========================================================

BEGIN;

-- 0. Ensure prerequisite tables exist (Guarantees safe execution on fresh database)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'homestays'
    ) THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_PREREQUISITE_MISSING: Required table "public.homestays" does not exist. Please apply the core schema before running Phase 2.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'bookings'
    ) THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_PREREQUISITE_MISSING: Required table "public.bookings" does not exist. Please apply the core schema before running Phase 2.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'rooms'
    ) THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_PREREQUISITE_MISSING: Required table "public.rooms" does not exist. Please apply the core schema before running Phase 2.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'partners'
    ) THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_PREREQUISITE_MISSING: Required table "public.partners" does not exist. Please apply the core schema before running Phase 2.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'payments'
    ) THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_PREREQUISITE_MISSING: Required table "public.payments" does not exist. Phase 1 (migration_phase1_payments.sql) must be executed before Phase 2.';
    END IF;
END $$;

-- 1. Create Invoices Table
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    homestay_id UUID NOT NULL REFERENCES public.homestays(id) ON DELETE RESTRICT,
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
    invoice_number TEXT NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid', 'partially_paid', 'unpaid', 'overpaid', 'cancelled')),
    guest_name TEXT NOT NULL,
    guest_phone TEXT,
    guest_email TEXT,
    guest_address TEXT,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    room_name TEXT,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (tax_rate >= 0),
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    grand_total NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (grand_total >= 0),
    amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
    balance_due NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    house_rules TEXT,
    created_by UUID REFERENCES public.partners(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_invoice_number_per_homestay UNIQUE (homestay_id, invoice_number),
    CONSTRAINT uq_invoices_id_homestay UNIQUE (id, homestay_id),
    CONSTRAINT uq_invoices_id_booking_homestay UNIQUE (id, booking_id, homestay_id)
);

DO $$
DECLARE
    v_has_uq_num BOOLEAN := false;
    v_has_uq_id_hs BOOLEAN := false;
    v_has_uq_id_bk_hs BOOLEAN := false;
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            c.conname,
            c.contype,
            c.convalidated,
            (
                SELECT array_agg(a.attname::text ORDER BY u.ord)
                FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
            ) AS cols
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE n.nspname = 'public'
          AND t.relname = 'invoices'
          AND c.contype = 'u'
    ) LOOP
        -- Exact check for uq_invoice_number_per_homestay
        IF r.cols = ARRAY['homestay_id', 'invoice_number']::text[] THEN
            IF r.conname = 'uq_invoice_number_per_homestay' AND r.convalidated = true THEN
                v_has_uq_num := true;
            ELSE
                EXECUTE 'ALTER TABLE public.invoices DROP CONSTRAINT ' || quote_ident(r.conname);
            END IF;
        END IF;

        -- Exact check for uq_invoices_id_homestay
        IF r.cols = ARRAY['id', 'homestay_id']::text[] THEN
            IF r.conname = 'uq_invoices_id_homestay' AND r.convalidated = true THEN
                v_has_uq_id_hs := true;
            ELSE
                EXECUTE 'ALTER TABLE public.invoices DROP CONSTRAINT ' || quote_ident(r.conname);
            END IF;
        END IF;

        -- Exact check for uq_invoices_id_booking_homestay
        IF r.cols = ARRAY['id', 'booking_id', 'homestay_id']::text[] THEN
            IF r.conname = 'uq_invoices_id_booking_homestay' AND r.convalidated = true THEN
                v_has_uq_id_bk_hs := true;
            ELSE
                EXECUTE 'ALTER TABLE public.invoices DROP CONSTRAINT ' || quote_ident(r.conname);
            END IF;
        END IF;
    END LOOP;

    IF NOT v_has_uq_num THEN
        ALTER TABLE public.invoices ADD CONSTRAINT uq_invoice_number_per_homestay UNIQUE (homestay_id, invoice_number);
    END IF;

    IF NOT v_has_uq_id_hs THEN
        ALTER TABLE public.invoices ADD CONSTRAINT uq_invoices_id_homestay UNIQUE (id, homestay_id);
    END IF;

    IF NOT v_has_uq_id_bk_hs THEN
        ALTER TABLE public.invoices ADD CONSTRAINT uq_invoices_id_booking_homestay UNIQUE (id, booking_id, homestay_id);
    END IF;
END $$;

-- 2. Create Invoice Line Items Table
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL,
    homestay_id UUID NOT NULL REFERENCES public.homestays(id) ON DELETE RESTRICT,
    category TEXT NOT NULL DEFAULT 'room' CHECK (category IN ('room', 'food_beverage', 'laundry', 'extra_bed', 'additional_nights', 'custom', 'discount')),
    description TEXT NOT NULL,
    stay_period TEXT,
    quantity NUMERIC(8,2) NOT NULL DEFAULT 1.00 CHECK (quantity > 0),
    rate NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_invoice_items_tenant FOREIGN KEY (invoice_id, homestay_id) 
        REFERENCES public.invoices(id, homestay_id) ON DELETE CASCADE
);

DO $$
DECLARE
    r RECORD;
    v_has_composite_fk BOOLEAN := false;
BEGIN
    -- Inspect all foreign key constraints on invoice_items
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
          AND t.relname = 'invoice_items'
          AND c.contype = 'f'
        GROUP BY c.oid, c.conname, c.confdeltype, fn.nspname, ft.relname, c.conrelid, c.confrelid, c.conkey, c.confkey
    ) LOOP
        -- Canonical composite FK: (invoice_id, homestay_id) -> invoices(id, homestay_id) ON DELETE CASCADE
        IF r.source_cols = ARRAY['invoice_id', 'homestay_id']::text[] THEN
            IF r.conname = 'fk_invoice_items_tenant'
               AND r.confdeltype = 'c'
               AND r.target_schema = 'public'
               AND r.target_table = 'invoices'
               AND r.target_cols = ARRAY['id', 'homestay_id']::text[] THEN
                v_has_composite_fk := true;
            ELSE
                EXECUTE 'ALTER TABLE public.invoice_items DROP CONSTRAINT ' || quote_ident(r.conname);
            END IF;
        -- Remove ANY single-column invoice_id FK or overlapping/misordered multi-column FK involving invoice_id
        ELSIF 'invoice_id' = ANY(r.source_cols) THEN
            EXECUTE 'ALTER TABLE public.invoice_items DROP CONSTRAINT ' || quote_ident(r.conname);
        END IF;
    END LOOP;

    IF NOT v_has_composite_fk THEN
        ALTER TABLE public.invoice_items ADD CONSTRAINT fk_invoice_items_tenant 
            FOREIGN KEY (invoice_id, homestay_id) REFERENCES public.invoices(id, homestay_id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Linkage between payments and invoices with strict deletion protection & ownership consistency
DO $$
DECLARE
    r RECORD;
    v_canonical_exists BOOLEAN := false;
    v_composite_exists BOOLEAN := false;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'payments'
    ) THEN
        -- Add column invoice_id if not present
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'invoice_id'
        ) THEN
            ALTER TABLE public.payments ADD COLUMN invoice_id UUID;
        END IF;

        -- Add column idempotency_key if not present
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'idempotency_key'
        ) THEN
            ALTER TABLE public.payments ADD COLUMN idempotency_key TEXT;
        END IF;

        -- Iterate over ALL foreign key constraints on public.payments involving invoice_id.
        -- Deterministically drop any constraint that does not strictly match canonical definitions:
        -- 1. Canonical Single-Column: fk_payments_invoice_restrict on ARRAY['invoice_id'] -> public.invoices(ARRAY['id']) ON DELETE RESTRICT
        -- 2. Canonical Composite: fk_payments_invoice_booking_homestay on ARRAY['invoice_id', 'booking_id', 'homestay_id'] -> public.invoices(ARRAY['id', 'booking_id', 'homestay_id']) ON DELETE RESTRICT
        -- Any legacy-named, misconfigured, or duplicate constraints involving invoice_id are safely dropped.
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
            -- Check Canonical Single-Column FK
            IF r.source_cols = ARRAY['invoice_id']::text[] THEN
                IF r.conname = 'fk_payments_invoice_restrict'
                   AND r.confdeltype = 'r'
                   AND r.target_schema = 'public'
                   AND r.target_table = 'invoices'
                   AND r.target_cols = ARRAY['id']::text[] THEN
                    v_canonical_exists := true;
                ELSE
                    EXECUTE 'ALTER TABLE public.payments DROP CONSTRAINT ' || quote_ident(r.conname);
                END IF;
            END IF;

            -- Check Canonical Composite FK
            IF r.source_cols = ARRAY['invoice_id', 'booking_id', 'homestay_id']::text[] THEN
                IF r.conname = 'fk_payments_invoice_booking_homestay'
                   AND r.confdeltype = 'r'
                   AND r.target_schema = 'public'
                   AND r.target_table = 'invoices'
                   AND r.target_cols = ARRAY['id', 'booking_id', 'homestay_id']::text[] THEN
                    v_composite_exists := true;
                ELSE
                    EXECUTE 'ALTER TABLE public.payments DROP CONSTRAINT ' || quote_ident(r.conname);
                END IF;
            ELSIF 'invoice_id' = ANY(r.source_cols) AND r.source_cols <> ARRAY['invoice_id']::text[] THEN
                -- Any other multi-column constraint involving invoice_id with different ordering or columns is dropped
                EXECUTE 'ALTER TABLE public.payments DROP CONSTRAINT ' || quote_ident(r.conname);
            END IF;
        END LOOP;

        -- Create canonical single-column foreign key if not present
        IF NOT v_canonical_exists THEN
            ALTER TABLE public.payments ADD CONSTRAINT fk_payments_invoice_restrict 
                FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE RESTRICT;
        END IF;

        -- Create canonical composite foreign key if not present
        IF NOT v_composite_exists THEN
            ALTER TABLE public.payments ADD CONSTRAINT fk_payments_invoice_booking_homestay 
                FOREIGN KEY (invoice_id, booking_id, homestay_id) 
                REFERENCES public.invoices(id, booking_id, homestay_id) ON DELETE RESTRICT;
        END IF;

        -- Create partial indexes defensively only when payments table exists
        CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id) WHERE invoice_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_payments_invoice_composite ON public.payments(invoice_id, booking_id, homestay_id) WHERE invoice_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_homestay_idempotency_key ON public.payments(homestay_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
    END IF;
END $$;

-- 4. Indexes for high performance
CREATE INDEX IF NOT EXISTS idx_invoices_homestay_id ON public.invoices(homestay_id);
CREATE INDEX IF NOT EXISTS idx_invoices_booking_id ON public.invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_homestay_id ON public.invoice_items(homestay_id);

-- 5. Helper Functions & Triggers: Financial Integrity, Deletion Protection & Immutability
CREATE OR REPLACE FUNCTION public.invoice_has_payments(p_invoice_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_invoice_homestay_id UUID;
BEGIN
    IF p_invoice_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Strict tenant isolation for authenticated users (defense against RPC probing)
    -- super_admin and service_role (auth.uid() IS NULL) bypass this check.
    IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
        SELECT homestay_id INTO v_invoice_homestay_id
        FROM public.invoices
        WHERE id = p_invoice_id;

        IF v_invoice_homestay_id IS NULL OR v_invoice_homestay_id IS DISTINCT FROM public.get_user_homestay_id() THEN
            RAISE EXCEPTION 'ACCESS_DENIED: Invoice not found or access denied.' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'payments'
    ) THEN
        RETURN EXISTS (
            SELECT 1 FROM public.payments 
            WHERE invoice_id = p_invoice_id
        );
    END IF;
    RETURN FALSE;
END;
$$;

-- Prevent deletion of invoices that have recorded payment ledger transactions
CREATE OR REPLACE FUNCTION public.prevent_invoice_deletion_with_payments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF public.invoice_has_payments(OLD.id) THEN
        RAISE EXCEPTION 'INVOICE_HAS_PAYMENTS: Cannot delete invoice (%) because it has linked payment transactions. To preserve financial audit history and ledger associations, cancel the invoice instead of deleting it.', OLD.id;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_invoice_deletion_with_payments ON public.invoices;
CREATE TRIGGER trg_prevent_invoice_deletion_with_payments
BEFORE DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.prevent_invoice_deletion_with_payments();

-- Prevent reparenting / relationship mutation on invoices (homestay_id and booking_id are immutable)
CREATE OR REPLACE FUNCTION public.prevent_invoice_relationship_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.homestay_id <> OLD.homestay_id THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE_RELATION: Cannot modify homestay_id on an existing invoice (%).', OLD.id;
    END IF;
    IF NEW.booking_id <> OLD.booking_id THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE_RELATION: Cannot modify booking_id on an existing invoice (%).', OLD.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_invoice_relationship_mutation ON public.invoices;
CREATE TRIGGER trg_prevent_invoice_relationship_mutation
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.prevent_invoice_relationship_mutation();

-- Atomic integrity trigger on payments: Enhanced with Payment-to-Invoice Consistency & Inheritance
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
    v_invoice_booking_id UUID;
    v_invoice_homestay_id UUID;
    v_invoice_grand_total NUMERIC(12,2);
    v_invoice_status TEXT;
    v_current_invoice_paid NUMERIC(12,2);
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

    -- D. Original payment entries cannot link to a parent payment
    IF NEW.payment_type = 'payment' AND NEW.parent_payment_id IS NOT NULL THEN
        RAISE EXCEPTION 'PAYMENT_CANNOT_HAVE_PARENT: An original payment entry cannot reference a parent_payment_id.';
    END IF;

    -- E. Payment-to-Invoice Consistency & Overpayment Protection (Mandatory for non-null invoice_id)
    -- Deterministic lock ordering: Bookings row was locked FOR UPDATE above; now lock Invoice FOR UPDATE.
    -- Strict deterministic ordering (bookings -> invoices) guarantees deadlock immunity.
    IF NEW.invoice_id IS NOT NULL THEN
        SELECT booking_id, homestay_id, grand_total, status 
        INTO v_invoice_booking_id, v_invoice_homestay_id, v_invoice_grand_total, v_invoice_status
        FROM public.invoices 
        WHERE id = NEW.invoice_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PAYMENT_INVALID_INVOICE: Referenced invoice (%) does not exist.', NEW.invoice_id;
        END IF;

        IF v_invoice_booking_id <> NEW.booking_id THEN
            RAISE EXCEPTION 'PAYMENT_INVOICE_BOOKING_MISMATCH: Invoice booking_id (%) does not match payment booking_id (%). Cross-booking association prohibited.',
                v_invoice_booking_id, NEW.booking_id;
        END IF;

        IF v_invoice_homestay_id <> NEW.homestay_id THEN
            RAISE EXCEPTION 'PAYMENT_INVOICE_TENANT_MISMATCH: Invoice homestay_id (%) does not match payment homestay_id (%). Cross-tenant association prohibited.',
                v_invoice_homestay_id, NEW.homestay_id;
        END IF;

        IF v_invoice_status = 'cancelled' THEN
            RAISE EXCEPTION 'PAYMENT_INVOICE_CANCELLED: Cannot record payment against a cancelled invoice (%).', NEW.invoice_id;
        END IF;

        -- Invoice-level overpayment protection for positive payments
        IF NEW.payment_type = 'payment' THEN
            SELECT COALESCE(SUM(
                CASE 
                    WHEN payment_type = 'payment' THEN amount 
                    WHEN payment_type = 'reversal' THEN -amount 
                    WHEN payment_type = 'refund' THEN -amount 
                END
            ), 0.00)
            INTO v_current_invoice_paid
            FROM payments
            WHERE invoice_id = NEW.invoice_id;

            IF (v_current_invoice_paid + NEW.amount) > v_invoice_grand_total THEN
                RAISE EXCEPTION 'INVOICE_OVERPAYMENT_EXCEEDED: Payment of % exceeds remaining invoice balance (%). Grand Total: %, Already Paid: %.',
                    NEW.amount, (v_invoice_grand_total - v_current_invoice_paid), v_invoice_grand_total, v_current_invoice_paid;
            END IF;
        END IF;
    END IF;

    -- F. Validation for transactions linked to a parent payment (mandatory for reversals, optional for refunds)
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

        -- Preserve and strictly enforce invoice association from parent payment
        IF v_parent_payment.invoice_id IS NOT NULL THEN
            IF NEW.invoice_id IS NULL THEN
                NEW.invoice_id := v_parent_payment.invoice_id;
            ELSIF NEW.invoice_id <> v_parent_payment.invoice_id THEN
                RAISE EXCEPTION 'PAYMENT_PARENT_INVOICE_MISMATCH: Linked % invoice_id (%) must match parent payment invoice_id (%).',
                    NEW.payment_type, NEW.invoice_id, v_parent_payment.invoice_id;
            END IF;
        ELSIF NEW.invoice_id IS NOT NULL THEN
            RAISE EXCEPTION 'PAYMENT_PARENT_INVOICE_MISMATCH: Cannot assign invoice_id (%) to a % of an unattributed payment.',
                NEW.invoice_id, NEW.payment_type;
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

    -- G. Specific rule for REVERSALS: must have a parent payment and audit note
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

    -- H. Specific rule for GUEST REFUNDS: reason required and global booking net cash cannot go negative
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

-- 6. Trigger: Automatically synchronize invoice financial summary whenever a payment, refund, or reversal is recorded
CREATE OR REPLACE FUNCTION public.sync_invoice_from_payments()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inv_id UUID;
    v_grand_total NUMERIC(12,2);
    v_curr_status TEXT;
    v_net_paid NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_new_status TEXT;
BEGIN
    v_inv_id := NEW.invoice_id;
    IF v_inv_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Lock invoice row to update summary
    SELECT grand_total, status INTO v_grand_total, v_curr_status
    FROM public.invoices
    WHERE id = v_inv_id
    FOR UPDATE;

    IF NOT FOUND OR v_curr_status = 'cancelled' THEN
        RETURN NEW;
    END IF;

    -- Authoritative calculation directly from immutable payments ledger
    SELECT COALESCE(SUM(
        CASE 
            WHEN payment_type = 'payment' THEN amount 
            WHEN payment_type = 'reversal' THEN -amount 
            WHEN payment_type = 'refund' THEN -amount 
        END
    ), 0.00)
    INTO v_net_paid
    FROM public.payments
    WHERE invoice_id = v_inv_id;

    IF v_net_paid < 0.00 THEN
        v_net_paid := 0.00;
    END IF;

    v_new_balance := v_grand_total - v_net_paid;

    IF v_new_balance <= 0.00 THEN
        v_new_status := 'paid';
    ELSIF v_net_paid > 0.00 THEN
        v_new_status := 'partially_paid';
    ELSE
        IF v_curr_status IN ('draft', 'issued') THEN
            v_new_status := v_curr_status;
        ELSE
            v_new_status := 'unpaid';
        END IF;
    END IF;

    UPDATE public.invoices SET
        amount_paid = v_net_paid,
        balance_due = v_new_balance,
        status = v_new_status,
        updated_at = NOW()
    WHERE id = v_inv_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_invoice_from_payments ON public.payments;
CREATE TRIGGER trg_sync_invoice_from_payments
AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_from_payments();

-- 7. Atomic Invoice Payment RPC:
-- Locks invoice and booking rows, validates outstanding balance, checks idempotency,
-- records payment in ledger, and updates invoice header atomically within a single database transaction.
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
    p_invoice_id UUID,
    p_amount NUMERIC(12,2),
    p_payment_method TEXT DEFAULT 'cash',
    p_transaction_ref TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_invoice RECORD;
    v_booking_homestay_id UUID;
    v_recorder_id UUID;
    v_recorder_homestay_id UUID;
    v_recorder_role TEXT;
    v_current_paid NUMERIC(12,2) := 0.00;
    v_outstanding_balance NUMERIC(12,2) := 0.00;
    v_payment_id UUID;
    v_existing_payment RECORD;
    v_clean_idempotency_key TEXT;
    v_updated_invoice RECORD;
BEGIN
    -- 1. Validate positive payment amount
    IF p_amount IS NULL OR p_amount <= 0.00 THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT: Payment amount (%) must be greater than zero.', p_amount;
    END IF;

    v_clean_idempotency_key := NULLIF(TRIM(p_idempotency_key), '');

    -- 2. Authenticate caller and validate active partner status
    IF auth.uid() IS NOT NULL THEN
        SELECT id, homestay_id, role INTO v_recorder_id, v_recorder_homestay_id, v_recorder_role
        FROM public.partners
        WHERE (auth_user_id = auth.uid() OR (auth_user_id IS NULL AND email = (auth.jwt() ->> 'email')))
          AND is_active = true
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ACCESS_DENIED: User is not authorized as an active partner.' USING ERRCODE = '42501';
        END IF;

        -- Fetch invoice and verify tenant authorization under authenticated context
        SELECT id, booking_id, homestay_id, status, grand_total, amount_paid, balance_due
        INTO v_invoice
        FROM public.invoices
        WHERE id = p_invoice_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ACCESS_DENIED: Invoice not found or access denied.' USING ERRCODE = '42501';
        END IF;

        IF COALESCE(v_recorder_role, 'partner') <> 'super_admin' AND v_recorder_homestay_id <> v_invoice.homestay_id THEN
            RAISE EXCEPTION 'ACCESS_DENIED: Invoice not found or access denied.' USING ERRCODE = '42501';
        END IF;
    ELSE
        -- Fallback for service_role or internal system calls
        SELECT id, booking_id, homestay_id, status, grand_total, amount_paid, balance_due
        INTO v_invoice
        FROM public.invoices
        WHERE id = p_invoice_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'INVOICE_NOT_FOUND: Invoice (%) does not exist.', p_invoice_id;
        END IF;

        SELECT id INTO v_recorder_id
        FROM public.partners
        WHERE homestay_id = v_invoice.homestay_id AND is_active = true
        ORDER BY (role = 'super_admin') DESC, id ASC
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ACCESS_DENIED: No active partner found for homestay (%).', v_invoice.homestay_id USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 3. Idempotency Check: prevent duplicate payments
    -- Executed ONLY AFTER caller authentication and tenant authorization have succeeded.
    -- Unauthorized callers cannot observe whether an idempotency key exists or retrieve payment IDs/totals.
    IF v_clean_idempotency_key IS NOT NULL THEN
        SELECT id, invoice_id, amount, payment_method, transaction_ref, created_at
        INTO v_existing_payment
        FROM public.payments
        WHERE homestay_id = v_invoice.homestay_id
          AND idempotency_key = v_clean_idempotency_key;

        IF FOUND THEN
            IF v_existing_payment.invoice_id IS DISTINCT FROM p_invoice_id THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency key "%" was already used for a different invoice (%).',
                    v_clean_idempotency_key, v_existing_payment.invoice_id;
            END IF;

            IF v_existing_payment.amount IS DISTINCT FROM p_amount THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency key "%" was already used with a different amount (% vs %).',
                    v_clean_idempotency_key, v_existing_payment.amount, p_amount;
            END IF;

            IF v_existing_payment.payment_method IS DISTINCT FROM COALESCE(p_payment_method, 'cash') THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency key "%" was already used with a different payment method ("%" vs "%").',
                    v_clean_idempotency_key, v_existing_payment.payment_method, COALESCE(p_payment_method, 'cash');
            END IF;

            IF v_existing_payment.transaction_ref IS DISTINCT FROM p_transaction_ref THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency key "%" was already used with a different transaction reference ("%" vs "%").',
                    v_clean_idempotency_key, v_existing_payment.transaction_ref, p_transaction_ref;
            END IF;

            -- Return existing payment details without creating a duplicate
            RETURN jsonb_build_object(
                'success', true,
                'payment_id', v_existing_payment.id,
                'invoice_id', p_invoice_id,
                'amount_paid', v_invoice.amount_paid,
                'balance_due', v_invoice.balance_due,
                'status', v_invoice.status,
                'is_duplicate', true
            );
        END IF;
    END IF;

    -- 4. Deterministic Row Locking: Always lock booking FOR UPDATE first, then invoice FOR UPDATE
    -- This coordinates with validate_payment_integrity trigger to guarantee zero deadlocks
    PERFORM 1 FROM public.bookings WHERE id = v_invoice.booking_id FOR UPDATE;

    SELECT id, booking_id, homestay_id, status, grand_total, amount_paid, balance_due
    INTO v_invoice
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    -- 4b. Post-Lock Idempotency Re-check:
    -- If a concurrent request with the same idempotency key was serialized on the locks above,
    -- it will have committed by the time this caller acquires the locks.
    -- Re-checking here ensures this concurrent request immediately detects the committed payment,
    -- validates that parameters match, and returns the existing payment ID with zero ledger duplication.
    IF v_clean_idempotency_key IS NOT NULL THEN
        SELECT id, invoice_id, amount, payment_method, transaction_ref, created_at
        INTO v_existing_payment
        FROM public.payments
        WHERE homestay_id = v_invoice.homestay_id
          AND idempotency_key = v_clean_idempotency_key;

        IF FOUND THEN
            IF v_existing_payment.invoice_id IS DISTINCT FROM p_invoice_id THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency key "%" was already used for a different invoice (%).',
                    v_clean_idempotency_key, v_existing_payment.invoice_id;
            END IF;

            IF v_existing_payment.amount IS DISTINCT FROM p_amount THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency key "%" was already used with a different amount (% vs %).',
                    v_clean_idempotency_key, v_existing_payment.amount, p_amount;
            END IF;

            IF v_existing_payment.payment_method IS DISTINCT FROM COALESCE(p_payment_method, 'cash') THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency key "%" was already used with a different payment method ("%" vs "%").',
                    v_clean_idempotency_key, v_existing_payment.payment_method, COALESCE(p_payment_method, 'cash');
            END IF;

            IF v_existing_payment.transaction_ref IS DISTINCT FROM p_transaction_ref THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency key "%" was already used with a different transaction reference ("%" vs "%").',
                    v_clean_idempotency_key, v_existing_payment.transaction_ref, p_transaction_ref;
            END IF;

            -- Return existing payment details without creating a duplicate
            RETURN jsonb_build_object(
                'success', true,
                'payment_id', v_existing_payment.id,
                'invoice_id', p_invoice_id,
                'amount_paid', v_invoice.amount_paid,
                'balance_due', v_invoice.balance_due,
                'status', v_invoice.status,
                'is_duplicate', true
            );
        END IF;
    END IF;

    -- 5. Reject cancelled invoices
    IF v_invoice.status = 'cancelled' THEN
        RAISE EXCEPTION 'INVOICE_CANCELLED: Cannot record payment against a cancelled invoice (%).', p_invoice_id;
    END IF;

    -- 6. Calculate authoritative outstanding balance from payments ledger
    SELECT COALESCE(SUM(
        CASE 
            WHEN payment_type = 'payment' THEN amount 
            WHEN payment_type = 'reversal' THEN -amount 
            WHEN payment_type = 'refund' THEN -amount 
        END
    ), 0.00)
    INTO v_current_paid
    FROM public.payments
    WHERE invoice_id = p_invoice_id;

    v_outstanding_balance := v_invoice.grand_total - v_current_paid;

    -- 7. Reject overpayment
    IF p_amount > v_outstanding_balance THEN
        RAISE EXCEPTION 'INVOICE_OVERPAYMENT_EXCEEDED: Payment amount (%) exceeds outstanding invoice balance (%). Grand Total: %, Already Paid: %.',
            p_amount, v_outstanding_balance, v_invoice.grand_total, v_current_paid;
    END IF;

    -- 8. Insert payment ledger entry
    -- trg_validate_payment_integrity runs BEFORE INSERT (re-verifying integrity with lock already held).
    -- trg_sync_invoice_from_payments runs AFTER INSERT (recalculating and updating invoice row).
    BEGIN
        INSERT INTO public.payments (
            homestay_id,
            booking_id,
            invoice_id,
            amount,
            payment_type,
            payment_method,
            transaction_ref,
            notes,
            recorded_by,
            idempotency_key
        ) VALUES (
            v_invoice.homestay_id,
            v_invoice.booking_id,
            p_invoice_id,
            p_amount,
            'payment',
            COALESCE(p_payment_method, 'cash'),
            p_transaction_ref,
            p_notes,
            v_recorder_id,
            v_clean_idempotency_key
        ) RETURNING id INTO v_payment_id;
    EXCEPTION WHEN unique_violation THEN
        -- Defense-in-depth: If unique constraint uq_payments_homestay_idempotency_key is triggered
        IF v_clean_idempotency_key IS NOT NULL THEN
            SELECT id, invoice_id, amount, payment_method, transaction_ref, created_at
            INTO v_existing_payment
            FROM public.payments
            WHERE homestay_id = v_invoice.homestay_id
              AND idempotency_key = v_clean_idempotency_key;

            IF FOUND THEN
                IF v_existing_payment.invoice_id IS DISTINCT FROM p_invoice_id THEN
                    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency key "%" was already used for a different invoice (%).',
                        v_clean_idempotency_key, v_existing_payment.invoice_id;
                END IF;

                IF v_existing_payment.amount IS DISTINCT FROM p_amount THEN
                    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency key "%" was already used with a different amount (% vs %).',
                        v_clean_idempotency_key, v_existing_payment.amount, p_amount;
                END IF;

                IF v_existing_payment.payment_method IS DISTINCT FROM COALESCE(p_payment_method, 'cash') THEN
                    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency key "%" was already used with a different payment method ("%" vs "%").',
                        v_clean_idempotency_key, v_existing_payment.payment_method, COALESCE(p_payment_method, 'cash');
                END IF;

                IF v_existing_payment.transaction_ref IS DISTINCT FROM p_transaction_ref THEN
                    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency key "%" was already used with a different transaction reference ("%" vs "%").',
                        v_clean_idempotency_key, v_existing_payment.transaction_ref, p_transaction_ref;
                END IF;

                SELECT amount_paid, balance_due, status
                INTO v_updated_invoice
                FROM public.invoices
                WHERE id = p_invoice_id;

                RETURN jsonb_build_object(
                    'success', true,
                    'payment_id', v_existing_payment.id,
                    'invoice_id', p_invoice_id,
                    'amount_paid', v_updated_invoice.amount_paid,
                    'balance_due', v_updated_invoice.balance_due,
                    'status', v_updated_invoice.status,
                    'is_duplicate', true
                );
            END IF;
        END IF;
        RAISE;
    END;

    -- 9. Fetch updated invoice summary produced by the transaction trigger
    SELECT amount_paid, balance_due, status
    INTO v_updated_invoice
    FROM public.invoices
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'invoice_id', p_invoice_id,
        'amount_paid', v_updated_invoice.amount_paid,
        'balance_due', v_updated_invoice.balance_due,
        'status', v_updated_invoice.status,
        'is_duplicate', false
    );
END;
$$;

-- 8. Authoritative Invoice Reconciliation RPC:
-- Recalculates invoice summary (amount_paid, balance_due, status) directly from immutable
-- payments ledger using deterministic row locking (bookings -> invoices).
-- Preserves trg_sync_invoice_from_payments as the primary payment-time synchronization.
CREATE OR REPLACE FUNCTION public.reconcile_invoice_summary(
    p_invoice_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_invoice RECORD;
    v_partner_role TEXT;
    v_partner_homestay_id UUID;
    v_net_paid NUMERIC(12,2) := 0.00;
    v_new_balance NUMERIC(12,2) := 0.00;
    v_new_status TEXT;
BEGIN
    -- 1. Authenticate caller and validate tenant authorization
    IF auth.uid() IS NOT NULL THEN
        SELECT homestay_id, role INTO v_partner_homestay_id, v_partner_role
        FROM public.partners
        WHERE (auth_user_id = auth.uid() OR (auth_user_id IS NULL AND email = (auth.jwt() ->> 'email')))
          AND is_active = true
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ACCESS_DENIED: User is not authorized as an active partner.' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 2. Fetch invoice metadata
    SELECT id, booking_id, homestay_id, grand_total, status, amount_paid, balance_due
    INTO v_invoice
    FROM public.invoices
    WHERE id = p_invoice_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Invoice not found or access denied.' USING ERRCODE = '42501';
    END IF;

    IF auth.uid() IS NOT NULL THEN
        IF COALESCE(v_partner_role, 'partner') <> 'super_admin' AND v_partner_homestay_id <> v_invoice.homestay_id THEN
            RAISE EXCEPTION 'ACCESS_DENIED: Invoice not found or access denied.' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 3. Deterministic Lock Ordering: lock booking FOR UPDATE, then invoice FOR UPDATE
    PERFORM 1 FROM public.bookings WHERE id = v_invoice.booking_id FOR UPDATE;

    SELECT id, booking_id, homestay_id, grand_total, status, amount_paid, balance_due
    INTO v_invoice
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    -- 4. Cancelled invoices preserve cancelled status and zero balance due
    IF v_invoice.status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'success', true,
            'invoice_id', p_invoice_id,
            'amount_paid', v_invoice.amount_paid,
            'balance_due', v_invoice.balance_due,
            'status', v_invoice.status,
            'reconciled', false,
            'message', 'Invoice is cancelled. Status and balance are locked.'
        );
    END IF;

    -- 5. Calculate net paid directly from immutable payments ledger
    SELECT COALESCE(SUM(
        CASE 
            WHEN payment_type = 'payment' THEN amount 
            WHEN payment_type = 'reversal' THEN -amount 
            WHEN payment_type = 'refund' THEN -amount 
        END
    ), 0.00)
    INTO v_net_paid
    FROM public.payments
    WHERE invoice_id = p_invoice_id;

    IF v_net_paid < 0.00 THEN
        v_net_paid := 0.00;
    END IF;

    v_new_balance := v_invoice.grand_total - v_net_paid;

    IF v_new_balance <= 0.00 THEN
        v_new_status := 'paid';
    ELSIF v_net_paid > 0.00 THEN
        v_new_status := 'partially_paid';
    ELSE
        IF v_invoice.status IN ('draft', 'issued') THEN
            v_new_status := v_invoice.status;
        ELSE
            v_new_status := 'unpaid';
        END IF;
    END IF;

    -- 6. Atomically update invoice header
    UPDATE public.invoices SET
        amount_paid = v_net_paid,
        balance_due = v_new_balance,
        status = v_new_status,
        updated_at = NOW()
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', p_invoice_id,
        'amount_paid', v_net_paid,
        'balance_due', v_new_balance,
        'status', v_new_status,
        'reconciled', true
    );
END;
$$;

-- Atomic invoice creation RPC: Inserts invoice header and line items within a single database transaction.
-- A failure in any line-item automatically aborts and rolls back the entire invoice.
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
    -- Returns identical ACCESS_DENIED error for non-existent and cross-tenant bookings to prevent information leakage
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

    -- Clarified discount accounting: invoices.discount_amount stores the TOTAL discount on the folio
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

    -- 4. Strict paise-level comparison (zero tolerance) against calculated values
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

    -- 6. Atomically insert invoice header using verified financial totals
    -- discount_amount stores the total discount for mathematical reconciliation (subtotal - discount_amount + tax_amount = grand_total)
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

    -- 7. Atomically insert line items (PostgreSQL automatically rolls back the entire invoice if any item insert fails)
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

-- Drop legacy scalar signature of update_invoice_with_items if present
DROP FUNCTION IF EXISTS public.update_invoice_with_items(UUID, TEXT, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, DATE, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT);

-- Atomic invoice update RPC: Updates invoice header via presence-aware JSON patch and replaces line items.
-- Locks the invoice row with FOR UPDATE, validates totals inside PostgreSQL, enforces tenant isolation,
-- implements robust presence-aware partial updates (differentiating omitted vs null vs empty vs literal '__UNCHANGED__'),
-- and rejects modifications if the invoice already has recorded payments.
CREATE OR REPLACE FUNCTION public.update_invoice_with_items(
    p_invoice_id UUID,
    p_patch JSONB DEFAULT '{}'::jsonb,
    p_items JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_invoice public.invoices%ROWTYPE;
    v_item RECORD;
    v_item_expected_amount NUMERIC(12,2);
    v_calc_subtotal NUMERIC(12,2) := 0.00;
    v_calc_item_discount NUMERIC(12,2) := 0.00;
    v_calc_total_discount NUMERIC(12,2) := 0.00;
    v_calc_net_before_tax NUMERIC(12,2) := 0.00;
    v_calc_tax_amount NUMERIC(12,2) := 0.00;
    v_calc_grand_total NUMERIC(12,2) := 0.00;
    v_flat_discount NUMERIC(12,2) := 0.00;
    v_existing_item_discount NUMERIC(12,2) := 0.00;
    v_applied_tax_rate NUMERIC(5,2);
    v_target_patch JSONB;
BEGIN
    -- 1. Validate JSON payloads explicitly
    IF p_patch IS NOT NULL AND jsonb_typeof(p_patch) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_PATCH_PAYLOAD: Invoice patch must be a JSON object, but received %.', jsonb_typeof(p_patch);
    END IF;

    IF p_items IS NOT NULL AND jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'INVALID_ITEMS_PAYLOAD: Line items payload must be a JSON array or NULL, but received %.', jsonb_typeof(p_items);
    END IF;

    v_target_patch := COALESCE(p_patch, '{}'::jsonb);

    -- 2. Lock invoice row and verify existence + tenant authorization
    SELECT * INTO v_invoice
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF NOT FOUND OR (auth.uid() IS NOT NULL AND NOT public.is_super_admin() AND (
        v_invoice.homestay_id IS DISTINCT FROM public.get_user_homestay_id() OR NOT public.is_active_partner()
    )) THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Invoice not found or access denied.' USING ERRCODE = '42501';
    END IF;

    -- 3. State guards: Cancelled invoices cannot be modified
    IF v_invoice.status = 'cancelled' THEN
        RAISE EXCEPTION 'INVOICE_CANCELLED: Cannot update a cancelled invoice (%).', p_invoice_id;
    END IF;

    -- 4. Recorded payments guard: Invoices with recorded payments cannot have items or totals mutated
    IF public.invoice_has_payments(p_invoice_id) THEN
        RAISE EXCEPTION 'INVOICE_HAS_PAYMENTS_IMMUTABLE: Cannot modify line items or totals for invoice (%) with recorded payments. Financial records must remain immutable; cancel the invoice or issue an adjustment invoice instead.', p_invoice_id;
    END IF;

    -- 5. Calculate authoritative financial totals inside PostgreSQL
    -- Resolve existing item discount if items are NOT being updated
    SELECT COALESCE(SUM(amount), 0.00) INTO v_existing_item_discount
    FROM public.invoice_items
    WHERE invoice_id = p_invoice_id AND category = 'discount';

    -- Resolve flat discount: if 'discount_amount' (or 'flat_discount') is present in patch, use it;
    -- otherwise derive existing flat discount: (existing total discount - existing item discount)
    IF v_target_patch ? 'flat_discount' THEN
        v_flat_discount := COALESCE((v_target_patch->>'flat_discount')::numeric, 0.00);
    ELSIF v_target_patch ? 'discount_amount' THEN
        v_flat_discount := COALESCE((v_target_patch->>'discount_amount')::numeric, 0.00);
    ELSE
        v_flat_discount := GREATEST(0.00, v_invoice.discount_amount - v_existing_item_discount);
    END IF;

    IF v_flat_discount < 0 THEN
        RAISE EXCEPTION 'INVALID_DISCOUNT: Flat discount amount (%) cannot be negative.', v_flat_discount;
    END IF;

    v_applied_tax_rate := CASE 
        WHEN v_target_patch ? 'tax_rate' THEN COALESCE((v_target_patch->>'tax_rate')::numeric, 0.00)
        ELSE v_invoice.tax_rate
    END;

    IF v_applied_tax_rate < 0 THEN
        RAISE EXCEPTION 'INVALID_TAX_RATE: Tax rate (%) cannot be negative.', v_applied_tax_rate;
    END IF;

    IF p_items IS NOT NULL THEN
        -- Items provided: validate line items and calculate new totals
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
    ELSE
        -- Items omitted (NULL): preserve existing line items and derive subtotal and item discount from invoice_items
        SELECT 
            COALESCE(SUM(CASE WHEN category <> 'discount' THEN amount ELSE 0.00 END), 0.00),
            COALESCE(SUM(CASE WHEN category = 'discount' THEN amount ELSE 0.00 END), 0.00)
        INTO v_calc_subtotal, v_calc_item_discount
        FROM public.invoice_items
        WHERE invoice_id = p_invoice_id;
    END IF;

    v_calc_total_discount := v_calc_item_discount + v_flat_discount;
    IF v_calc_total_discount > v_calc_subtotal THEN
        RAISE EXCEPTION 'DISCOUNT_EXCEEDS_SUBTOTAL: Total discount (%) cannot exceed line item subtotal (%).', v_calc_total_discount, v_calc_subtotal;
    END IF;

    v_calc_net_before_tax := v_calc_subtotal - v_calc_total_discount;
    v_calc_tax_amount := ROUND(v_calc_net_before_tax * (v_applied_tax_rate / 100.0), 2);
    v_calc_grand_total := v_calc_net_before_tax + v_calc_tax_amount;

    -- Strict paise-level comparison (zero tolerance) against calculated values
    IF v_target_patch ? 'subtotal' AND (v_target_patch->>'subtotal')::numeric <> v_calc_subtotal THEN
        RAISE EXCEPTION 'INVOICE_TOTAL_MISMATCH: Provided subtotal (%) does not match calculated line item subtotal (%).', (v_target_patch->>'subtotal')::numeric, v_calc_subtotal;
    END IF;
    IF v_target_patch ? 'tax_amount' AND (v_target_patch->>'tax_amount')::numeric <> v_calc_tax_amount THEN
        RAISE EXCEPTION 'INVOICE_TOTAL_MISMATCH: Provided tax amount (%) does not match calculated tax amount (%).', (v_target_patch->>'tax_amount')::numeric, v_calc_tax_amount;
    END IF;
    IF v_target_patch ? 'grand_total' AND (v_target_patch->>'grand_total')::numeric <> v_calc_grand_total THEN
        RAISE EXCEPTION 'INVOICE_TOTAL_MISMATCH: Provided grand total (%) does not match calculated grand total (%).', (v_target_patch->>'grand_total')::numeric, v_calc_grand_total;
    END IF;

    -- Validate required header fields if present in patch
    IF v_target_patch ? 'invoice_number' AND TRIM(COALESCE(v_target_patch->>'invoice_number', '')) = '' THEN
        RAISE EXCEPTION 'INVALID_INVOICE_NUMBER: Invoice number cannot be empty.';
    END IF;

    IF v_target_patch ? 'guest_name' AND TRIM(COALESCE(v_target_patch->>'guest_name', '')) = '' THEN
        RAISE EXCEPTION 'INVALID_GUEST_NAME: Guest name cannot be empty.';
    END IF;

    IF v_target_patch ? 'check_in' AND (v_target_patch->>'check_in') IS NULL THEN
        RAISE EXCEPTION 'INVALID_DATES: Check-in date cannot be NULL.';
    END IF;

    IF v_target_patch ? 'check_out' AND (v_target_patch->>'check_out') IS NULL THEN
        RAISE EXCEPTION 'INVALID_DATES: Check-out date cannot be NULL.';
    END IF;

    IF (COALESCE((v_target_patch->>'check_out')::date, v_invoice.check_out) < COALESCE((v_target_patch->>'check_in')::date, v_invoice.check_in)) THEN
        RAISE EXCEPTION 'INVALID_DATES: Check-out date cannot precede check-in date.';
    END IF;

    -- 6. Atomically update invoice header with robust presence-aware JSON patch
    UPDATE public.invoices SET
        invoice_number = CASE 
            WHEN v_target_patch ? 'invoice_number' THEN TRIM(v_target_patch->>'invoice_number')
            ELSE v_invoice.invoice_number
        END,
        invoice_date = CASE 
            WHEN v_target_patch ? 'invoice_date' THEN COALESCE((v_target_patch->>'invoice_date')::date, v_invoice.invoice_date)
            ELSE v_invoice.invoice_date
        END,
        status = CASE 
            WHEN v_target_patch ? 'status' THEN COALESCE(NULLIF(TRIM(v_target_patch->>'status'), ''), v_invoice.status)
            ELSE v_invoice.status
        END,
        guest_name = CASE 
            WHEN v_target_patch ? 'guest_name' THEN TRIM(v_target_patch->>'guest_name')
            ELSE v_invoice.guest_name
        END,
        guest_phone = CASE 
            WHEN v_target_patch ? 'guest_phone' THEN NULLIF(TRIM(v_target_patch->>'guest_phone'), '')
            ELSE v_invoice.guest_phone
        END,
        guest_email = CASE 
            WHEN v_target_patch ? 'guest_email' THEN NULLIF(TRIM(v_target_patch->>'guest_email'), '')
            ELSE v_invoice.guest_email
        END,
        guest_address = CASE 
            WHEN v_target_patch ? 'guest_address' THEN NULLIF(TRIM(v_target_patch->>'guest_address'), '')
            ELSE v_invoice.guest_address
        END,
        check_in = CASE 
            WHEN v_target_patch ? 'check_in' THEN COALESCE((v_target_patch->>'check_in')::date, v_invoice.check_in)
            ELSE v_invoice.check_in
        END,
        check_out = CASE 
            WHEN v_target_patch ? 'check_out' THEN COALESCE((v_target_patch->>'check_out')::date, v_invoice.check_out)
            ELSE v_invoice.check_out
        END,
        room_id = CASE 
            WHEN v_target_patch ? 'room_id' THEN 
                CASE 
                    WHEN v_target_patch->'room_id' = 'null'::jsonb OR TRIM(COALESCE(v_target_patch->>'room_id', '')) = '' THEN NULL
                    ELSE (v_target_patch->>'room_id')::uuid
                END
            ELSE v_invoice.room_id
        END,
        room_name = CASE 
            WHEN v_target_patch ? 'room_name' THEN NULLIF(TRIM(v_target_patch->>'room_name'), '')
            ELSE v_invoice.room_name
        END,
        subtotal = v_calc_subtotal,
        tax_rate = v_applied_tax_rate,
        tax_amount = v_calc_tax_amount,
        discount_amount = v_calc_total_discount,
        grand_total = v_calc_grand_total,
        balance_due = v_calc_grand_total - v_invoice.amount_paid,
        notes = CASE 
            WHEN v_target_patch ? 'notes' THEN NULLIF(TRIM(v_target_patch->>'notes'), '')
            ELSE v_invoice.notes
        END,
        house_rules = CASE 
            WHEN v_target_patch ? 'house_rules' THEN NULLIF(TRIM(v_target_patch->>'house_rules'), '')
            ELSE v_invoice.house_rules
        END,
        updated_at = NOW()
    WHERE id = p_invoice_id;

    -- 7. Replace line items atomically within the same transaction if items were provided
    IF p_items IS NOT NULL THEN
        DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

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
                    p_invoice_id, v_invoice.homestay_id, v_item.category, v_item.description, v_item.stay_period,
                    v_item.quantity, v_item.rate, COALESCE(v_item.amount, v_item_expected_amount), v_item.sort_order
                );
            END LOOP;
        END IF;
    END IF;
END;
$$;

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies: Invoices
-- Super Admin full access
DROP POLICY IF EXISTS "Allow super_admin to manage invoices" ON public.invoices;
CREATE POLICY "Allow super_admin to manage invoices" 
ON public.invoices FOR ALL TO authenticated 
USING (public.is_super_admin()) 
WITH CHECK (public.is_super_admin());

-- Active partners read their homestay invoices
DROP POLICY IF EXISTS "Allow active partners to read invoices" ON public.invoices;
CREATE POLICY "Allow active partners to read invoices" 
ON public.invoices FOR SELECT TO authenticated 
USING (public.is_super_admin() OR (homestay_id = public.get_user_homestay_id() AND public.is_active_partner()));

-- Active partners insert invoices for their homestay
DROP POLICY IF EXISTS "Allow active partners to insert invoices" ON public.invoices;
CREATE POLICY "Allow active partners to insert invoices" 
ON public.invoices FOR INSERT TO authenticated 
WITH CHECK (public.is_super_admin() OR (homestay_id = public.get_user_homestay_id() AND public.is_active_partner()));

-- Active partners update invoices for their homestay
DROP POLICY IF EXISTS "Allow active partners to update invoices" ON public.invoices;
CREATE POLICY "Allow active partners to update invoices" 
ON public.invoices FOR UPDATE TO authenticated 
USING (public.is_super_admin() OR (homestay_id = public.get_user_homestay_id() AND public.is_active_partner()))
WITH CHECK (public.is_super_admin() OR (homestay_id = public.get_user_homestay_id() AND public.is_active_partner()));

-- Active partners delete invoices for their homestay (prohibited if invoice has any linked payments)
DROP POLICY IF EXISTS "Allow active partners to delete invoices" ON public.invoices;
CREATE POLICY "Allow active partners to delete invoices" 
ON public.invoices FOR DELETE TO authenticated 
USING (
    CASE 
        WHEN public.is_super_admin() THEN NOT public.invoice_has_payments(id)
        WHEN homestay_id = public.get_user_homestay_id() AND public.is_active_partner() THEN NOT public.invoice_has_payments(id)
        ELSE false
    END
);

-- Service role full access
DROP POLICY IF EXISTS "Allow service_role full access to invoices" ON public.invoices;
CREATE POLICY "Allow service_role full access to invoices" 
ON public.invoices FOR ALL TO service_role 
USING (true) WITH CHECK (true);

-- 8. RLS Policies: Invoice Items
-- Super Admin full access
DROP POLICY IF EXISTS "Allow super_admin to manage invoice items" ON public.invoice_items;
CREATE POLICY "Allow super_admin to manage invoice items" 
ON public.invoice_items FOR ALL TO authenticated 
USING (public.is_super_admin()) 
WITH CHECK (public.is_super_admin());

-- Active partners read their homestay invoice items
DROP POLICY IF EXISTS "Allow active partners to read invoice items" ON public.invoice_items;
CREATE POLICY "Allow active partners to read invoice items" 
ON public.invoice_items FOR SELECT TO authenticated 
USING (public.is_super_admin() OR (homestay_id = public.get_user_homestay_id() AND public.is_active_partner()));

-- Active partners insert invoice items for their homestay
DROP POLICY IF EXISTS "Allow active partners to insert invoice items" ON public.invoice_items;
CREATE POLICY "Allow active partners to insert invoice items" 
ON public.invoice_items FOR INSERT TO authenticated 
WITH CHECK (public.is_super_admin() OR (homestay_id = public.get_user_homestay_id() AND public.is_active_partner()));

-- Active partners update invoice items for their homestay
DROP POLICY IF EXISTS "Allow active partners to update invoice items" ON public.invoice_items;
CREATE POLICY "Allow active partners to update invoice items" 
ON public.invoice_items FOR UPDATE TO authenticated 
USING (public.is_super_admin() OR (homestay_id = public.get_user_homestay_id() AND public.is_active_partner()))
WITH CHECK (public.is_super_admin() OR (homestay_id = public.get_user_homestay_id() AND public.is_active_partner()));

-- Active partners delete invoice items for their homestay
DROP POLICY IF EXISTS "Allow active partners to delete invoice items" ON public.invoice_items;
CREATE POLICY "Allow active partners to delete invoice items" 
ON public.invoice_items FOR DELETE TO authenticated 
USING (public.is_super_admin() OR (homestay_id = public.get_user_homestay_id() AND public.is_active_partner()));

-- Service role full access
DROP POLICY IF EXISTS "Allow service_role full access to invoice items" ON public.invoice_items;
CREATE POLICY "Allow service_role full access to invoice items" 
ON public.invoice_items FOR ALL TO service_role 
USING (true) WITH CHECK (true);

-- 9. Standard Grants for PostgREST (Strict Defense in Depth: Least privilege for authenticated, no access for public/anon)
REVOKE ALL ON TABLE public.invoices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.invoice_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoice_items TO authenticated;
GRANT ALL ON TABLE public.invoices TO service_role;
GRANT ALL ON TABLE public.invoice_items TO service_role;

REVOKE ALL ON FUNCTION public.invoice_has_payments(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_invoice_deletion_with_payments() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_invoice_relationship_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_invoice_with_items(UUID, TEXT, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, DATE, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_invoice_with_items(UUID, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_invoice_from_payments() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_invoice_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_invoice_summary(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_payment_integrity() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.invoice_has_payments(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prevent_invoice_deletion_with_payments() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prevent_invoice_relationship_mutation() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_invoice_with_items(UUID, TEXT, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, DATE, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_invoice_with_items(UUID, JSONB, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION validate_payment_integrity() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_invoice_from_payments() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_invoice_summary(UUID) TO authenticated, service_role;

-- 10. Explicit Function Ownership
ALTER FUNCTION public.create_invoice_with_items(UUID, TEXT, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, DATE, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) OWNER TO postgres;
ALTER FUNCTION public.update_invoice_with_items(UUID, JSONB, JSONB) OWNER TO postgres;
ALTER FUNCTION public.invoice_has_payments(UUID) OWNER TO postgres;
ALTER FUNCTION public.prevent_invoice_deletion_with_payments() OWNER TO postgres;
ALTER FUNCTION public.prevent_invoice_relationship_mutation() OWNER TO postgres;
ALTER FUNCTION validate_payment_integrity() OWNER TO postgres;
ALTER FUNCTION public.sync_invoice_from_payments() OWNER TO postgres;
ALTER FUNCTION public.record_invoice_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT) OWNER TO postgres;
ALTER FUNCTION public.reconcile_invoice_summary(UUID) OWNER TO postgres;

COMMIT;

