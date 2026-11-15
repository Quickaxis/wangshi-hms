-- ==============================================================================
-- WANGSHI HOMESTAY: PRODUCTION TEST DATA CLEANUP SCRIPT (FINAL AUDITED & HARDENED)
-- Target Homestay: Wangshi Homestay ('ce603bb8-c9e3-4ce1-a57e-b6c4140ea459')
-- Production Project Ref: algorrnjotffcvtinbyy (Supabase Production)
--
-- TARGET DELETION SCOPE:
--   - public.payments:       Exactly 2 rows (Test cash payments totaling 7080 for INV-WAN-20261113-6763)
--   - public.invoice_items:  Exactly 3 rows (Line items totaling 7080 for INV-WAN-20261113-6763)
--   - public.invoices:       Exactly 1 row  (Invoice INV-WAN-20261113-6763, total 7080)
--   - public.guests:         Exactly 41 rows (Exclusively tied to the 32 Wangshi bookings)
--   - public.bookings:       Exactly 32 rows (31 cancelled + 1 checked_out rehearsal)
--
-- STRICT PRESERVATION SCOPE:
--   - 4 Wangshi Rooms (cabf8119, 639e42e6, 1616ce19, 43f18986) -> 100% UNCHANGED
--   - 4 Wangshi Partners (2ccc95f0, 02d301a2, cdee6e82, edcb791a) -> 100% UNCHANGED
--   - 9 Outside Bookings     -> 100% UNCHANGED (bidirectional EXCEPT verified)
--   - 14 Outside Guests      -> 100% UNCHANGED (bidirectional EXCEPT verified)
--   - 4 Outside Invoices     -> 100% UNCHANGED (bidirectional EXCEPT verified)
--   - 4 Outside Line Items   -> 100% UNCHANGED (bidirectional EXCEPT verified)
--   - 7 Outside Payments     -> 100% UNCHANGED (bidirectional EXCEPT verified)
--   - 20 Outside Rooms       -> 100% UNCHANGED (bidirectional EXCEPT verified)
--   - 9 Homestay Properties  -> 100% UNCHANGED (bidirectional EXCEPT verified)
--   - 7 Outside Partners     -> 100% UNCHANGED (bidirectional EXCEPT verified)
--   - 1 Outside Booking Req  -> 100% UNCHANGED (db6bbb72-15e0-463a-a24f-3ffe1ec978a0, The Conclave)
--
-- EXECUTION REQUIREMENT:
--   Must be executed via the SUPABASE DASHBOARD SQL EDITOR (runs as 'postgres' role).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. TIMEOUT GUARDS
-- ------------------------------------------------------------------------------
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ------------------------------------------------------------------------------
-- 1. TRANSACTIONAL TABLE LOCKS
-- Ordered top-down (parent to child) following foreign-key dependency hierarchy.
-- ------------------------------------------------------------------------------
LOCK TABLE public.homestays IN SHARE MODE;
LOCK TABLE public.rooms IN SHARE MODE;
LOCK TABLE public.partners IN SHARE MODE;
LOCK TABLE public.booking_requests IN SHARE MODE;
LOCK TABLE public.bookings IN EXCLUSIVE MODE;
LOCK TABLE public.guests IN EXCLUSIVE MODE;
LOCK TABLE public.invoices IN EXCLUSIVE MODE;
LOCK TABLE public.invoice_items IN EXCLUSIVE MODE;
LOCK TABLE public.payments IN ACCESS EXCLUSIVE MODE;

-- ------------------------------------------------------------------------------
-- 2. TEMPORARY TABLES FOR BASELINE SNAPSHOTS & AUDIT METRICS
-- ------------------------------------------------------------------------------
CREATE TEMP TABLE IF NOT EXISTS _cleanup_metrics (
    step TEXT PRIMARY KEY,
    affected_rows INTEGER NOT NULL
) ON COMMIT DROP;
TRUNCATE TABLE _cleanup_metrics;

CREATE TEMP TABLE IF NOT EXISTS _trigger_state (
    tgname TEXT PRIMARY KEY,
    orig_state TEXT NOT NULL
) ON COMMIT DROP;
TRUNCATE TABLE _trigger_state;

-- Capture exact configuration of the 4 Wangshi rooms before deletion
CREATE TEMP TABLE _baseline_wangshi_rooms ON COMMIT DROP AS
SELECT * FROM public.rooms WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

-- Capture exact configuration of the 4 Wangshi partners before deletion
CREATE TEMP TABLE _baseline_wangshi_partners ON COMMIT DROP AS
SELECT * FROM public.partners WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

-- Capture all non-Wangshi records across all tables
CREATE TEMP TABLE _baseline_outside_homestays ON COMMIT DROP AS
SELECT * FROM public.homestays WHERE id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

