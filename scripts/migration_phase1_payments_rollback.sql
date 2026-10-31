-- ==============================================================================
-- ROLLBACK SCRIPT: PHASE 1 ATOMIC PAYMENTS LEDGER
-- ==============================================================================
-- CRITICAL SAFETY POLICY:
-- 1. PHASE 2 DEPENDENCY CHECK:
--    Phase 2 (Invoices) depends on Phase 1 (Payments).
--    You MUST execute 'scripts/migration_phase2_invoices_rollback.sql' BEFORE
--    attempting to roll back Phase 1. If 'public.invoices' or 'payments.invoice_id'
--    exists, this rollback script will refuse to proceed.
-- 2. FINANCIAL DATA PRESERVATION & SAFETY HALT:
--    Dropping 'public.payments' destroys historical cash settlement records,
--    refund histories, and audit ledgers.
--    This script WILL REFUSE TO PROCEED if records exist in 'public.payments',
--    UNLESS the explicit reviewed data-preservation procedure below has been
--    executed and v_force_destructive_rollback is explicitly set to TRUE.
-- 3. ZERO DATA LOSS ON OTHER TABLES:
--    'public.bookings', 'public.rooms', 'public.guests', 'public.partners', and
--    'public.homestays' remain 100% PRESERVED and untouched.
--
-- EXPLICIT REVIEWED DATA-PRESERVATION PROCEDURE (REQUIRED BEFORE FORCING ROLLBACK):
-- Step 1: Export a full dump of Phase 1 payments ledger:
--         pg_dump -h <host> -U postgres -d postgres \
--           -t public.payments \
--           --data-only > backups/pre_rollback_phase1_payments_data.sql
-- Step 2: Verify backup file size is greater than 0 bytes and records are preserved.
-- Step 3: Only after formal approval, change 'v_force_destructive_rollback := FALSE;'
--         to 'v_force_destructive_rollback := TRUE;' in Section 1 below.
-- ==============================================================================

BEGIN;

-- 1. Safety Guard: Refuse to proceed if dependent Phase 2 objects or payments data exist
DO $$
DECLARE
    v_payment_count INTEGER := 0;
    v_invoices_exist BOOLEAN := FALSE;
    -- SAFETY FLAG: Default is FALSE. Change to TRUE ONLY after completing data preservation.
    v_force_destructive_rollback BOOLEAN := FALSE;
BEGIN
    -- Check if Phase 2 invoices table still exists
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'invoices'
    ) THEN
        RAISE EXCEPTION 
            'SAFETY HALT: Dependency conflict! The table "public.invoices" still exists. Phase 2 depends on Phase 1. You must execute "scripts/migration_phase2_invoices_rollback.sql" first before rolling back Phase 1.';
    END IF;

    -- Check if payments table exists and count rows
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'payments'
    ) THEN
        EXECUTE 'SELECT COUNT(*) FROM public.payments' INTO v_payment_count;
    END IF;

    -- If payment ledger records exist, halt unless explicitly overridden
    IF v_payment_count > 0 AND NOT v_force_destructive_rollback THEN
        RAISE EXCEPTION 
            'SAFETY HALT: Rollback refused! Found % confirmed payment ledger transaction(s) in "public.payments". Dropping payments table destroys financial history. You must execute an explicit, reviewed data-preservation procedure (see header instructions) and explicitly set v_force_destructive_rollback := TRUE in scripts/migration_phase1_payments_rollback.sql to proceed.',
            v_payment_count;
    END IF;

    IF v_force_destructive_rollback THEN
        RAISE NOTICE 'PROCEEDING WITH REVIEWED DESTRUCTIVE ROLLBACK: v_force_destructive_rollback is TRUE.';
    END IF;
END $$;

-- 2. Drop triggers from payments table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'payments'
    ) THEN
        DROP TRIGGER IF EXISTS trg_validate_payment_integrity ON public.payments;
        DROP TRIGGER IF EXISTS trg_prevent_payment_ledger_mutation ON public.payments;
    END IF;
END $$;

-- 3. Drop ledger trigger functions
DROP FUNCTION IF EXISTS public.validate_payment_integrity();
DROP FUNCTION IF EXISTS public.prevent_payment_ledger_mutation();

-- 4. Drop RLS policies on payments table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'payments'
    ) THEN
        DROP POLICY IF EXISTS "Tenant isolated payments select" ON public.payments;
        DROP POLICY IF EXISTS "Tenant isolated payments insert" ON public.payments;
        DROP POLICY IF EXISTS "Allow service_role full access to payments" ON public.payments;
    END IF;
END $$;

-- 5. Drop payments table
DROP TABLE IF EXISTS public.payments CASCADE;

COMMIT;
