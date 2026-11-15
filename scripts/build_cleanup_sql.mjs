import fs from "fs";
import path from "path";

const auditData = JSON.parse(fs.readFileSync("scripts/wangshi_audit_data.json", "utf8"));

const WANGSHI_ID = "ce603bb8-c9e3-4ce1-a57e-b6c4140ea459";
const bookingIds = auditData.bookingsDetailed.map(b => b.id);
const invoiceIds = auditData.invoices.map(i => i.id);
const paymentIds = auditData.payments.map(p => p.id);
const invoiceItemIds = auditData.invoiceItems.map(it => it.id);

function generateHardenedCleanupSQL() {
  const sql = `-- ==============================================================================
-- WANGSHI HOMESTAY: PRODUCTION TEST DATA CLEANUP SCRIPT (HARDENED)
-- Target Homestay: Wangshi Homestay ('ce603bb8-c9e3-4ce1-a57e-b6c4140ea459')
-- Project Reference: algorrnjotffcvtinbyy (Supabase Production)
--
-- TARGET DELETION COUNTS:
--   - public.payments:       Exactly 2 rows (Test cash payments for INV-WAN-20261113-6763)
--   - public.invoice_items:  Exactly 3 rows (Line items for INV-WAN-20261113-6763)
--   - public.invoices:       Exactly 1 row  (Invoice INV-WAN-20261113-6763)
--   - public.guests:         Exactly 41 rows (Exclusively tied to the 32 Wangshi bookings)
--   - public.bookings:       Exactly 32 rows (31 cancelled + 1 checked_out rehearsal)
--
-- STRICT PRESERVATION GUARANTEES:
--   1. 4 Wangshi Rooms (cabf8119, 639e42e6, 1616ce19, 43f18986) remain 100% unchanged.
--   2. 4 Wangshi Partners (UG Marketing, Riya Sharma, DEV chuchi, WANGSHI) remain 100% unchanged.
--   3. ALL non-Wangshi records verified byte-for-byte unchanged via bidirectional EXCEPT:
--      - 9 outside bookings
--      - 14 outside guests
--      - 4 outside invoices
--      - 4 outside invoice line items
--      - 7 outside payments
--      - 20 outside rooms
--      - 9 homestays
--      - 7 outside partners
--      - 1 outside booking request
--   4. Trigger 'trg_prevent_payment_ledger_mutation' original state captured and restored.
--
-- TRANSACTION LOCKING STRATEGY:
--   - public.payments: ACCESS EXCLUSIVE (required for ALTER TABLE ... DISABLE/ENABLE TRIGGER).
--   - public.invoice_items, public.invoices, public.guests, public.bookings: EXCLUSIVE
--     (blocks concurrent writes/updates/deletes while permitting concurrent SELECT).
--   - public.rooms, public.partners, public.homestays, public.booking_requests: SHARE
--     (ensures zero concurrent mutations to configuration tables while permitting concurrent SELECT).
--
-- EXECUTION REQUIREMENT:
--   Must be executed via the SUPABASE SQL EDITOR (runs as 'postgres' role, table owner).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. TRANSACTIONAL TABLE LOCKS
-- Deterministic lock order avoids deadlocks; blocks concurrent modifications.
-- ------------------------------------------------------------------------------
LOCK TABLE public.payments IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.invoice_items, public.invoices, public.guests, public.bookings IN EXCLUSIVE MODE;
LOCK TABLE public.rooms, public.partners, public.homestays, public.booking_requests IN SHARE MODE;

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
SELECT * FROM public.rooms WHERE homestay_id = '${WANGSHI_ID}';

-- Capture exact configuration of the 4 Wangshi partners before deletion
CREATE TEMP TABLE _baseline_wangshi_partners ON COMMIT DROP AS
SELECT * FROM public.partners WHERE homestay_id = '${WANGSHI_ID}';

-- Capture full snapshots of all non-Wangshi data to assert exact byte-for-byte immutability
CREATE TEMP TABLE _baseline_outside_bookings ON COMMIT DROP AS
SELECT * FROM public.bookings WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}';

CREATE TEMP TABLE _baseline_outside_guests ON COMMIT DROP AS
SELECT * FROM public.guests WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}';

CREATE TEMP TABLE _baseline_outside_invoices ON COMMIT DROP AS
SELECT * FROM public.invoices WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}';

CREATE TEMP TABLE _baseline_outside_invoice_items ON COMMIT DROP AS
SELECT * FROM public.invoice_items WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}';

CREATE TEMP TABLE _baseline_outside_payments ON COMMIT DROP AS
SELECT * FROM public.payments WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}';

CREATE TEMP TABLE _baseline_outside_rooms ON COMMIT DROP AS
SELECT * FROM public.rooms WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}';

CREATE TEMP TABLE _baseline_all_homestays ON COMMIT DROP AS
SELECT * FROM public.homestays;

CREATE TEMP TABLE _baseline_outside_partners ON COMMIT DROP AS
SELECT * FROM public.partners WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}';

CREATE TEMP TABLE _baseline_all_booking_requests ON COMMIT DROP AS
SELECT * FROM public.booking_requests;

-- ------------------------------------------------------------------------------
-- 3. PREFLIGHT BASELINE ASSERTIONS & TRIGGER STATE CAPTURE
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
    v_outside_bookings INTEGER;
    v_outside_guests INTEGER;
    v_outside_invoices INTEGER;
    v_outside_items INTEGER;
    v_outside_payments INTEGER;
    v_outside_rooms INTEGER;
    v_all_homestays INTEGER;
    v_outside_partners INTEGER;
    v_all_requests INTEGER;
    v_trg_state TEXT;
BEGIN
    -- 1. Check target homestay existence
    SELECT EXISTS (
        SELECT 1 FROM public.homestays 
        WHERE id = '${WANGSHI_ID}' AND name = 'Wangshi Homestay'
    ) INTO v_hs_exists;

    IF NOT v_hs_exists THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Target homestay Wangshi Homestay (%) does not exist or has unexpected name!', '${WANGSHI_ID}';
    END IF;

    -- 2. Verify Wangshi baseline counts
    SELECT COUNT(*) INTO v_wangshi_bookings FROM public.bookings WHERE homestay_id = '${WANGSHI_ID}';
    IF v_wangshi_bookings <> 32 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected exactly 32 bookings for Wangshi Homestay, found %.', v_wangshi_bookings;
    END IF;

    SELECT COUNT(*) INTO v_wangshi_guests FROM public.guests WHERE homestay_id = '${WANGSHI_ID}';
    IF v_wangshi_guests <> 41 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected exactly 41 guests for Wangshi Homestay, found %.', v_wangshi_guests;
    END IF;

    SELECT COUNT(*) INTO v_wangshi_invoices FROM public.invoices WHERE homestay_id = '${WANGSHI_ID}';
    IF v_wangshi_invoices <> 1 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected exactly 1 invoice for Wangshi Homestay, found %.', v_wangshi_invoices;
    END IF;

    SELECT COUNT(*) INTO v_wangshi_items FROM public.invoice_items WHERE homestay_id = '${WANGSHI_ID}';
    IF v_wangshi_items <> 3 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected exactly 3 invoice items for Wangshi Homestay, found %.', v_wangshi_items;
    END IF;

    SELECT COUNT(*) INTO v_wangshi_payments FROM public.payments WHERE homestay_id = '${WANGSHI_ID}';
    IF v_wangshi_payments <> 2 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected exactly 2 payments for Wangshi Homestay, found %.', v_wangshi_payments;
    END IF;

    SELECT COUNT(*) INTO v_wangshi_rooms FROM _baseline_wangshi_rooms;
    IF v_wangshi_rooms <> 4 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected exactly 4 rooms for Wangshi Homestay, found %.', v_wangshi_rooms;
    END IF;

    SELECT COUNT(*) INTO v_wangshi_partners FROM _baseline_wangshi_partners;
    IF v_wangshi_partners <> 4 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected exactly 4 partners for Wangshi Homestay, found %.', v_wangshi_partners;
    END IF;

    -- 3. Verify non-Wangshi baseline counts
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

    SELECT COUNT(*) INTO v_all_homestays FROM _baseline_all_homestays;
    IF v_all_homestays <> 9 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected 9 homestays in total, found %.', v_all_homestays;
    END IF;

    SELECT COUNT(*) INTO v_outside_partners FROM _baseline_outside_partners;
    IF v_outside_partners <> 7 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected 7 outside partners, found %.', v_outside_partners;
    END IF;

    SELECT COUNT(*) INTO v_all_requests FROM _baseline_all_booking_requests;
    IF v_all_requests <> 1 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected 1 total booking request in database, found %.', v_all_requests;
    END IF;

    -- 4. Capture original trigger state of trg_prevent_payment_ledger_mutation
    SELECT t.tgenabled::text INTO v_trg_state
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' 
      AND c.relname = 'payments' 
      AND t.tgname = 'trg_prevent_payment_ledger_mutation';

    IF v_trg_state IS NULL THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Trigger trg_prevent_payment_ledger_mutation on public.payments does not exist!';
    END IF;

    IF v_trg_state = 'D' THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Trigger trg_prevent_payment_ledger_mutation is unexpectedly already disabled in production (status: D)!';
    END IF;

    INSERT INTO _trigger_state (tgname, orig_state)
    VALUES ('trg_prevent_payment_ledger_mutation', v_trg_state);

    RAISE NOTICE 'Preflight Passed: Baseline counts & original trigger state ("%") captured.', v_trg_state;
END $$;

-- ------------------------------------------------------------------------------
-- STEP 1: Delete public.payments (2 rows)
-- Temporarily disable trg_prevent_payment_ledger_mutation, delete, and restore exact state.
-- ------------------------------------------------------------------------------
ALTER TABLE public.payments DISABLE TRIGGER trg_prevent_payment_ledger_mutation;

WITH deleted_payments AS (
    DELETE FROM public.payments
    WHERE id IN (
${paymentIds.map(id => `        '${id}'`).join(",\n")}
    )
    AND homestay_id = '${WANGSHI_ID}'
    RETURNING 1
)
INSERT INTO _cleanup_metrics (step, affected_rows)
SELECT 'payments', COUNT(*) FROM deleted_payments;

-- Dynamically restore exact original trigger state
DO $$
DECLARE
    v_orig TEXT;
BEGIN
    SELECT orig_state INTO v_orig FROM _trigger_state WHERE tgname = 'trg_prevent_payment_ledger_mutation';
    IF v_orig = 'O' THEN
        ALTER TABLE public.payments ENABLE TRIGGER trg_prevent_payment_ledger_mutation;
    ELSIF v_orig = 'A' THEN
        ALTER TABLE public.payments ENABLE ALWAYS TRIGGER trg_prevent_payment_ledger_mutation;
    ELSIF v_orig = 'R' THEN
        ALTER TABLE public.payments ENABLE REPLICA TRIGGER trg_prevent_payment_ledger_mutation;
    ELSE
        RAISE EXCEPTION 'UNEXPECTED TRIGGER STATE: Cannot restore trigger state "%"!', v_orig;
    END IF;
END $$;

-- Assertion Gateway 1: Payments
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT affected_rows INTO v_count FROM _cleanup_metrics WHERE step = 'payments';
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'SAFETY ASSERTION FAILED: Expected 2 deleted payments, but deleted % rows. Transaction rolled back!', v_count;
    END IF;
    RAISE NOTICE 'Step 1 Passed: Exactly % payments deleted and ledger trigger safely restored to original state.', v_count;
END $$;

-- ------------------------------------------------------------------------------
-- STEP 2: Delete public.invoice_items (3 rows)
-- (Dependent FK: invoice_items.invoice_id -> invoices.id)
-- ------------------------------------------------------------------------------
WITH deleted_items AS (
    DELETE FROM public.invoice_items
    WHERE id IN (
${invoiceItemIds.map(id => `        '${id}'`).join(",\n")}
    )
    AND homestay_id = '${WANGSHI_ID}'
    RETURNING 1
)
INSERT INTO _cleanup_metrics (step, affected_rows)
SELECT 'invoice_items', COUNT(*) FROM deleted_items;

-- Assertion Gateway 2: Invoice Items
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT affected_rows INTO v_count FROM _cleanup_metrics WHERE step = 'invoice_items';
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'SAFETY ASSERTION FAILED: Expected 3 deleted invoice_items, but deleted % rows. Transaction rolled back!', v_count;
    END IF;
    RAISE NOTICE 'Step 2 Passed: Exactly % invoice_items deleted.', v_count;
END $$;

-- ------------------------------------------------------------------------------
-- STEP 3: Delete public.invoices (1 row)
-- (Dependent FK: invoices.booking_id -> bookings.id)
-- ------------------------------------------------------------------------------
WITH deleted_invoices AS (
    DELETE FROM public.invoices
    WHERE id IN (
${invoiceIds.map(id => `        '${id}'`).join(",\n")}
    )
    AND homestay_id = '${WANGSHI_ID}'
    RETURNING 1
)
INSERT INTO _cleanup_metrics (step, affected_rows)
SELECT 'invoices', COUNT(*) FROM deleted_invoices;

-- Assertion Gateway 3: Invoices
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT affected_rows INTO v_count FROM _cleanup_metrics WHERE step = 'invoices';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'SAFETY ASSERTION FAILED: Expected 1 deleted invoice, but deleted % rows. Transaction rolled back!', v_count;
    END IF;
    RAISE NOTICE 'Step 3 Passed: Exactly % invoice deleted.', v_count;
END $$;

-- ------------------------------------------------------------------------------
-- STEP 4: Delete public.guests (41 rows)
-- (Dependent FK: guests.booking_id -> bookings.id)
-- ------------------------------------------------------------------------------
WITH deleted_guests AS (
    DELETE FROM public.guests
    WHERE booking_id IN (
${bookingIds.map(id => `        '${id}'`).join(",\n")}
    )
    AND homestay_id = '${WANGSHI_ID}'
    RETURNING 1
)
INSERT INTO _cleanup_metrics (step, affected_rows)
SELECT 'guests', COUNT(*) FROM deleted_guests;

-- Assertion Gateway 4: Guests
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT affected_rows INTO v_count FROM _cleanup_metrics WHERE step = 'guests';
    IF v_count <> 41 THEN
        RAISE EXCEPTION 'SAFETY ASSERTION FAILED: Expected 41 deleted guests, but deleted % rows. Transaction rolled back!', v_count;
    END IF;
    RAISE NOTICE 'Step 4 Passed: Exactly % guests deleted.', v_count;
END $$;

-- ------------------------------------------------------------------------------
-- STEP 5: Delete public.bookings (32 rows)
-- (Target bookings table for Wangshi Homestay)
-- ------------------------------------------------------------------------------
WITH deleted_bookings AS (
    DELETE FROM public.bookings
    WHERE id IN (
${bookingIds.map(id => `        '${id}'`).join(",\n")}
    )
    AND homestay_id = '${WANGSHI_ID}'
    RETURNING 1
)
INSERT INTO _cleanup_metrics (step, affected_rows)
SELECT 'bookings', COUNT(*) FROM deleted_bookings;

-- Assertion Gateway 5: Bookings
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT affected_rows INTO v_count FROM _cleanup_metrics WHERE step = 'bookings';
    IF v_count <> 32 THEN
        RAISE EXCEPTION 'SAFETY ASSERTION FAILED: Expected 32 deleted bookings, but deleted % rows. Transaction rolled back!', v_count;
    END IF;
    RAISE NOTICE 'Step 5 Passed: Exactly % bookings deleted.', v_count;
END $$;

-- ------------------------------------------------------------------------------
-- FINAL INTEGRITY VERIFICATION BEFORE COMMIT (DEEP BIDIRECTIONAL ASSERTIONS)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_rem_wangshi_bookings INTEGER;
    v_rem_wangshi_guests INTEGER;
    v_rem_wangshi_invoices INTEGER;
    v_rem_wangshi_items INTEGER;
    v_rem_wangshi_payments INTEGER;
    v_rem_wangshi_rooms INTEGER;
    v_rem_wangshi_partners INTEGER;
    v_orig_trg_state TEXT;
    v_curr_trg_state TEXT;
BEGIN
    -- 1. Verify Wangshi has 0 scrap bookings/financials remaining
    SELECT COUNT(*) INTO v_rem_wangshi_bookings FROM public.bookings WHERE homestay_id = '${WANGSHI_ID}';
    SELECT COUNT(*) INTO v_rem_wangshi_guests FROM public.guests WHERE homestay_id = '${WANGSHI_ID}';
    SELECT COUNT(*) INTO v_rem_wangshi_invoices FROM public.invoices WHERE homestay_id = '${WANGSHI_ID}';
    SELECT COUNT(*) INTO v_rem_wangshi_items FROM public.invoice_items WHERE homestay_id = '${WANGSHI_ID}';
    SELECT COUNT(*) INTO v_rem_wangshi_payments FROM public.payments WHERE homestay_id = '${WANGSHI_ID}';

    IF v_rem_wangshi_bookings <> 0 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Wangshi bookings remaining: % (expected 0). Rolling back!', v_rem_wangshi_bookings;
    END IF;
    IF v_rem_wangshi_guests <> 0 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Wangshi guests remaining: % (expected 0). Rolling back!', v_rem_wangshi_guests;
    END IF;
    IF v_rem_wangshi_invoices <> 0 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Wangshi invoices remaining: % (expected 0). Rolling back!', v_rem_wangshi_invoices;
    END IF;
    IF v_rem_wangshi_items <> 0 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Wangshi invoice items remaining: % (expected 0). Rolling back!', v_rem_wangshi_items;
    END IF;
    IF v_rem_wangshi_payments <> 0 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Wangshi payments remaining: % (expected 0). Rolling back!', v_rem_wangshi_payments;
    END IF;

    -- 2. Verify Wangshi rooms remain 100% unchanged (byte-for-byte configuration check)
    SELECT COUNT(*) INTO v_rem_wangshi_rooms FROM public.rooms WHERE homestay_id = '${WANGSHI_ID}';
    IF v_rem_wangshi_rooms <> 4 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Wangshi room count altered! Expected 4, found %. Rolling back!', v_rem_wangshi_rooms;
    END IF;

    IF EXISTS (
        SELECT * FROM _baseline_wangshi_rooms
        EXCEPT
        SELECT * FROM public.rooms WHERE homestay_id = '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.rooms WHERE homestay_id = '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_wangshi_rooms
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Wangshi room configuration was modified during cleanup! Rolling back!';
    END IF;

    -- 3. Verify Wangshi partner profiles remain 100% unchanged (byte-for-byte check)
    SELECT COUNT(*) INTO v_rem_wangshi_partners FROM public.partners WHERE homestay_id = '${WANGSHI_ID}';
    IF v_rem_wangshi_partners <> 4 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Wangshi partner count altered! Expected 4, found %. Rolling back!', v_rem_wangshi_partners;
    END IF;

    IF EXISTS (
        SELECT * FROM _baseline_wangshi_partners
        EXCEPT
        SELECT * FROM public.partners WHERE homestay_id = '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.partners WHERE homestay_id = '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_wangshi_partners
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Wangshi partner profiles were modified during cleanup! Rolling back!';
    END IF;

    -- 4. Verify ALL non-Wangshi records remain 100% unchanged (Bidirectional EXCEPT checks)
    -- Bookings (9 rows)
    IF EXISTS (
        SELECT * FROM _baseline_outside_bookings
        EXCEPT
        SELECT * FROM public.bookings WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.bookings WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_outside_bookings
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Non-Wangshi bookings were altered or corrupted! Rolling back!';
    END IF;

    -- Guests (14 rows)
    IF EXISTS (
        SELECT * FROM _baseline_outside_guests
        EXCEPT
        SELECT * FROM public.guests WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.guests WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_outside_guests
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Non-Wangshi guests were altered or corrupted! Rolling back!';
    END IF;

    -- Invoices (4 rows)
    IF EXISTS (
        SELECT * FROM _baseline_outside_invoices
        EXCEPT
        SELECT * FROM public.invoices WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.invoices WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_outside_invoices
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Non-Wangshi invoices were altered or corrupted! Rolling back!';
    END IF;

    -- Invoice Line Items (4 rows)
    IF EXISTS (
        SELECT * FROM _baseline_outside_invoice_items
        EXCEPT
        SELECT * FROM public.invoice_items WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.invoice_items WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_outside_invoice_items
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Non-Wangshi invoice line items were altered or corrupted! Rolling back!';
    END IF;

    -- Payments (7 rows)
    IF EXISTS (
        SELECT * FROM _baseline_outside_payments
        EXCEPT
        SELECT * FROM public.payments WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.payments WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_outside_payments
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Non-Wangshi payments were altered or corrupted! Rolling back!';
    END IF;

    -- Rooms (20 rows)
    IF EXISTS (
        SELECT * FROM _baseline_outside_rooms
        EXCEPT
        SELECT * FROM public.rooms WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.rooms WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_outside_rooms
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Non-Wangshi rooms were altered or corrupted! Rolling back!';
    END IF;

    -- Homestays (9 properties)
    IF EXISTS (
        SELECT * FROM _baseline_all_homestays
        EXCEPT
        SELECT * FROM public.homestays
    ) OR EXISTS (
        SELECT * FROM public.homestays
        EXCEPT
        SELECT * FROM _baseline_all_homestays
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Homestay property records were altered or corrupted! Rolling back!';
    END IF;

    -- Partners (7 outside partners)
    IF EXISTS (
        SELECT * FROM _baseline_outside_partners
        EXCEPT
        SELECT * FROM public.partners WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.partners WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_outside_partners
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Non-Wangshi partner profiles were altered or corrupted! Rolling back!';
    END IF;

    -- Booking Requests (1 request)
    IF EXISTS (
        SELECT * FROM _baseline_all_booking_requests
        EXCEPT
        SELECT * FROM public.booking_requests
    ) OR EXISTS (
        SELECT * FROM public.booking_requests
        EXCEPT
        SELECT * FROM _baseline_all_booking_requests
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Booking requests were altered or corrupted! Rolling back!';
    END IF;

    -- 5. Verify trigger is restored to exact original state
    SELECT orig_state INTO v_orig_trg_state FROM _trigger_state WHERE tgname = 'trg_prevent_payment_ledger_mutation';

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
    RAISE NOTICE '  - Exactly 2 Payments deleted';
    RAISE NOTICE '  - Exactly 3 Invoice Items deleted';
    RAISE NOTICE '  - Exactly 1 Invoice deleted';
    RAISE NOTICE '  - Exactly 41 Guests deleted';
    RAISE NOTICE '  - Exactly 32 Bookings deleted';
    RAISE NOTICE '  - 4 Wangshi rooms verified 100%% unchanged';
    RAISE NOTICE '  - 4 Wangshi partners verified 100%% unchanged';
    RAISE NOTICE '  - All 9 outside homestays, 20 rooms, 7 partners verified 100%% unchanged';
    RAISE NOTICE '  - All 9 outside bookings, 14 guests, 4 invoices, 7 payments verified 100%% unchanged';
    RAISE NOTICE '  - trg_prevent_payment_ledger_mutation restored to exact original state ("%")';
    RAISE NOTICE '========================================================================';
END $$;

COMMIT;
`;
  return sql;
}

const hardenedSql = generateHardenedCleanupSQL();
fs.writeFileSync("scripts/cleanup_wangshi_test_data.sql", hardenedSql, "utf8");
console.log("Hardened cleanup SQL generated and written to scripts/cleanup_wangshi_test_data.sql");