CREATE TEMP TABLE _baseline_outside_rooms ON COMMIT DROP AS
SELECT * FROM public.rooms WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

CREATE TEMP TABLE _baseline_outside_partners ON COMMIT DROP AS
SELECT * FROM public.partners WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

CREATE TEMP TABLE _baseline_outside_bookings ON COMMIT DROP AS
SELECT * FROM public.bookings WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

CREATE TEMP TABLE _baseline_outside_guests ON COMMIT DROP AS
SELECT * FROM public.guests WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

CREATE TEMP TABLE _baseline_outside_invoices ON COMMIT DROP AS
SELECT * FROM public.invoices WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

CREATE TEMP TABLE _baseline_outside_invoice_items ON COMMIT DROP AS
SELECT * FROM public.invoice_items WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

CREATE TEMP TABLE _baseline_outside_payments ON COMMIT DROP AS
SELECT * FROM public.payments WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

CREATE TEMP TABLE _baseline_outside_booking_requests ON COMMIT DROP AS
SELECT * FROM public.booking_requests WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

-- ------------------------------------------------------------------------------
-- 3. PREFLIGHT BASELINE ASSERTIONS (EXACT RECORD IDENTITIES & VALUES)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_hs_exists BOOLEAN;
    v_wangshi_bookings INTEGER;
    v_wangshi_guests INTEGER;
    v_wangshi_invoices INTEGER;
    v_wangshi_items INTEGER;
    v_wangshi_payments INTEGER;
    v_wangshi_rooms INTEGER;
    v_wangshi_partners INTEGER;
    v_wangshi_requests INTEGER;
    v_outside_bookings INTEGER;
    v_outside_guests INTEGER;
    v_outside_invoices INTEGER;
    v_outside_items INTEGER;
    v_outside_payments INTEGER;
    v_outside_rooms INTEGER;
    v_all_homestays INTEGER;
    v_outside_partners INTEGER;
    v_outside_requests INTEGER;
    v_trg_state TEXT;
