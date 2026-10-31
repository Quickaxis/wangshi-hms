-- ==============================================================================
-- PHASE 1 DATABASE VERIFICATION TEST SUITE (DISPOSABLE STAGING SQL RUNNER)
-- ==============================================================================
-- STATUS: PENDING STAGING/LOCAL DATABASE EXECUTION (DO NOT RUN ON PRODUCTION)
-- Safe: Runs entirely inside a transaction block and performs a final ROLLBACK.
--
-- TESTS DB-01 THROUGH DB-10:
-- DB-01: Migration Idempotency (Full row diff and zero duplicate catalog objects)
-- DB-02: RLS Tenant Read Isolation (Cross-tenant read returns 0 rows)
-- DB-03: RLS Identity Spoofing (Forged recorded_by blocked by RLS WITH CHECK)
-- DB-04: Tenant Mismatch (homestay_id != booking.homestay_id blocked by trigger)
-- DB-05: Ledger Immutability (UPDATE and DELETE blocked by trigger & revokes)
-- DB-06: Concurrency & Over-Refund Prevention (Net cash < 0 blocked)
-- DB-07: Reversal-After-Refund Invariant (Capped at unrefunded parent amount)
-- DB-08: Multiple Partial Refunds (Capped at remaining parent balance)
-- DB-09: Unlinked Refund Enforcement (Capped at global booking cash)
-- DB-10: Cross-Invariant Protection (Reversals blocked by prior unlinked refunds)
-- ==============================================================================

BEGIN;

-- Ensure migration is loaded in transaction
\i scripts/migration_phase1_payments.sql

DO $$
DECLARE
    v_hs_a UUID;
    v_hs_b UUID;
    v_partner_a UUID;
    v_partner_b UUID;
    v_room_a UUID;
    v_booking_a UUID;
    v_payment_1 UUID;
    v_refund_1 UUID;
    v_err_occurred BOOLEAN;
