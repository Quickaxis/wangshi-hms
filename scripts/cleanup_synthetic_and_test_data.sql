-- ==============================================================================
-- HMS PRODUCTION CLEANUP SCRIPT (STAGE 2 EXECUTION)
-- Project Reference: algorrnjotffcvtinbyy (Production)
--
-- TARGET COUNTS:
--   - public.booking_requests: Exactly 5 rows (Category B website tests)
--   - public.guests:           Exactly 23 rows (18 Category A + 5 Category B)
--   - public.bookings:         Exactly 22 rows (17 Category A + 5 Category B)
--
-- EXCLUSION & PRESERVATION:
--   - 4 Genuine Completed Stays (checked_out) -> 100% PRESERVED
--   - 16 Ambiguous Sandbox Rehearsal Bookings -> 100% PRESERVED
--   - 32 Preserved Guests                     -> 100% PRESERVED
--   - 8 Partner Profiles                      -> 100% PRESERVED
--   - 16 Rooms                                -> 100% PRESERVED
--   - 7 Homestays                             -> 100% PRESERVED
--
-- SAFETY ARCHITECTURE:
--   1. Transactional atomicity: Wrapped in BEGIN ... COMMIT.
--   2. Immediate row-count capture: Each DELETE is executed in a CTE with
--      RETURNING 1, populating a temporary table '_cleanup_metrics' IMMEDIATELY
--      upon execution, BEFORE entering any DO block.
--   3. Assertion Gateways: A PL/pgSQL validation block immediately inspects
--      the captured row count and aborts with RAISE EXCEPTION if counts mismatch.
--   4. Final Database Integrity Check: Validates remaining totals before COMMIT.
-- ==============================================================================

BEGIN;

-- Create temporary metrics table to capture affected row counts immediately
CREATE TEMP TABLE IF NOT EXISTS _cleanup_metrics (
    step TEXT PRIMARY KEY,
    affected_rows INTEGER NOT NULL
) ON COMMIT DROP;

TRUNCATE TABLE _cleanup_metrics;

-- ------------------------------------------------------------------------------
-- STEP 1: Delete linked booking_requests for Category B website tests (5 rows)
-- (Dependent FK: booking_requests.booking_id -> bookings.id)
-- Captured immediately via CTE RETURNING into _cleanup_metrics
-- ------------------------------------------------------------------------------
WITH deleted_requests AS (
    DELETE FROM public.booking_requests
    WHERE id IN (
        'bb56da28-52e3-4143-8f23-20d796e7be8d',
        '1e079301-46ec-4341-8906-1fcf40c9e192',
        'a4844ae1-45d5-4bf2-96a4-f92a003234f5',
        'ce4fd1c2-f061-4193-a6ca-7e6e2438c3cf',
        '1cc19888-477e-4f36-a84f-d6a6f888cd62'
    )
    RETURNING 1
)
INSERT INTO _cleanup_metrics (step, affected_rows)
SELECT 'booking_requests', COUNT(*) FROM deleted_requests;

-- Assertion Gateway 1
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT affected_rows INTO v_count FROM _cleanup_metrics WHERE step = 'booking_requests';
    IF v_count <> 5 THEN
        RAISE EXCEPTION 'SAFETY ASSERTION FAILED: Expected 5 deleted booking_requests, but deleted % rows. Transaction rolled back!', v_count;
    END IF;
    RAISE NOTICE 'Step 1 Passed: Exactly % booking_requests deleted.', v_count;
END $$;

-- ------------------------------------------------------------------------------
-- STEP 2: Delete dependent guests for Category A and Category B bookings (23 rows)
-- (Dependent FK: guests.booking_id -> bookings.id)
-- Captured immediately via CTE RETURNING into _cleanup_metrics
-- ------------------------------------------------------------------------------
WITH deleted_guests AS (
    DELETE FROM public.guests
    WHERE booking_id IN (
        '17cb0bbb-0c6d-4f3e-af9a-ac71e195d222',
        '1fc6d0b8-c4a9-487f-9ef4-af12eead3942',
        '8360d4f8-fd9b-493f-98e5-e6177b022d18',
        '45ff7159-b980-41ca-8883-0a60ccb45aad',
        '83e885d8-6c29-4611-977a-81edd1f79995',
        '5b77922c-7440-4777-ad02-00b71955a37c',
        'e108d2d1-f70c-4496-b44c-7c3ed31117b8',
        'a7f7abcc-434d-43c1-b3a1-ce4fedcfcdeb',
        '5f067bc9-11c9-4134-b878-c5aa28be3059',
        '99f3e234-d768-4bbb-9d8a-0b4bb3876364',
        'f76f4266-7b0d-4caf-b2aa-4f542265e358',
        'fa20ab92-29ab-4717-b84d-1e48474d79c5',
        '0a064075-573e-417d-a047-1f3fadcb7308',
        '4f270eb0-eba4-49fd-ad92-9f71fb5dac7d',
        '812660f3-a9cb-4e11-b789-1db0d3621bd2',
        'd695585f-dc8a-435a-93f5-6207c395d15a',
        '89fe33fd-3246-4fdd-80f8-c6c7c851b897',
        'b849cc45-e530-48ee-b7fe-e570a418b396',
        '319329df-0709-49c9-b039-3c69e28c6a36',
        '725b0620-811b-4d9e-b5de-f0793d887aa8',
        '76f0811f-6fd4-4fee-b112-8fa2add872c1',
        '0379a971-131b-4e0c-bff1-3ffa68dc34dc'
    )
    RETURNING 1
)
INSERT INTO _cleanup_metrics (step, affected_rows)
SELECT 'guests', COUNT(*) FROM deleted_guests;