BEGIN
    -- 1. Check target homestay existence
    SELECT EXISTS (
        SELECT 1 FROM public.homestays
        WHERE id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459' AND name = 'Wangshi Homestay'
    ) INTO v_hs_exists;

    IF NOT v_hs_exists THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Target homestay Wangshi Homestay (%) does not exist or has unexpected name!', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';
    END IF;

    -- 2. Verify Wangshi exact room identities (4 rooms)
    SELECT COUNT(*) INTO v_wangshi_rooms FROM _baseline_wangshi_rooms;
    IF v_wangshi_rooms <> 4 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected exactly 4 rooms for Wangshi Homestay, found %.', v_wangshi_rooms;
    END IF;

    IF (
        SELECT COUNT(*) FROM public.rooms
        WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
          AND id IN (
              'cabf8119-6326-4d63-994d-3de1cdc33ddc',
              '639e42e6-6421-4333-829c-14f80aed2ebd',
              '1616ce19-da33-439f-8ce3-9aebceb2605a',
              '43f18986-9dd8-4beb-a8e4-0fe27ef686af'
          )
    ) <> 4 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Wangshi room identity mismatch! The exact four audited room IDs do not exist under Wangshi.';
    END IF;

    -- 3. Verify Wangshi exact partner identities (4 partners)
    SELECT COUNT(*) INTO v_wangshi_partners FROM _baseline_wangshi_partners;
    IF v_wangshi_partners <> 4 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected exactly 4 partners for Wangshi Homestay, found %.', v_wangshi_partners;
    END IF;

    IF (
        SELECT COUNT(*) FROM public.partners
        WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
          AND id IN (
              '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf',
              '02d301a2-b643-4b1f-99f1-8de3f1ed96a0',
              'cdee6e82-11a9-4310-9de1-4404c340ec0e',
              'edcb791a-7471-4540-a7fc-a0e5ed8de94b'
          )
    ) <> 4 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Wangshi partner identity mismatch! The exact four audited partner IDs do not exist under Wangshi.';
    END IF;

    -- 4. Verify exact deletion targets (Invoice, Items, Payments)
    -- Verify Invoice exact values
    IF NOT EXISTS (
        SELECT 1 FROM public.invoices
        WHERE id = '55196fbd-e221-4d5b-a55d-3d55b1466382'
          AND homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
          AND invoice_number = 'INV-WAN-20261113-6763'
          AND booking_id = '2c54ddce-1d32-4d0b-8181-edfd37763aa4'
          AND grand_total = 7080
          AND amount_paid = 7080
          AND balance_due = 0
          AND status = 'paid'
    ) THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Target invoice INV-WAN-20261113-6763 (55196fbd-e221-4d5b-a55d-3d55b1466382) does not match expected values!';
    END IF;

    -- Verify Invoice Items exact values
    IF (
        SELECT COUNT(*) FROM public.invoice_items
        WHERE invoice_id = '55196fbd-e221-4d5b-a55d-3d55b1466382'
          AND homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
          AND (
              (id = '1a153644-1727-4445-9842-bca5e3e40139' AND category = 'room' AND amount = 5000 AND quantity = 2 AND rate = 2500 AND description = 'Room No. 1 – 2 Night Stay') OR
              (id = '04ca6461-d8fa-4d88-a7a5-7d61b3810e8f' AND category = 'custom' AND amount = 80 AND quantity = 4 AND rate = 20 AND description = 'Tea') OR
              (id = '47139eee-0273-4782-b1ee-f026ef996b82' AND category = 'custom' AND amount = 2000 AND quantity = 1 AND rate = 2000 AND description = 'Laundry Service')
          )
    ) <> 3 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Target invoice items do not match expected IDs, categories, descriptions, rates, or amounts!';
    END IF;

    -- Verify Payments exact values
    IF (
        SELECT COUNT(*) FROM public.payments
        WHERE invoice_id = '55196fbd-e221-4d5b-a55d-3d55b1466382'
          AND homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
          AND booking_id = '2c54ddce-1d32-4d0b-8181-edfd37763aa4'
          AND payment_method = 'cash'
          AND (
              (id = '4ce40a84-f7a1-4e4f-a206-4dfec4a10139' AND amount = 5000) OR
              (id = '5dfb7d20-3628-455c-929a-d10b34f0250b' AND amount = 2080)
          )
    ) <> 2 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Target payments do not match expected IDs, amounts, or payment methods!';
    END IF;

    -- 5. Verify Wangshi total record counts
    SELECT COUNT(*) INTO v_wangshi_bookings FROM public.bookings WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';
    IF v_wangshi_bookings <> 32 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected exactly 32 bookings for Wangshi Homestay, found %.', v_wangshi_bookings;
    END IF;

    -- Verify all 32 bookings match the audited ID set
    IF (
        SELECT COUNT(*) FROM public.bookings
        WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
          AND id IN ('a7f7abcc-434d-43c1-b3a1-ce4fedcfcdeb', '17cb0bbb-0c6d-4f3e-af9a-ac71e195d222', 'c65fcd6b-0428-4521-8e45-37d68512f795', '82236762-2265-4749-97c8-cfbb2dc0e62f', '0a064075-573e-417d-a047-1f3fadcb7308', '3f0cd2e9-c620-4f43-8e4f-b59688202c77', '1d3ba405-a801-4d86-97bd-6197cf63031f', '25123836-5641-4b4f-8449-b167fa86776f', '45ff7159-b980-41ca-8883-0a60ccb45aad', '812660f3-a9cb-4e11-b789-1db0d3621bd2', '1fc6d0b8-c4a9-487f-9ef4-af12eead3942', '5f067bc9-11c9-4134-b878-c5aa28be3059', '1c237fa9-fa46-4e53-bbce-d013c5972f50', '8360d4f8-fd9b-493f-98e5-e6177b022d18', 'fa20ab92-29ab-4717-b84d-1e48474d79c5', 'e55065f2-51bd-4fc5-ba35-135d846ed4cd', '9bbebbf9-10ff-4679-8c92-a3c667efa2b5', '2d28d1f8-7ea6-45cd-a2b3-d8a30df34065', '8308e192-0f59-4e01-8454-986877a76b49', 'ebb0d7a0-4c1f-4f88-b490-38033eb39e48', '978933be-496b-439e-a143-c11963f96fcb', '2d36a63a-35c8-4840-b36b-f50a134d0194', '51845915-19b8-4f6c-8f95-0ae19f7262b9', '0ea66346-1648-4e38-b9ca-dec456fef7c3', 'd695585f-dc8a-435a-93f5-6207c395d15a', '89fe33fd-3246-4fdd-80f8-c6c7c851b897', '99f3e234-d768-4bbb-9d8a-0b4bb3876364', 'f76f4266-7b0d-4caf-b2aa-4f542265e358', 'd0c94372-9a79-4e60-a92e-0c86e5f270be', '4f270eb0-eba4-49fd-ad92-9f71fb5dac7d', '401e804d-7ede-4ac3-bc94-06972cb6e9e1', '2c54ddce-1d32-4d0b-8181-edfd37763aa4')
    ) <> 32 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: One or more Wangshi bookings do not match the audited 32 booking UUIDs!';
    END IF;

    SELECT COUNT(*) INTO v_wangshi_guests FROM public.guests WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';
    IF v_wangshi_guests <> 41 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected exactly 41 guests for Wangshi Homestay, found %.', v_wangshi_guests;
    END IF;

    -- Verify all 41 guests match the audited ID set
    IF (
        SELECT COUNT(*) FROM public.guests
        WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
          AND id IN ('44563196-11aa-42a2-b6de-aff5e3d90223', 'ec9ea509-14e1-4fba-8c59-f5bbfd6d7bb4', '2cf05bee-49dd-4ad2-b25b-12ca42f34fd7', '739951e7-e2d7-4e01-b465-a1ff16246861', 'fa6aae12-c694-48c2-ac95-407ade016405', '9e213bf2-ee88-4d41-8c65-00f4a17fb4ee', '410d75d5-0dee-4ecd-a3ec-481fd3798d5b', '462a6f85-66f4-4fc2-a41e-7cd61e29f804', 'ff708f57-0d50-4f63-9b56-669bf0552b4b', 'fc30fe1a-1e46-4567-8387-e7b17405367c', 'af478a87-0fd1-491a-9eb7-044e1f94b1fa', 'be0e7a03-f026-46ef-9207-47917c615a41', '07c67cf3-aeba-4611-bb85-dd4e1beed42d', 'dab2e733-80bc-4e1c-9ea7-422f99efc0fd', '94d20567-d0ee-4af9-bd06-dd77a6ae0b34', '28d7f0b5-b5a0-4357-8635-2a049b2491f0', 'f8ea3686-aee8-4720-9027-330eda2664a2', '83f02071-107c-453b-a377-8ccfca3c55aa', '1db13727-4f12-4a74-b201-0c8d69ba0f21', '2aeb682c-fee4-479e-ac7a-ff7b83e29fbe', '3941f417-7b1e-4117-8052-215e8131cff3', '7d29b354-d586-4981-bb80-646ec20fcb95', 'b26900fa-f99f-4d14-929b-98c84dbc87da', 'b2c6f4e0-5886-4c5f-a1f6-e2c80c2541da', '3cbb5429-8504-4394-be45-8c34f5a222e5', '698c838d-584e-4bf1-ba16-8e1ec367400d', '50711bdf-43e0-48f1-895a-4c0e567a9ddf', 'b55ae2bd-b7d6-44f9-a63f-5ef74fec8247', 'a662d24f-a6d7-4a16-8267-48f440bcd650', 'e0be8b82-c821-4d47-8968-ca4039ec2792', '44560e02-f1bb-44b5-a91d-297f44036259', '7acfbfb8-12ad-40e3-b28b-93f9e05b9d2a', '24586028-ef9e-42d9-b2f5-c3ff0cd4e821', '862ad9ac-654e-4cba-a24c-d0d2ade7ab3e', '0862aec8-43bb-48b8-87b9-d54ee6890cea', 'e5c6bad8-bfc6-4afc-a9bf-fb91d0600eda', 'ddbdb0d4-1d25-4c04-91d0-3b6238eeecf6', '491bf1b3-f668-49ee-be28-2484076539d3', 'eafa4347-165b-4a14-85e1-f03195366891', '41be33bd-64fe-4f11-9a43-bb9460d1ecac', 'f2e61d80-dac2-43b0-a90d-87ce923c3c1c')
    ) <> 41 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: One or more Wangshi guests do not match the audited 41 guest UUIDs!';
    END IF;

    SELECT COUNT(*) INTO v_wangshi_requests FROM public.booking_requests WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';
    IF v_wangshi_requests <> 0 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected exactly 0 booking requests for Wangshi Homestay, found %.', v_wangshi_requests;
    END IF;

    -- 6. Verify non-Wangshi baseline counts & preserved records
    SELECT COUNT(*) INTO v_outside_bookings FROM _baseline_outside_bookings;
    IF v_outside_bookings <> 9 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected 9 outside bookings, found %.', v_outside_bookings;
    END IF;

    SELECT COUNT(*) INTO v_outside_guests FROM _baseline_outside_guests;
    IF v_outside_guests <> 14 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected 14 outside guests, found %.', v_outside_guests;
    END IF;

    SELECT COUNT(*) INTO v_outside_invoices FROM _baseline_outside_invoices;
    IF v_outside_invoices <> 4 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected 4 outside invoices, found %.', v_outside_invoices;
    END IF;

    SELECT COUNT(*) INTO v_outside_items FROM _baseline_outside_invoice_items;
    IF v_outside_items <> 4 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected 4 outside invoice items, found %.', v_outside_items;
    END IF;

    SELECT COUNT(*) INTO v_outside_payments FROM _baseline_outside_payments;
    IF v_outside_payments <> 7 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected 7 outside payments, found %.', v_outside_payments;
    END IF;

    SELECT COUNT(*) INTO v_outside_rooms FROM _baseline_outside_rooms;
    IF v_outside_rooms <> 20 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected 20 outside rooms, found %.', v_outside_rooms;
    END IF;

    SELECT COUNT(*) INTO v_all_homestays FROM public.homestays;
    IF v_all_homestays <> 10 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected 10 homestays in database, found %.', v_all_homestays;
    END IF;

    SELECT COUNT(*) INTO v_outside_partners FROM _baseline_outside_partners;
    IF v_outside_partners <> 7 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected 7 outside partners in database, found %.', v_outside_partners;
    END IF;

    SELECT COUNT(*) INTO v_outside_requests FROM _baseline_outside_booking_requests;
    IF v_outside_requests <> 1 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected 1 outside booking request in database, found %.', v_outside_requests;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM _baseline_outside_booking_requests
        WHERE id = 'db6bbb72-15e0-463a-a24f-3ffe1ec978a0'
          AND homestay_id = '3356f10c-cfb7-44af-99bb-c616619bf42a'
    ) THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Preserved outside booking request % (The Conclave) missing!', 'db6bbb72-15e0-463a-a24f-3ffe1ec978a0';
    END IF;

    -- 7. Capture original trigger state of trg_prevent_payment_ledger_mutation
    SELECT t.tgenabled::text INTO v_trg_state
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relname = 'payments'
      AND t.tgname = 'trg_prevent_payment_ledger_mutation';

    IF v_trg_state IS NULL THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Trigger trg_prevent_payment_ledger_mutation not found on public.payments!';
    END IF;

    INSERT INTO _trigger_state (tgname, orig_state)
    VALUES ('trg_prevent_payment_ledger_mutation', v_trg_state);
