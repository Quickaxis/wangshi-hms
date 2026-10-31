-- ==============================================================================
-- PSQL CLI COMPATIBLE: IDEMPOTENCY & FINANCIAL DATA PRESERVATION TEST
-- ==============================================================================
-- RUN TARGET: psql CLI terminal (psql -h <host> -U postgres -d postgres)
-- NOTE: Uses \i commands to include external SQL script.
-- For Supabase Dashboard SQL Editor, use test_idempotency_and_ledger.supabase.sql
-- ==============================================================================

BEGIN;

-- STEP 1: Execute Migration Run #1
\i scripts/migration_phase1_payments.sql

-- STEP 2: Insert Representative Test Data in Isolated Sandbox
DO $$
DECLARE
    v_homestay_id UUID;
    v_partner_id UUID;
    v_room_id UUID;
    v_booking_id UUID;
    v_payment_id UUID;
    v_refund_id UUID;
    v_rand_suffix TEXT;
BEGIN
    v_rand_suffix := substr(md5(random()::text), 1, 8);

    INSERT INTO homestays (name, slug) 
    VALUES ('__Sandbox_Homestay__' || v_rand_suffix, 'sandbox-' || v_rand_suffix) 
    RETURNING id INTO v_homestay_id;

    INSERT INTO partners (homestay_id, name, email, role, is_active)
    VALUES (v_homestay_id, 'Sandbox Partner', 'partner-' || v_rand_suffix || '@test.local', 'super_admin', true)
    RETURNING id INTO v_partner_id;

    INSERT INTO rooms (homestay_id, room_number, name, nightly_rate)
    VALUES (v_homestay_id, 'SB-' || substr(v_rand_suffix, 1, 4), 'Sandbox Room', 3000) 
    RETURNING id INTO v_room_id;

    INSERT INTO bookings (room_id, partner_id, homestay_id, check_in, check_out, total_amount, status)
    VALUES (v_room_id, v_partner_id, v_homestay_id, CURRENT_DATE + 365, CURRENT_DATE + 367, 6000, 'confirmed')
    RETURNING id INTO v_booking_id;

    INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, recorded_by, notes)
    VALUES (v_homestay_id, v_booking_id, 5000.00, 'payment', 'upi', v_partner_id, 'Initial advance payment')
    RETURNING id INTO v_payment_id;

    INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, recorded_by, notes)
    VALUES (v_homestay_id, v_booking_id, 2000.00, 'refund', 'upi', v_payment_id, v_partner_id, 'Partial refund for day change')
    RETURNING id INTO v_refund_id;

    INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, recorded_by, notes)
    VALUES (v_homestay_id, v_booking_id, 1000.00, 'reversal', 'upi', v_payment_id, v_partner_id, 'Administrative correction of over-collection');

    RAISE NOTICE 'Test Data Created: Booking %, Payment %, Refund %, Reversal', v_booking_id, v_payment_id, v_refund_id;
END $$;

-- STEP 3: Capture Complete Row Snapshot Before Run #2
CREATE TEMPORARY TABLE pre_migration_payments_snapshot AS 
SELECT * FROM payments;

-- STEP 4: Execute Migration Run #2 (Must succeed with zero errors)
\i scripts/migration_phase1_payments.sql

-- STEP 5: Strict Full-Row Diff & Catalog Integrity Verification
DO $$
DECLARE
    v_diff_forward INTEGER := 0;
    v_diff_backward INTEGER := 0;
    v_dup_constraints INTEGER := 0;
    v_dup_triggers INTEGER := 0;
    v_dup_policies INTEGER := 0;
BEGIN
    SELECT COUNT(*) INTO v_diff_forward FROM (
        SELECT * FROM pre_migration_payments_snapshot
        EXCEPT
        SELECT * FROM payments
    ) diff1;

    SELECT COUNT(*) INTO v_diff_backward FROM (
        SELECT * FROM payments
        EXCEPT
        SELECT * FROM pre_migration_payments_snapshot
    ) diff2;

    IF v_diff_forward > 0 OR v_diff_backward > 0 THEN
        RAISE EXCEPTION 'IDEMPOTENCY_FAILURE: Full row diff detected! Financial records were altered during Migration Run #2! (forward diff: %, backward diff: %)',
            v_diff_forward, v_diff_backward;
    END IF;

    SELECT COUNT(*) INTO v_dup_constraints FROM (
        SELECT conname, COUNT(*) 
        FROM pg_constraint 
        WHERE conrelid = 'payments'::regclass 
        GROUP BY conname 
        HAVING COUNT(*) > 1
    ) dups;

    IF v_dup_constraints > 0 THEN
        RAISE EXCEPTION 'IDEMPOTENCY_FAILURE: Duplicate constraints detected on payments table after Run #2!';
    END IF;

    SELECT COUNT(*) INTO v_dup_triggers FROM (
        SELECT tgname, COUNT(*) 
        FROM pg_trigger 
        WHERE tgrelid = 'payments'::regclass AND NOT tgisinternal
        GROUP BY tgname 
        HAVING COUNT(*) > 1
    ) dups;

    IF v_dup_triggers > 0 THEN
        RAISE EXCEPTION 'IDEMPOTENCY_FAILURE: Duplicate triggers detected on payments table after Run #2!';
    END IF;

    SELECT COUNT(*) INTO v_dup_policies FROM (
        SELECT polname, COUNT(*) 
        FROM pg_policy 
        WHERE polrelid = 'payments'::regclass 
        GROUP BY polname 
        HAVING COUNT(*) > 1
    ) dups;

    IF v_dup_policies > 0 THEN
        RAISE EXCEPTION 'IDEMPOTENCY_FAILURE: Duplicate RLS policies detected on payments table after Run #2!';
    END IF;

    RAISE NOTICE 'SUCCESS: Migration Run #2 completed with 100% full-row parity and zero catalog duplicates.';
END $$;

-- STEP 6: Clean Rollback (Leaves zero residual data in database)
ROLLBACK;