-- Assertion Gateway 2
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT affected_rows INTO v_count FROM _cleanup_metrics WHERE step = 'guests';
    IF v_count <> 23 THEN
        RAISE EXCEPTION 'SAFETY ASSERTION FAILED: Expected 23 deleted guests, but deleted % rows. Transaction rolled back!', v_count;
    END IF;
    RAISE NOTICE 'Step 2 Passed: Exactly % guests deleted.', v_count;
END $$;

-- ------------------------------------------------------------------------------
-- STEP 3: Delete bookings for Category A and Category B (22 rows)
-- Captured immediately via CTE RETURNING into _cleanup_metrics
-- ------------------------------------------------------------------------------
WITH deleted_bookings AS (
    DELETE FROM public.bookings
    WHERE id IN (
        '17cb0bbb-0c6d-4f3e-af9a-ac71e195d222',
        '1fc6d0b8-c4a9-487f-9ef4-af12eead3942',
        '8360d4f8-fd9b-493f-98e5-e6177b022d18',
        '45ff7159-b980-41ca-8883-0a60ccb45aad',
        '83e885d8-6c29-4611-977a-81edd1f79995',
        '5b77922c-7440-4777-ad02-00b71955a37c',
        'e108d2d1-f70c-4496-b44c-7c3ed31117b8',
        'a7f7abcc-434d-43c1-b3a1-ce4fedcfcdeb',
        '5f067bc9-11c9-4134-b878-c5aa28be3059',
        '99f3e234-d768-4bbb-9d8a-0b4bb3876364',
        'f76f4266-7b0d-4caf-b2aa-4f542265e358',
        'fa20ab92-29ab-4717-b84d-1e48474d79c5',
        '0a064075-573e-417d-a047-1f3fadcb7308',
        '4f270eb0-eba4-49fd-ad92-9f71fb5dac7d',
        '812660f3-a9cb-4e11-b789-1db0d3621bd2',
        'd695585f-dc8a-435a-93f5-6207c395d15a',
        '89fe33fd-3246-4fdd-80f8-c6c7c851b897',
        'b849cc45-e530-48ee-b7fe-e570a418b396',
        '319329df-0709-49c9-b039-3c69e28c6a36',
        '725b0620-811b-4d9e-b5de-f0793d887aa8',
        '76f0811f-6fd4-4fee-b112-8fa2add872c1',
        '0379a971-131b-4e0c-bff1-3ffa68dc34dc'
    )
    RETURNING 1
)
INSERT INTO _cleanup_metrics (step, affected_rows)
SELECT 'bookings', COUNT(*) FROM deleted_bookings;

-- Assertion Gateway 3
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT affected_rows INTO v_count FROM _cleanup_metrics WHERE step = 'bookings';
    IF v_count <> 22 THEN
        RAISE EXCEPTION 'SAFETY ASSERTION FAILED: Expected 22 deleted bookings, but deleted % rows. Transaction rolled back!', v_count;
    END IF;
    RAISE NOTICE 'Step 3 Passed: Exactly % bookings deleted.', v_count;
END $$;

-- ------------------------------------------------------------------------------
-- FINAL DATABASE INTEGRITY CHECK BEFORE COMMIT
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    remaining_bookings INTEGER;
    remaining_guests INTEGER;
    remaining_partners INTEGER;
    remaining_rooms INTEGER;
    remaining_homestays INTEGER;
    completed_bookings INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_bookings FROM public.bookings;
    SELECT COUNT(*) INTO remaining_guests FROM public.guests;
    SELECT COUNT(*) INTO remaining_partners FROM public.partners;
    SELECT COUNT(*) INTO remaining_rooms FROM public.rooms;
    SELECT COUNT(*) INTO remaining_homestays FROM public.homestays;
    SELECT COUNT(*) INTO completed_bookings FROM public.bookings WHERE status = 'checked_out';

    IF remaining_bookings <> 20 THEN
        RAISE EXCEPTION 'SANITY CHECK FAILED: Remaining bookings count (%) does not match expected 20. Rolling back!', remaining_bookings;
    END IF;

    IF completed_bookings <> 4 THEN
        RAISE EXCEPTION 'SANITY CHECK FAILED: Completed bookings count modified! Expected 4, found %. Rolling back!', completed_bookings;
    END IF;

    IF remaining_guests <> 32 THEN
        RAISE EXCEPTION 'SANITY CHECK FAILED: Remaining guests count (%) does not match expected 32. Rolling back!', remaining_guests;
    END IF;

    IF remaining_partners <> 8 THEN
        RAISE EXCEPTION 'SANITY CHECK FAILED: Partners count modified! Expected 8, found %. Rolling back!', remaining_partners;
    END IF;

    IF remaining_rooms <> 16 THEN
        RAISE EXCEPTION 'SANITY CHECK FAILED: Rooms count modified! Expected 16, found %. Rolling back!', remaining_rooms;
    END IF;

    IF remaining_homestays <> 7 THEN
        RAISE EXCEPTION 'SANITY CHECK FAILED: Homestays count modified! Expected 7, found %. Rolling back!', remaining_homestays;
    END IF;

    RAISE NOTICE 'ALL INTEGRITY CHECKS PASSED: 20 bookings (4 completed, 16 rehearsal), 32 guests, 8 partners, 16 rooms, 7 homestays verified.';
END $$;

COMMIT;