END $$;

-- ------------------------------------------------------------------------------
-- 4. CONTROLLED DELETION CASCADE (Children first, restricted to Wangshi)
-- ------------------------------------------------------------------------------

-- Step A: Temporarily disable ledger immutability trigger
ALTER TABLE public.payments DISABLE TRIGGER trg_prevent_payment_ledger_mutation;

-- Step B: Delete Wangshi Payments (Exactly 2 rows)
WITH deleted_payments AS (
    DELETE FROM public.payments
    WHERE id IN ('4ce40a84-f7a1-4e4f-a206-4dfec4a10139', '5dfb7d20-3628-455c-929a-d10b34f0250b')
      AND homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    RETURNING 1
)
INSERT INTO _cleanup_metrics (step, affected_rows)
SELECT 'payments', COUNT(*) FROM deleted_payments;

-- Step C: Restore trigger immediately to original state
DO $$
DECLARE
    v_orig_trg_state TEXT;
BEGIN
    SELECT orig_state INTO v_orig_trg_state
    FROM _trigger_state
    WHERE tgname = 'trg_prevent_payment_ledger_mutation';

    IF v_orig_trg_state = 'O' THEN
        ALTER TABLE public.payments ENABLE TRIGGER trg_prevent_payment_ledger_mutation;
    ELSIF v_orig_trg_state = 'D' THEN
        NULL;
    ELSE
        ALTER TABLE public.payments ENABLE TRIGGER trg_prevent_payment_ledger_mutation;
    END IF;