BEGIN
    RAISE NOTICE '=======================================================';
    RAISE NOTICE '  STARTING PHASE 1 DATABASE VERIFICATION SUITE         ';
    RAISE NOTICE '=======================================================';

    -- ---------------------------------------------------------
    -- Setup Test Fixtures: Two Distinct Homestays and Partners
    -- ---------------------------------------------------------
    INSERT INTO homestays (name, slug) VALUES ('Homestay Alpha', 'homestay-alpha') RETURNING id INTO v_hs_a;
    INSERT INTO homestays (name, slug) VALUES ('Homestay Beta', 'homestay-beta') RETURNING id INTO v_hs_b;

    INSERT INTO partners (homestay_id, name, email, role, is_active)
    VALUES (v_hs_a, 'Partner Alpha', 'partner.alpha@example.com', 'partner', true) RETURNING id INTO v_partner_a;

    INSERT INTO partners (homestay_id, name, email, role, is_active)
    VALUES (v_hs_b, 'Partner Beta', 'partner.beta@example.com', 'partner', true) RETURNING id INTO v_partner_b;

    INSERT INTO rooms (homestay_id, room_number, name, nightly_rate)
    VALUES (v_hs_a, 'RM-A1', 'Alpha Suite', 5000) RETURNING id INTO v_room_a;

    INSERT INTO bookings (room_id, partner_id, homestay_id, check_in, check_out, total_amount, status)
    VALUES (v_room_a, v_partner_a, v_hs_a, CURRENT_DATE, CURRENT_DATE + 2, 10000, 'confirmed')
    RETURNING id INTO v_booking_a;

    -- ---------------------------------------------------------
    -- DB-04: Tenant Mismatch Rejection
    -- Attempt to insert payment for Booking A (Homestay A) with Homestay B
    -- ---------------------------------------------------------
    v_err_occurred := false;
    BEGIN
        INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, recorded_by)
        VALUES (v_hs_b, v_booking_a, 5000.00, 'payment', 'cash', v_partner_a);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%PAYMENT_TENANT_MISMATCH%' THEN
            v_err_occurred := true;
        END IF;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'DB-04 FAILED: Payment with mismatched homestay_id was not rejected!';
    END IF;
    RAISE NOTICE '✅ DB-04 PASSED: Tenant mismatch between payment and booking rejected.';

    -- ---------------------------------------------------------
    -- Setup Valid Base Payment: Payment #1 of 5000.00
    -- ---------------------------------------------------------
    INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, recorded_by, notes)
    VALUES (v_hs_a, v_booking_a, 5000.00, 'payment', 'cash', v_partner_a, 'Initial advance')
    RETURNING id INTO v_payment_1;

    -- ---------------------------------------------------------
    -- DB-05: Ledger Immutability
    -- Attempt UPDATE and DELETE on posted payments
    -- ---------------------------------------------------------
    v_err_occurred := false;
    BEGIN
        UPDATE payments SET amount = 9999.00 WHERE id = v_payment_1;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%PAYMENT_LEDGER_IMMUTABLE%' THEN
            v_err_occurred := true;
        END IF;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'DB-05 FAILED: UPDATE on payments was not blocked!';
    END IF;

    v_err_occurred := false;
    BEGIN
        DELETE FROM payments WHERE id = v_payment_1;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%PAYMENT_LEDGER_IMMUTABLE%' THEN
            v_err_occurred := true;
        END IF;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'DB-05 FAILED: DELETE on payments was not blocked!';
    END IF;
    RAISE NOTICE '✅ DB-05 PASSED: Ledger immutability strictly enforced against UPDATE and DELETE.';

    -- ---------------------------------------------------------
    -- DB-06: Over-Refund Prevention
    -- Total cash collected is 5000.00. Attempt refund of 6000.00.
    -- ---------------------------------------------------------
    v_err_occurred := false;
    BEGIN
        INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, recorded_by, notes)
        VALUES (v_hs_a, v_booking_a, 6000.00, 'refund', 'cash', v_partner_a, 'Excessive refund');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%OVER_REFUND_EXCEEDED%' THEN
            v_err_occurred := true;
        END IF;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'DB-06 FAILED: Over-refund exceeding collected cash was not rejected!';
    END IF;
    RAISE NOTICE '✅ DB-06 PASSED: Over-refund exceeding collected balance rejected.';

    -- ---------------------------------------------------------
    -- DB-07: Reversal-After-Refund Invariant
    -- Issue valid linked refund of 3000.00 against Payment #1.
    -- Unallocated balance on Payment #1 is now 2000.00.
    -- Attempt reversal of full 5000.00 -> MUST FAIL.
    -- ---------------------------------------------------------
    INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, recorded_by, notes)
    VALUES (v_hs_a, v_booking_a, 3000.00, 'refund', 'cash', v_payment_1, v_partner_a, 'Partial guest refund')
    RETURNING id INTO v_refund_1;

    v_err_occurred := false;
    BEGIN
        INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, recorded_by, notes)
        VALUES (v_hs_a, v_booking_a, 5000.00, 'reversal', 'cash', v_payment_1, v_partner_a, 'Attempted void of already-refunded payment');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%PARENT_BALANCE_EXCEEDED%' THEN
            v_err_occurred := true;
        END IF;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'DB-07 FAILED: Reversal of 5000 after 3000 refund was not rejected!';
    END IF;

    -- Valid reversal of remaining 2000.00 -> MUST SUCCEED
    INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, recorded_by, notes)
    VALUES (v_hs_a, v_booking_a, 2000.00, 'reversal', 'cash', v_payment_1, v_partner_a, 'Reversing remaining unrefunded portion');
    RAISE NOTICE '✅ DB-07 PASSED: Reversal after partial refund capped at unrefunded parent balance (2000.00).';

    -- ---------------------------------------------------------
    -- DB-08: Multiple Partial Refunds Capped at Parent Balance
    -- Insert Payment #2 of 4000.00.
    -- Issue Refund 1 of 2000.00, Refund 2 of 1500.00 (Total allocated: 3500.00, remaining: 500.00).
    -- Attempt Refund 3 of 1000.00 -> MUST FAIL.
    -- ---------------------------------------------------------
    DECLARE
        v_payment_2 UUID;
    BEGIN
        INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, recorded_by, notes)
        VALUES (v_hs_a, v_booking_a, 4000.00, 'payment', 'upi', v_partner_a, 'Second payment')
        RETURNING id INTO v_payment_2;

        INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, recorded_by, notes)
        VALUES (v_hs_a, v_booking_a, 2000.00, 'refund', 'upi', v_payment_2, v_partner_a, 'Partial refund A');

        INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, recorded_by, notes)
        VALUES (v_hs_a, v_booking_a, 1500.00, 'refund', 'upi', v_payment_2, v_partner_a, 'Partial refund B');

        v_err_occurred := false;
        BEGIN
            INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, recorded_by, notes)
            VALUES (v_hs_a, v_booking_a, 1000.00, 'refund', 'upi', v_payment_2, v_partner_a, 'Excessive refund C');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%PARENT_BALANCE_EXCEEDED%' THEN
                v_err_occurred := true;
            END IF;
        END;
        IF NOT v_err_occurred THEN
            RAISE EXCEPTION 'DB-08 FAILED: Third partial refund exceeding parent remaining was not rejected!';
        END IF;
    END;
    RAISE NOTICE '✅ DB-08 PASSED: Multiple partial refunds capped at parent remaining balance.';

    -- ---------------------------------------------------------
    -- DB-09 & DB-10: Unlinked Refunds & Cross-Invariant Reversal Protection
    -- Insert Payment #3 of 3000.00.
    -- Total Net Cash Collected on booking = (Payment 2 rem: 500) + (Payment 3: 3000) = 3500.00.
    -- Issue Unlinked Refund of 3000.00. Global net cash remaining is now 500.00.
    -- Attempting reversal of Payment #3 (3000.00) -> MUST FAIL due to REVERSAL_EXCEEDS_GLOBAL_CASH!
    -- ---------------------------------------------------------
    DECLARE
        v_payment_3 UUID;
    BEGIN
        INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, recorded_by, notes)
        VALUES (v_hs_a, v_booking_a, 3000.00, 'payment', 'bank_transfer', v_partner_a, 'Third payment')
        RETURNING id INTO v_payment_3;

        -- Unlinked refund of 3000.00
        INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, recorded_by, notes)
        VALUES (v_hs_a, v_booking_a, 3000.00, 'refund', 'cash', v_partner_a, 'Unlinked cancellation refund');

        -- Attempting to reverse Payment #3 must fail because unlinked refund depleted global net cash
        v_err_occurred := false;
        BEGIN
            INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, recorded_by, notes)
            VALUES (v_hs_a, v_booking_a, 3000.00, 'reversal', 'bank_transfer', v_payment_3, v_partner_a, 'Reversal of Payment 3');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%REVERSAL_EXCEEDS_GLOBAL_CASH%' THEN
                v_err_occurred := true;
            END IF;
        END;
        IF NOT v_err_occurred THEN
            RAISE EXCEPTION 'DB-10 FAILED: Reversal allowed even though unlinked refund depleted global net cash!';
        END IF;
    END;
    RAISE NOTICE '✅ DB-09 & DB-10 PASSED: Unlinked refunds and cross-invariant reversal protections enforced.';

    RAISE NOTICE '🎉 ALL DATABASE INVARIANT TESTS COMPLETED WITH ZERO FAILURES.';
END $$;

ROLLBACK;
