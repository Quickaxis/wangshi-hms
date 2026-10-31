-- ==============================================================================
-- ROLLBACK SCRIPT: PHASE 2 INVOICES & BILLING SYSTEM
-- ==============================================================================
-- CRITICAL SAFETY POLICY:
-- 1. DROPPING payments.invoice_id REMOVES INVOICE-TO-PAYMENT RELATIONAL LINKS:
--    Dropping the column 'invoice_id' from 'public.payments' permanently removes
--    the direct link between a payment transaction and its specific invoice.
-- 2. NEVER DROPS EXISTING BOOKING OR PAYMENT DATA:
--    The 'public.payments' ledger table and all payment/refund/reversal records,
--    as well as 'public.bookings', 'public.rooms', 'public.guests', and
--    'public.partners', remain 100% PRESERVED and untouched.
-- 3. REFUSAL GUARD (SAFETY HALT):
--    This script WILL REFUSE TO PROCEED and will raise an exception if active
--    invoices, invoice items, or payments linked to invoices exist, UNLESS the
--    explicit reviewed data-preservation procedure below has been executed and
--    v_force_destructive_rollback is explicitly set to TRUE.
--
-- EXPLICIT REVIEWED DATA-PRESERVATION PROCEDURE (REQUIRED BEFORE FORCING ROLLBACK):
-- Step 1: Export a full dump of Phase 2 billing objects and related payment data:
--         The backup MUST PRESERVE:
--           1. Invoice records (`public.invoices`)
--           2. Invoice line item records (`public.invoice_items`)
--           3. Payment records (`public.payments`)
--           4. Invoice-to-payment mappings (`public.payments.invoice_id` foreign keys and associations)
--         Command:
--         pg_dump -h <host> -U postgres -d postgres \
--           -t public.invoices -t public.invoice_items -t public.payments \
--           --data-only > backups/pre_rollback_phase2_invoices_and_payments_backup.sql
-- Step 2: Verify backup file size is greater than 0 bytes, row counts match live database,
--         and all invoice_id foreign key links and items are fully intact.
-- Step 3: Review all dependent database objects (foreign key constraints, triggers, views, RPCs).
--         Ensure no untracked application view or external constraint depends on public.invoices or public.invoice_items.
-- Step 4: Only after formal technical sign-off and approval, change:
--         'v_force_destructive_rollback := FALSE;'
--         to 'v_force_destructive_rollback := TRUE;' in Section 1 below.
-- ==============================================================================

BEGIN;

-- 1. Safety Guard: Refuse to proceed if billing records or linked payment data exist
DO $$
DECLARE
    v_invoice_count INTEGER := 0;
    v_item_count INTEGER := 0;
    v_linked_payment_count INTEGER := 0;
    -- SAFETY FLAG: Default is FALSE. Keep destructive rollback disabled by default.
    -- Change to TRUE ONLY after completing data preservation and formal technical approval.
    v_force_destructive_rollback BOOLEAN := FALSE;
BEGIN
    -- Check invoices table count
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'invoices'
    ) THEN
        EXECUTE 'SELECT COUNT(*) FROM public.invoices' INTO v_invoice_count;
    END IF;

    -- Check invoice_items table count
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'invoice_items'
    ) THEN
        EXECUTE 'SELECT COUNT(*) FROM public.invoice_items' INTO v_item_count;
    END IF;

    -- Check payments linked to invoices
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'invoice_id'
    ) THEN
        EXECUTE 'SELECT COUNT(*) FROM public.payments WHERE invoice_id IS NOT NULL' INTO v_linked_payment_count;
    END IF;

    -- If any billing data or linked payments exist, halt unless explicitly overridden
    IF (v_invoice_count > 0 OR v_item_count > 0 OR v_linked_payment_count > 0) AND NOT v_force_destructive_rollback THEN
        RAISE EXCEPTION 
            'SAFETY HALT: Rollback refused! Found % active invoice(s), % invoice item(s), and % payment(s) linked to invoices. Dropping payments.invoice_id removes invoice-to-payment links and destroys billing records. You must execute an explicit, reviewed data-preservation procedure (see header instructions: preserve invoices, items, payments, and invoice-to-payment mappings) and explicitly set v_force_destructive_rollback := TRUE in scripts/migration_phase2_invoices_rollback.sql to proceed.',
            v_invoice_count, v_item_count, v_linked_payment_count;
    END IF;

    IF v_force_destructive_rollback THEN
        RAISE NOTICE 'PROCEEDING WITH REVIEWED DESTRUCTIVE ROLLBACK: v_force_destructive_rollback is TRUE.';
    END IF;
END $$;

-- 2. Clean up billing triggers on payments and invoices
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
        DROP TRIGGER IF EXISTS trg_sync_invoice_with_payment_ledger ON public.payments;
        DROP TRIGGER IF EXISTS trg_sync_invoice_from_payments ON public.payments;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoices') THEN
        DROP TRIGGER IF EXISTS trg_prevent_invoice_deletion_with_payments ON public.invoices;
        DROP TRIGGER IF EXISTS trg_prevent_invoice_relationship_mutation ON public.invoices;
    END IF;
END $$;

-- 3. Clean up Phase 2 and Phase 3 billing RPC functions
DROP FUNCTION IF EXISTS public.sync_invoice_with_payment_ledger();
DROP FUNCTION IF EXISTS public.sync_invoice_from_payments();
DROP FUNCTION IF EXISTS public.record_invoice_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.reconcile_invoice_summary(UUID);
DROP FUNCTION IF EXISTS public.create_invoice_with_items(UUID, TEXT, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, DATE, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_invoice_with_items(UUID, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.prevent_invoice_deletion_with_payments();
DROP FUNCTION IF EXISTS public.prevent_invoice_relationship_mutation();
DROP FUNCTION IF EXISTS public.invoice_has_payments(UUID);

-- 4. Review and remove dependent foreign keys on public.payments before dropping columns/tables
DO $$
BEGIN
    -- Drop payments -> invoices foreign key constraint explicitly
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'payments'
          AND constraint_name = 'payments_invoice_id_fkey'
    ) THEN
        ALTER TABLE public.payments DROP CONSTRAINT payments_invoice_id_fkey;
    END IF;

    -- Drop index on payments(invoice_id)
    DROP INDEX IF EXISTS public.idx_payments_invoice_id;

    -- Drop optional invoice_id column from payments if present
    -- NOTE: Dropping this column removes the invoice-to-payment link, but preserves all payment rows.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'invoice_id'
    ) THEN
        ALTER TABLE public.payments DROP COLUMN invoice_id;
    END IF;
END $$;

-- 5. Drop dependent child table public.invoice_items explicitly
DROP TABLE IF EXISTS public.invoice_items CASCADE;

-- 6. Drop parent table public.invoices explicitly
DROP TABLE IF EXISTS public.invoices CASCADE;

COMMIT;