END $$;

-- Step D: Delete Wangshi Invoice Items (Exactly 3 rows)
WITH deleted_items AS (
    DELETE FROM public.invoice_items
    WHERE id IN ('1a153644-1727-4445-9842-bca5e3e40139', '04ca6461-d8fa-4d88-a7a5-7d61b3810e8f', '47139eee-0273-4782-b1ee-f026ef996b82')
      AND homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    RETURNING 1
)
INSERT INTO _cleanup_metrics (step, affected_rows)
SELECT 'invoice_items', COUNT(*) FROM deleted_items;

-- Step E: Delete Wangshi Invoices (Exactly 1 row)
WITH deleted_invoices AS (
    DELETE FROM public.invoices
    WHERE id IN ('55196fbd-e221-4d5b-a55d-3d55b1466382')
      AND homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    RETURNING 1
)
INSERT INTO _cleanup_metrics (step, affected_rows)
SELECT 'invoices', COUNT(*) FROM deleted_invoices;

-- Step F: Delete Wangshi Guests (Exactly 41 rows)
WITH deleted_guests AS (
    DELETE FROM public.guests
    WHERE booking_id IN ('a7f7abcc-434d-43c1-b3a1-ce4fedcfcdeb', '17cb0bbb-0c6d-4f3e-af9a-ac71e195d222', 'c65fcd6b-0428-4521-8e45-37d68512f795', '82236762-2265-4749-97c8-cfbb2dc0e62f', '0a064075-573e-417d-a047-1f3fadcb7308', '3f0cd2e9-c620-4f43-8e4f-b59688202c77', '1d3ba405-a801-4d86-97bd-6197cf63031f', '25123836-5641-4b4f-8449-b167fa86776f', '45ff7159-b980-41ca-8883-0a60ccb45aad', '812660f3-a9cb-4e11-b789-1db0d3621bd2', '1fc6d0b8-c4a9-487f-9ef4-af12eead3942', '5f067bc9-11c9-4134-b878-c5aa28be3059', '1c237fa9-fa46-4e53-bbce-d013c5972f50', '8360d4f8-fd9b-493f-98e5-e6177b022d18', 'fa20ab92-29ab-4717-b84d-1e48474d79c5', 'e55065f2-51bd-4fc5-ba35-135d846ed4cd', '9bbebbf9-10ff-4679-8c92-a3c667efa2b5', '2d28d1f8-7ea6-45cd-a2b3-d8a30df34065', '8308e192-0f59-4e01-8454-986877a76b49', 'ebb0d7a0-4c1f-4f88-b490-38033eb39e48', '978933be-496b-439e-a143-c11963f96fcb', '2d36a63a-35c8-4840-b36b-f50a134d0194', '51845915-19b8-4f6c-8f95-0ae19f7262b9', '0ea66346-1648-4e38-b9ca-dec456fef7c3', 'd695585f-dc8a-435a-93f5-6207c395d15a', '89fe33fd-3246-4fdd-80f8-c6c7c851b897', '99f3e234-d768-4bbb-9d8a-0b4bb3876364', 'f76f4266-7b0d-4caf-b2aa-4f542265e358', 'd0c94372-9a79-4e60-a92e-0c86e5f270be', '4f270eb0-eba4-49fd-ad92-9f71fb5dac7d', '401e804d-7ede-4ac3-bc94-06972cb6e9e1', '2c54ddce-1d32-4d0b-8181-edfd37763aa4')
      AND homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    RETURNING 1
)
INSERT INTO _cleanup_metrics (step, affected_rows)
SELECT 'guests', COUNT(*) FROM deleted_guests;

-- Step G: Delete Wangshi Bookings (Exactly 32 rows)
WITH deleted_bookings AS (
    DELETE FROM public.bookings
    WHERE id IN ('a7f7abcc-434d-43c1-b3a1-ce4fedcfcdeb', '17cb0bbb-0c6d-4f3e-af9a-ac71e195d222', 'c65fcd6b-0428-4521-8e45-37d68512f795', '82236762-2265-4749-97c8-cfbb2dc0e62f', '0a064075-573e-417d-a047-1f3fadcb7308', '3f0cd2e9-c620-4f43-8e4f-b59688202c77', '1d3ba405-a801-4d86-97bd-6197cf63031f', '25123836-5641-4b4f-8449-b167fa86776f', '45ff7159-b980-41ca-8883-0a60ccb45aad', '812660f3-a9cb-4e11-b789-1db0d3621bd2', '1fc6d0b8-c4a9-487f-9ef4-af12eead3942', '5f067bc9-11c9-4134-b878-c5aa28be3059', '1c237fa9-fa46-4e53-bbce-d013c5972f50', '8360d4f8-fd9b-493f-98e5-e6177b022d18', 'fa20ab92-29ab-4717-b84d-1e48474d79c5', 'e55065f2-51bd-4fc5-ba35-135d846ed4cd', '9bbebbf9-10ff-4679-8c92-a3c667efa2b5', '2d28d1f8-7ea6-45cd-a2b3-d8a30df34065', '8308e192-0f59-4e01-8454-986877a76b49', 'ebb0d7a0-4c1f-4f88-b490-38033eb39e48', '978933be-496b-439e-a143-c11963f96fcb', '2d36a63a-35c8-4840-b36b-f50a134d0194', '51845915-19b8-4f6c-8f95-0ae19f7262b9', '0ea66346-1648-4e38-b9ca-dec456fef7c3', 'd695585f-dc8a-435a-93f5-6207c395d15a', '89fe33fd-3246-4fdd-80f8-c6c7c851b897', '99f3e234-d768-4bbb-9d8a-0b4bb3876364', 'f76f4266-7b0d-4caf-b2aa-4f542265e358', 'd0c94372-9a79-4e60-a92e-0c86e5f270be', '4f270eb0-eba4-49fd-ad92-9f71fb5dac7d', '401e804d-7ede-4ac3-bc94-06972cb6e9e1', '2c54ddce-1d32-4d0b-8181-edfd37763aa4')
      AND homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    RETURNING 1
)
INSERT INTO _cleanup_metrics (step, affected_rows)
SELECT 'bookings', COUNT(*) FROM deleted_bookings;

-- ------------------------------------------------------------------------------
-- 5. POSTFLIGHT ASSERTIONS & IMMUTABILITY VERIFICATION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_del_payments INTEGER;
    v_del_items INTEGER;
    v_del_invoices INTEGER;
    v_del_guests INTEGER;
    v_del_bookings INTEGER;
    v_rem_wangshi_bookings INTEGER;
    v_rem_wangshi_guests INTEGER;
    v_rem_wangshi_invoices INTEGER;
    v_rem_wangshi_items INTEGER;
    v_rem_wangshi_payments INTEGER;
    v_rem_wangshi_requests INTEGER;
    v_orig_trg_state TEXT;
    v_curr_trg_state TEXT;
BEGIN
    -- 1. Verify exact counts deleted
    SELECT affected_rows INTO v_del_payments FROM _cleanup_metrics WHERE step = 'payments';
    SELECT affected_rows INTO v_del_items FROM _cleanup_metrics WHERE step = 'invoice_items';
    SELECT affected_rows INTO v_del_invoices FROM _cleanup_metrics WHERE step = 'invoices';
    SELECT affected_rows INTO v_del_guests FROM _cleanup_metrics WHERE step = 'guests';
    SELECT affected_rows INTO v_del_bookings FROM _cleanup_metrics WHERE step = 'bookings';

    IF v_del_payments <> 2 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Expected 2 deleted payments, got %! Rolling back!', v_del_payments;
    END IF;
    IF v_del_items <> 3 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Expected 3 deleted invoice items, got %! Rolling back!', v_del_items;
    END IF;
    IF v_del_invoices <> 1 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Expected 1 deleted invoice, got %! Rolling back!', v_del_invoices;
    END IF;
    IF v_del_guests <> 41 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Expected 41 deleted guests, got %! Rolling back!', v_del_guests;
    END IF;
    IF v_del_bookings <> 32 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Expected 32 deleted bookings, got %! Rolling back!', v_del_bookings;
    END IF;

    -- 2. Verify Wangshi operational tables are now zero for bookings/financials
    SELECT COUNT(*) INTO v_rem_wangshi_bookings FROM public.bookings WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';
    SELECT COUNT(*) INTO v_rem_wangshi_guests FROM public.guests WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';
    SELECT COUNT(*) INTO v_rem_wangshi_invoices FROM public.invoices WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';
    SELECT COUNT(*) INTO v_rem_wangshi_items FROM public.invoice_items WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';
    SELECT COUNT(*) INTO v_rem_wangshi_payments FROM public.payments WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';
    SELECT COUNT(*) INTO v_rem_wangshi_requests FROM public.booking_requests WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

    IF v_rem_wangshi_bookings <> 0 OR v_rem_wangshi_guests <> 0 OR v_rem_wangshi_invoices <> 0 OR
       v_rem_wangshi_items <> 0 OR v_rem_wangshi_payments <> 0 OR v_rem_wangshi_requests <> 0 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Residual Wangshi records detected! Bookings: %, Guests: %, Invoices: %, Items: %, Payments: %, Requests: %',
            v_rem_wangshi_bookings, v_rem_wangshi_guests, v_rem_wangshi_invoices,
            v_rem_wangshi_items, v_rem_wangshi_payments, v_rem_wangshi_requests;
    END IF;

    -- 3. Verify Wangshi rooms and partners remain 100% intact (Deep EXCEPT)
    IF EXISTS (
        SELECT * FROM _baseline_wangshi_rooms
        EXCEPT
        SELECT * FROM public.rooms WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) OR EXISTS (
        SELECT * FROM public.rooms WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
        EXCEPT
        SELECT * FROM _baseline_wangshi_rooms
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Wangshi rooms were altered or corrupted! Rolling back!';
    END IF;

    IF EXISTS (
        SELECT * FROM _baseline_wangshi_partners
        EXCEPT
        SELECT * FROM public.partners WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) OR EXISTS (
        SELECT * FROM public.partners WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
        EXCEPT
        SELECT * FROM _baseline_wangshi_partners
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Wangshi partners were altered or corrupted! Rolling back!';
    END IF;

    -- 4. Verify all non-Wangshi tables remain 100% untouched (Deep bidirectional EXCEPT)
    -- Homestays
    IF EXISTS (
        SELECT * FROM _baseline_outside_homestays
        EXCEPT
        SELECT * FROM public.homestays WHERE id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) OR EXISTS (
        SELECT * FROM public.homestays WHERE id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
        EXCEPT
        SELECT * FROM _baseline_outside_homestays
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Outside homestays were altered! Rolling back!';
    END IF;

    -- Rooms
    IF EXISTS (
        SELECT * FROM _baseline_outside_rooms
        EXCEPT
        SELECT * FROM public.rooms WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) OR EXISTS (
        SELECT * FROM public.rooms WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
        EXCEPT
        SELECT * FROM _baseline_outside_rooms
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Outside rooms were altered! Rolling back!';
    END IF;

    -- Partners
    IF EXISTS (
        SELECT * FROM _baseline_outside_partners
        EXCEPT
        SELECT * FROM public.partners WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) OR EXISTS (
        SELECT * FROM public.partners WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
        EXCEPT
        SELECT * FROM _baseline_outside_partners
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Outside partners were altered! Rolling back!';
    END IF;

    -- Bookings
    IF EXISTS (
        SELECT * FROM _baseline_outside_bookings
        EXCEPT
        SELECT * FROM public.bookings WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) OR EXISTS (
        SELECT * FROM public.bookings WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
        EXCEPT
        SELECT * FROM _baseline_outside_bookings
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Outside bookings were altered! Rolling back!';
    END IF;

    -- Guests
    IF EXISTS (
        SELECT * FROM _baseline_outside_guests
        EXCEPT
        SELECT * FROM public.guests WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) OR EXISTS (
        SELECT * FROM public.guests WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
        EXCEPT
        SELECT * FROM _baseline_outside_guests
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Outside guests were altered! Rolling back!';
    END IF;

    -- Invoices
    IF EXISTS (
        SELECT * FROM _baseline_outside_invoices
        EXCEPT
        SELECT * FROM public.invoices WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) OR EXISTS (
        SELECT * FROM public.invoices WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
        EXCEPT
        SELECT * FROM _baseline_outside_invoices
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Outside invoices were altered! Rolling back!';
    END IF;

    -- Invoice Items
    IF EXISTS (
        SELECT * FROM _baseline_outside_invoice_items
        EXCEPT
        SELECT * FROM public.invoice_items WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) OR EXISTS (
        SELECT * FROM public.invoice_items WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
        EXCEPT
        SELECT * FROM _baseline_outside_invoice_items
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Outside invoice items were altered! Rolling back!';
    END IF;

    -- Payments
    IF EXISTS (
        SELECT * FROM _baseline_outside_payments
        EXCEPT
        SELECT * FROM public.payments WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) OR EXISTS (
        SELECT * FROM public.payments WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
        EXCEPT
        SELECT * FROM _baseline_outside_payments
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Outside payments were altered! Rolling back!';
    END IF;

    -- Booking Requests (1 request at The Conclave)
    IF NOT EXISTS (
        SELECT 1 FROM public.booking_requests
        WHERE id = 'db6bbb72-15e0-463a-a24f-3ffe1ec978a0'
          AND homestay_id = '3356f10c-cfb7-44af-99bb-c616619bf42a'
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Preserved outside booking request % (The Conclave) missing or altered!', 'db6bbb72-15e0-463a-a24f-3ffe1ec978a0';
    END IF;

    IF EXISTS (
        SELECT * FROM _baseline_outside_booking_requests
        EXCEPT
        SELECT * FROM public.booking_requests WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) OR EXISTS (
        SELECT * FROM public.booking_requests WHERE homestay_id IS DISTINCT FROM 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
        EXCEPT
        SELECT * FROM _baseline_outside_booking_requests
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Outside booking requests were altered or corrupted! Rolling back!';
    END IF;

    -- 5. Verify trigger is restored to exact original state
    SELECT orig_state INTO v_orig_trg_state
    FROM _trigger_state
    WHERE tgname = 'trg_prevent_payment_ledger_mutation';

    SELECT t.tgenabled::text INTO v_curr_trg_state
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relname = 'payments'
      AND t.tgname = 'trg_prevent_payment_ledger_mutation';

    IF v_curr_trg_state IS DISTINCT FROM v_orig_trg_state THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Trigger trg_prevent_payment_ledger_mutation state mismatch! Expected "%", found "%". Rolling back!',
            v_orig_trg_state, v_curr_trg_state;
    END IF;

    RAISE NOTICE '========================================================================';
    RAISE NOTICE 'HARDENED CLEANUP TRANSACTION VERIFIED:';
    RAISE NOTICE '  - Exactly 2 Payments deleted (Total ₹7,080 for INV-WAN-20261113-6763)';
    RAISE NOTICE '  - Exactly 3 Invoice Items deleted (Room ₹5,000, Tea ₹80, Laundry ₹2,000)';
    RAISE NOTICE '  - Exactly 1 Invoice deleted (INV-WAN-20261113-6763, Total ₹7,080)';
    RAISE NOTICE '  - Exactly 41 Guests deleted';
    RAISE NOTICE '  - Exactly 32 Bookings deleted';
    RAISE NOTICE '  - 4 Wangshi rooms verified 100%% unchanged (IDs & config)';
    RAISE NOTICE '  - 4 Wangshi partners verified 100%% unchanged (IDs & config)';
    RAISE NOTICE '  - 1 Outside booking request verified 100%% unchanged (0 in Wangshi)';
    RAISE NOTICE '  - All 9 outside homestays, 20 rooms, 7 partners verified 100%% unchanged';
    RAISE NOTICE '  - All 9 outside bookings, 14 guests, 4 invoices, 7 payments verified 100%% unchanged';
    RAISE NOTICE '  - trg_prevent_payment_ledger_mutation restored to exact original state ("%")', v_curr_trg_state;
    RAISE NOTICE '========================================================================';
END $$;

COMMIT;
