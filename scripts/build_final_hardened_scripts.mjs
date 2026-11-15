import fs from "fs";
import path from "path";

const snapshot = JSON.parse(fs.readFileSync("scripts/production_raw_snapshot.json", "utf8"));
const WANGSHI_ID = "ce603bb8-c9e3-4ce1-a57e-b6c4140ea459";
const CONCLAVE_REQ_ID = "db6bbb72-15e0-463a-a24f-3ffe1ec978a0";
const CONCLAVE_HS_ID = "3356f10c-cfb7-44af-99bb-c616619bf42a";

function escapeSql(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return val.toString();
  return `'${val.toString().replace(/'/g, "''")}'`;
}

// -----------------------------------------------------------------------------
// 1. GENERATE CLEANUP SQL
// -----------------------------------------------------------------------------
function generateCleanupSQL() {
  const bookingIds = snapshot.bookings.map(b => b.id);
  const guestIds = snapshot.guests.map(g => g.id);
  const invoiceIds = snapshot.invoices.map(i => i.id);
  const paymentIds = snapshot.payments.map(p => p.id);
  const invoiceItemIds = snapshot.invoiceItems.map(it => it.id);

  return `-- ==============================================================================
-- WANGSHI HOMESTAY: PRODUCTION TEST DATA CLEANUP SCRIPT (FINAL AUDITED & HARDENED)
-- Target Homestay: Wangshi Homestay ('${WANGSHI_ID}')
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
SELECT * FROM public.rooms WHERE homestay_id = '${WANGSHI_ID}';

-- Capture exact configuration of the 4 Wangshi partners before deletion
CREATE TEMP TABLE _baseline_wangshi_partners ON COMMIT DROP AS
SELECT * FROM public.partners WHERE homestay_id = '${WANGSHI_ID}';

-- Capture all non-Wangshi records across all tables
CREATE TEMP TABLE _baseline_outside_homestays ON COMMIT DROP AS
SELECT * FROM public.homestays WHERE id IS DISTINCT FROM '${WANGSHI_ID}';

CREATE TEMP TABLE _baseline_outside_rooms ON COMMIT DROP AS
SELECT * FROM public.rooms WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}';

CREATE TEMP TABLE _baseline_outside_partners ON COMMIT DROP AS
SELECT * FROM public.partners WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}';

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

CREATE TEMP TABLE _baseline_outside_booking_requests ON COMMIT DROP AS
SELECT * FROM public.booking_requests WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}';

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
        WHERE id = '${WANGSHI_ID}' AND name = 'Wangshi Homestay'
    ) INTO v_hs_exists;

    IF NOT v_hs_exists THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Target homestay Wangshi Homestay (%) does not exist or has unexpected name!', '${WANGSHI_ID}';
    END IF;

    -- 2. Verify Wangshi exact room identities (4 rooms)
    SELECT COUNT(*) INTO v_wangshi_rooms FROM _baseline_wangshi_rooms;
    IF v_wangshi_rooms <> 4 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected exactly 4 rooms for Wangshi Homestay, found %.', v_wangshi_rooms;
    END IF;

    IF (
        SELECT COUNT(*) FROM public.rooms
        WHERE homestay_id = '${WANGSHI_ID}'
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
        WHERE homestay_id = '${WANGSHI_ID}'
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
          AND homestay_id = '${WANGSHI_ID}'
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
          AND homestay_id = '${WANGSHI_ID}'
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
          AND homestay_id = '${WANGSHI_ID}'
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
    SELECT COUNT(*) INTO v_wangshi_bookings FROM public.bookings WHERE homestay_id = '${WANGSHI_ID}';
    IF v_wangshi_bookings <> 32 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected exactly 32 bookings for Wangshi Homestay, found %.', v_wangshi_bookings;
    END IF;

    -- Verify all 32 bookings match the audited ID set
    IF (
        SELECT COUNT(*) FROM public.bookings
        WHERE homestay_id = '${WANGSHI_ID}'
          AND id IN (${bookingIds.map(id => escapeSql(id)).join(", ")})
    ) <> 32 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: One or more Wangshi bookings do not match the audited 32 booking UUIDs!';
    END IF;

    SELECT COUNT(*) INTO v_wangshi_guests FROM public.guests WHERE homestay_id = '${WANGSHI_ID}';
    IF v_wangshi_guests <> 41 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Expected exactly 41 guests for Wangshi Homestay, found %.', v_wangshi_guests;
    END IF;

    -- Verify all 41 guests match the audited ID set
    IF (
        SELECT COUNT(*) FROM public.guests
        WHERE homestay_id = '${WANGSHI_ID}'
          AND id IN (${guestIds.map(id => escapeSql(id)).join(", ")})
    ) <> 41 THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: One or more Wangshi guests do not match the audited 41 guest UUIDs!';
    END IF;

    SELECT COUNT(*) INTO v_wangshi_requests FROM public.booking_requests WHERE homestay_id = '${WANGSHI_ID}';
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
        WHERE id = '${CONCLAVE_REQ_ID}'
          AND homestay_id = '${CONCLAVE_HS_ID}'
    ) THEN
        RAISE EXCEPTION 'PREFLIGHT FAILED: Preserved outside booking request % (The Conclave) missing!', '${CONCLAVE_REQ_ID}';
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
    WHERE id IN (${paymentIds.map(id => escapeSql(id)).join(", ")})
      AND homestay_id = '${WANGSHI_ID}'
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
    WHERE id IN (${invoiceItemIds.map(id => escapeSql(id)).join(", ")})
      AND homestay_id = '${WANGSHI_ID}'
    RETURNING 1
)
INSERT INTO _cleanup_metrics (step, affected_rows)
SELECT 'invoice_items', COUNT(*) FROM deleted_items;

-- Step E: Delete Wangshi Invoices (Exactly 1 row)
WITH deleted_invoices AS (
    DELETE FROM public.invoices
    WHERE id IN (${invoiceIds.map(id => escapeSql(id)).join(", ")})
      AND homestay_id = '${WANGSHI_ID}'
    RETURNING 1
)
INSERT INTO _cleanup_metrics (step, affected_rows)
SELECT 'invoices', COUNT(*) FROM deleted_invoices;

-- Step F: Delete Wangshi Guests (Exactly 41 rows)
WITH deleted_guests AS (
    DELETE FROM public.guests
    WHERE booking_id IN (${bookingIds.map(id => escapeSql(id)).join(", ")})
      AND homestay_id = '${WANGSHI_ID}'
    RETURNING 1
)
INSERT INTO _cleanup_metrics (step, affected_rows)
SELECT 'guests', COUNT(*) FROM deleted_guests;

-- Step G: Delete Wangshi Bookings (Exactly 32 rows)
WITH deleted_bookings AS (
    DELETE FROM public.bookings
    WHERE id IN (${bookingIds.map(id => escapeSql(id)).join(", ")})
      AND homestay_id = '${WANGSHI_ID}'
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
    SELECT COUNT(*) INTO v_rem_wangshi_bookings FROM public.bookings WHERE homestay_id = '${WANGSHI_ID}';
    SELECT COUNT(*) INTO v_rem_wangshi_guests FROM public.guests WHERE homestay_id = '${WANGSHI_ID}';
    SELECT COUNT(*) INTO v_rem_wangshi_invoices FROM public.invoices WHERE homestay_id = '${WANGSHI_ID}';
    SELECT COUNT(*) INTO v_rem_wangshi_items FROM public.invoice_items WHERE homestay_id = '${WANGSHI_ID}';
    SELECT COUNT(*) INTO v_rem_wangshi_payments FROM public.payments WHERE homestay_id = '${WANGSHI_ID}';
    SELECT COUNT(*) INTO v_rem_wangshi_requests FROM public.booking_requests WHERE homestay_id = '${WANGSHI_ID}';

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
        SELECT * FROM public.rooms WHERE homestay_id = '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.rooms WHERE homestay_id = '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_wangshi_rooms
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Wangshi rooms were altered or corrupted! Rolling back!';
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
        RAISE EXCEPTION 'POST-CHECK FAILED: Wangshi partners were altered or corrupted! Rolling back!';
    END IF;

    -- 4. Verify all non-Wangshi tables remain 100% untouched (Deep bidirectional EXCEPT)
    -- Homestays
    IF EXISTS (
        SELECT * FROM _baseline_outside_homestays
        EXCEPT
        SELECT * FROM public.homestays WHERE id IS DISTINCT FROM '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.homestays WHERE id IS DISTINCT FROM '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_outside_homestays
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Outside homestays were altered! Rolling back!';
    END IF;

    -- Rooms
    IF EXISTS (
        SELECT * FROM _baseline_outside_rooms
        EXCEPT
        SELECT * FROM public.rooms WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.rooms WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_outside_rooms
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Outside rooms were altered! Rolling back!';
    END IF;

    -- Partners
    IF EXISTS (
        SELECT * FROM _baseline_outside_partners
        EXCEPT
        SELECT * FROM public.partners WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.partners WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_outside_partners
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Outside partners were altered! Rolling back!';
    END IF;

    -- Bookings
    IF EXISTS (
        SELECT * FROM _baseline_outside_bookings
        EXCEPT
        SELECT * FROM public.bookings WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.bookings WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_outside_bookings
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Outside bookings were altered! Rolling back!';
    END IF;

    -- Guests
    IF EXISTS (
        SELECT * FROM _baseline_outside_guests
        EXCEPT
        SELECT * FROM public.guests WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.guests WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_outside_guests
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Outside guests were altered! Rolling back!';
    END IF;

    -- Invoices
    IF EXISTS (
        SELECT * FROM _baseline_outside_invoices
        EXCEPT
        SELECT * FROM public.invoices WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.invoices WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_outside_invoices
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Outside invoices were altered! Rolling back!';
    END IF;

    -- Invoice Items
    IF EXISTS (
        SELECT * FROM _baseline_outside_invoice_items
        EXCEPT
        SELECT * FROM public.invoice_items WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.invoice_items WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_outside_invoice_items
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Outside invoice items were altered! Rolling back!';
    END IF;

    -- Payments
    IF EXISTS (
        SELECT * FROM _baseline_outside_payments
        EXCEPT
        SELECT * FROM public.payments WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.payments WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
        EXCEPT
        SELECT * FROM _baseline_outside_payments
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Outside payments were altered! Rolling back!';
    END IF;

    -- Booking Requests (1 request at The Conclave)
    IF NOT EXISTS (
        SELECT 1 FROM public.booking_requests
        WHERE id = '${CONCLAVE_REQ_ID}'
          AND homestay_id = '${CONCLAVE_HS_ID}'
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Preserved outside booking request % (The Conclave) missing or altered!', '${CONCLAVE_REQ_ID}';
    END IF;

    IF EXISTS (
        SELECT * FROM _baseline_outside_booking_requests
        EXCEPT
        SELECT * FROM public.booking_requests WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT * FROM public.booking_requests WHERE homestay_id IS DISTINCT FROM '${WANGSHI_ID}'
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
`;
}

// -----------------------------------------------------------------------------
// 2. GENERATE ROLLBACK SQL (WITH FULL-COLUMN VERIFICATION & STAGING TABLES)
// -----------------------------------------------------------------------------
function generateRollbackSQL() {
  const bookingCols = Object.keys(snapshot.bookings[0]);
  const guestCols = Object.keys(snapshot.guests[0]);
  const invoiceCols = Object.keys(snapshot.invoices[0]);
  const invoiceItemCols = Object.keys(snapshot.invoiceItems[0]);
  const paymentCols = Object.keys(snapshot.payments[0]);

  return `-- ==============================================================================
-- WANGSHI HOMESTAY: CLEANUP ROLLBACK & RESTORATION SCRIPT (AIRTIGHT FULL-COLUMN)
-- Target Homestay: Wangshi Homestay ('${WANGSHI_ID}')
-- Production Project Ref: algorrnjotffcvtinbyy (Supabase Production)
--
-- Restores all 32 bookings, 41 guests, 1 invoice, 3 invoice items, and 2 payments
-- with every original column value and UUID captured from the production snapshot.
--
-- Safety & Verification Architecture:
--   1. Transactional Table Locks (ordered top-down) with a 5s lock_timeout fail-safe.
--   2. Preflight Conflict Detection: Asserts that NONE of the snapshot IDs already exist.
--      Any existing duplicate ID causes an immediate, clean failure rather than being silently ignored.
--   3. Preflight Foreign Key Validation: Confirms all referenced homestay, room, and partner records exist.
--   4. Staging Tables (LIKE ... INCLUDING ALL): Loads snapshot records into temporary staging tables.
--   5. Controlled Sequential Insertion: bookings -> guests -> invoices -> invoice_items -> payments.
--   6. Trigger State Management: Disables payment ledger triggers during historical insert and re-enables them.
--   7. Deep Bidirectional EXCEPT Verification: Compares production tables against staging tables across ALL columns.
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
-- 1. TRANSACTIONAL TABLE LOCKS (Ordered top-down)
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
-- 2. CREATE STAGING TABLES (EXACT SCHEMA MATCH)
-- ------------------------------------------------------------------------------
CREATE TEMP TABLE _snapshot_bookings (LIKE public.bookings INCLUDING ALL) ON COMMIT DROP;
CREATE TEMP TABLE _snapshot_guests (LIKE public.guests INCLUDING ALL) ON COMMIT DROP;
CREATE TEMP TABLE _snapshot_invoices (LIKE public.invoices INCLUDING ALL) ON COMMIT DROP;
CREATE TEMP TABLE _snapshot_invoice_items (LIKE public.invoice_items INCLUDING ALL) ON COMMIT DROP;
CREATE TEMP TABLE _snapshot_payments (LIKE public.payments INCLUDING ALL) ON COMMIT DROP;

-- ------------------------------------------------------------------------------
-- 3. LOAD EXACT SNAPSHOT ROWS INTO STAGING TABLES
-- ------------------------------------------------------------------------------
-- Bookings (32 rows, 15 columns)
INSERT INTO _snapshot_bookings (
    ${bookingCols.join(", ")}
) VALUES
${snapshot.bookings.map(b => `(
    ${bookingCols.map(col => escapeSql(b[col])).join(", ")}
)`).join(",\n")};

-- Guests (41 rows, 9 columns)
INSERT INTO _snapshot_guests (
    ${guestCols.join(", ")}
) VALUES
${snapshot.guests.map(g => `(
    ${guestCols.map(col => escapeSql(g[col])).join(", ")}
)`).join(",\n")};

-- Invoices (1 row, 26 columns)
INSERT INTO _snapshot_invoices (
    ${invoiceCols.join(", ")}
) VALUES
${snapshot.invoices.map(i => `(
    ${invoiceCols.map(col => escapeSql(i[col])).join(", ")}
)`).join(",\n")};

-- Invoice Items (3 rows, 11 columns)
INSERT INTO _snapshot_invoice_items (
    ${invoiceItemCols.join(", ")}
) VALUES
${snapshot.invoiceItems.map(it => `(
    ${invoiceItemCols.map(col => escapeSql(it[col])).join(", ")}
)`).join(",\n")};

-- Payments (2 rows, 13 columns)
INSERT INTO _snapshot_payments (
    ${paymentCols.join(", ")}
) VALUES
${snapshot.payments.map(p => `(
    ${paymentCols.map(col => escapeSql(p[col])).join(", ")}
)`).join(",\n")};

-- ------------------------------------------------------------------------------
-- 4. PREFLIGHT CONFLICT DETECTION & FOREIGN-KEY VALIDATION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_conflicts INTEGER;
    v_missing_fks INTEGER;
BEGIN
    -- Check 1: Ensure target homestay exists
    IF NOT EXISTS (
        SELECT 1 FROM public.homestays WHERE id = '${WANGSHI_ID}'
    ) THEN
        RAISE EXCEPTION 'PRE-ROLLBACK FAILED: Target homestay Wangshi Homestay (%) does not exist in public.homestays!', '${WANGSHI_ID}';
    END IF;

    -- Check 2: Conflict detection (Ensure NO snapshot IDs already exist in production)
    SELECT COUNT(*) INTO v_conflicts FROM public.bookings b JOIN _snapshot_bookings s ON b.id = s.id;
    IF v_conflicts > 0 THEN
        RAISE EXCEPTION 'PRE-ROLLBACK FAILED: % booking IDs already exist in public.bookings! Conflicting IDs cannot be silently overwritten.', v_conflicts;
    END IF;

    SELECT COUNT(*) INTO v_conflicts FROM public.guests g JOIN _snapshot_guests s ON g.id = s.id;
    IF v_conflicts > 0 THEN
        RAISE EXCEPTION 'PRE-ROLLBACK FAILED: % guest IDs already exist in public.guests! Conflicting IDs cannot be silently overwritten.', v_conflicts;
    END IF;

    SELECT COUNT(*) INTO v_conflicts FROM public.invoices i JOIN _snapshot_invoices s ON i.id = s.id;
    IF v_conflicts > 0 THEN
        RAISE EXCEPTION 'PRE-ROLLBACK FAILED: % invoice IDs already exist in public.invoices! Conflicting IDs cannot be silently overwritten.', v_conflicts;
    END IF;

    SELECT COUNT(*) INTO v_conflicts FROM public.invoice_items it JOIN _snapshot_invoice_items s ON it.id = s.id;
    IF v_conflicts > 0 THEN
        RAISE EXCEPTION 'PRE-ROLLBACK FAILED: % invoice item IDs already exist in public.invoice_items! Conflicting IDs cannot be silently overwritten.', v_conflicts;
    END IF;

    SELECT COUNT(*) INTO v_conflicts FROM public.payments p JOIN _snapshot_payments s ON p.id = s.id;
    IF v_conflicts > 0 THEN
        RAISE EXCEPTION 'PRE-ROLLBACK FAILED: % payment IDs already exist in public.payments! Conflicting IDs cannot be silently overwritten.', v_conflicts;
    END IF;

    -- Check 3: Foreign Key Dependency Validation
    -- Verify referenced room IDs exist under Wangshi
    SELECT COUNT(*) INTO v_missing_fks
    FROM (
        SELECT DISTINCT room_id FROM _snapshot_bookings
        EXCEPT
        SELECT id FROM public.rooms WHERE homestay_id = '${WANGSHI_ID}'
    ) missing_rooms;

    IF v_missing_fks > 0 THEN
        RAISE EXCEPTION 'PRE-ROLLBACK FAILED: Foreign key dependency broken! % referenced room IDs do not exist under Wangshi in public.rooms.', v_missing_fks;
    END IF;

    -- Verify referenced partner IDs exist under Wangshi
    SELECT COUNT(*) INTO v_missing_fks
    FROM (
        SELECT DISTINCT partner_id FROM _snapshot_bookings
        EXCEPT
        SELECT id FROM public.partners WHERE homestay_id = '${WANGSHI_ID}'
    ) missing_partners;

    IF v_missing_fks > 0 THEN
        RAISE EXCEPTION 'PRE-ROLLBACK FAILED: Foreign key dependency broken! % referenced partner IDs do not exist under Wangshi in public.partners.', v_missing_fks;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. SEQUENTIAL PRODUCTION RESTORATION
-- ------------------------------------------------------------------------------

-- Step 1: Restore Bookings (32 rows)
INSERT INTO public.bookings (
    ${bookingCols.join(", ")}
)
SELECT ${bookingCols.join(", ")}
FROM _snapshot_bookings;

-- Step 2: Restore Guests (41 rows)
INSERT INTO public.guests (
    ${guestCols.join(", ")}
)
SELECT ${guestCols.join(", ")}
FROM _snapshot_guests;

-- Step 3: Restore Invoices (1 row)
INSERT INTO public.invoices (
    ${invoiceCols.join(", ")}
)
SELECT ${invoiceCols.join(", ")}
FROM _snapshot_invoices;

-- Step 4: Restore Invoice Items (3 rows)
INSERT INTO public.invoice_items (
    ${invoiceItemCols.join(", ")}
)
SELECT ${invoiceItemCols.join(", ")}
FROM _snapshot_invoice_items;

-- Step 5: Restore Payments (2 rows)
-- Temporarily suspend immutability and insert validation triggers for historical restore
ALTER TABLE public.payments DISABLE TRIGGER trg_prevent_payment_ledger_mutation;
ALTER TABLE public.payments DISABLE TRIGGER trg_validate_payment_integrity;

INSERT INTO public.payments (
    ${paymentCols.join(", ")}
)
SELECT ${paymentCols.join(", ")}
FROM _snapshot_payments;

ALTER TABLE public.payments ENABLE TRIGGER trg_prevent_payment_ledger_mutation;
ALTER TABLE public.payments ENABLE TRIGGER trg_validate_payment_integrity;

-- ------------------------------------------------------------------------------
-- 6. POSTFLIGHT FULL-COLUMN BIDIRECTIONAL EXCEPT VERIFICATION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_b_count INTEGER;
    v_g_count INTEGER;
    v_i_count INTEGER;
    v_it_count INTEGER;
    v_p_count INTEGER;
    v_mut_trg TEXT;
    v_val_trg TEXT;
BEGIN
    -- 1. Verify exact counts restored
    SELECT COUNT(*) INTO v_b_count FROM public.bookings WHERE homestay_id = '${WANGSHI_ID}';
    SELECT COUNT(*) INTO v_g_count FROM public.guests WHERE homestay_id = '${WANGSHI_ID}';
    SELECT COUNT(*) INTO v_i_count FROM public.invoices WHERE homestay_id = '${WANGSHI_ID}';
    SELECT COUNT(*) INTO v_it_count FROM public.invoice_items WHERE homestay_id = '${WANGSHI_ID}';
    SELECT COUNT(*) INTO v_p_count FROM public.payments WHERE homestay_id = '${WANGSHI_ID}';

    IF v_b_count <> 32 OR v_g_count <> 41 OR v_i_count <> 1 OR v_it_count <> 3 OR v_p_count <> 2 THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Count mismatch! Bookings: % (exp 32), Guests: % (exp 41), Invoices: % (exp 1), Items: % (exp 3), Payments: % (exp 2)',
            v_b_count, v_g_count, v_i_count, v_it_count, v_p_count;
    END IF;

    -- 2. Deep Full-Column Bidirectional EXCEPT: Bookings (all 15 columns)
    IF EXISTS (
        SELECT ${bookingCols.join(", ")} FROM _snapshot_bookings
        EXCEPT
        SELECT ${bookingCols.join(", ")} FROM public.bookings WHERE homestay_id = '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT ${bookingCols.join(", ")} FROM public.bookings WHERE homestay_id = '${WANGSHI_ID}'
        EXCEPT
        SELECT ${bookingCols.join(", ")} FROM _snapshot_bookings
    ) THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Restored bookings do not match snapshot across all 15 columns!';
    END IF;

    -- 3. Deep Full-Column Bidirectional EXCEPT: Guests (all 9 columns)
    IF EXISTS (
        SELECT ${guestCols.join(", ")} FROM _snapshot_guests
        EXCEPT
        SELECT ${guestCols.join(", ")} FROM public.guests WHERE homestay_id = '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT ${guestCols.join(", ")} FROM public.guests WHERE homestay_id = '${WANGSHI_ID}'
        EXCEPT
        SELECT ${guestCols.join(", ")} FROM _snapshot_guests
    ) THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Restored guests do not match snapshot across all 9 columns!';
    END IF;

    -- 4. Deep Full-Column Bidirectional EXCEPT: Invoices (all 26 columns)
    IF EXISTS (
        SELECT ${invoiceCols.join(", ")} FROM _snapshot_invoices
        EXCEPT
        SELECT ${invoiceCols.join(", ")} FROM public.invoices WHERE homestay_id = '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT ${invoiceCols.join(", ")} FROM public.invoices WHERE homestay_id = '${WANGSHI_ID}'
        EXCEPT
        SELECT ${invoiceCols.join(", ")} FROM _snapshot_invoices
    ) THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Restored invoice does not match snapshot across all 26 columns!';
    END IF;

    -- 5. Deep Full-Column Bidirectional EXCEPT: Invoice Items (all 11 columns)
    IF EXISTS (
        SELECT ${invoiceItemCols.join(", ")} FROM _snapshot_invoice_items
        EXCEPT
        SELECT ${invoiceItemCols.join(", ")} FROM public.invoice_items WHERE homestay_id = '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT ${invoiceItemCols.join(", ")} FROM public.invoice_items WHERE homestay_id = '${WANGSHI_ID}'
        EXCEPT
        SELECT ${invoiceItemCols.join(", ")} FROM _snapshot_invoice_items
    ) THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Restored invoice items do not match snapshot across all 11 columns!';
    END IF;

    -- 6. Deep Full-Column Bidirectional EXCEPT: Payments (all 13 columns)
    IF EXISTS (
        SELECT ${paymentCols.join(", ")} FROM _snapshot_payments
        EXCEPT
        SELECT ${paymentCols.join(", ")} FROM public.payments WHERE homestay_id = '${WANGSHI_ID}'
    ) OR EXISTS (
        SELECT ${paymentCols.join(", ")} FROM public.payments WHERE homestay_id = '${WANGSHI_ID}'
        EXCEPT
        SELECT ${paymentCols.join(", ")} FROM _snapshot_payments
    ) THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Restored payments do not match snapshot across all 13 columns!';
    END IF;

    -- 7. Verify Trigger Restoration State on public.payments
    SELECT t.tgenabled::text INTO v_mut_trg
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'payments' AND t.tgname = 'trg_prevent_payment_ledger_mutation';

    SELECT t.tgenabled::text INTO v_val_trg
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'payments' AND t.tgname = 'trg_validate_payment_integrity';

    IF v_mut_trg <> 'O' THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Trigger trg_prevent_payment_ledger_mutation was not re-enabled (status: %)!', v_mut_trg;
    END IF;

    IF v_val_trg <> 'O' THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Trigger trg_validate_payment_integrity was not re-enabled (status: %)!', v_val_trg;
    END IF;

    RAISE NOTICE '========================================================================';
    RAISE NOTICE 'ROLLBACK RESTORATION VERIFIED WITH FULL-COLUMN FIDELITY:';
    RAISE NOTICE '  - Exactly 32 Bookings restored and verified across all 15 columns';
    RAISE NOTICE '  - Exactly 41 Guests restored and verified across all 9 columns';
    RAISE NOTICE '  - Exactly 1 Invoice restored and verified across all 26 columns (INV-WAN-20261113-6763)';
    RAISE NOTICE '  - Exactly 3 Invoice Items restored and verified across all 11 columns (Room ₹5000, Tea ₹80, Laundry ₹2000)';
    RAISE NOTICE '  - Exactly 2 Payments restored and verified across all 13 columns (₹5000 + ₹2080 Cash)';
    RAISE NOTICE '  - Both payment triggers verified active ("O")';
    RAISE NOTICE '========================================================================';
END $$;

COMMIT;
`;
}

// -----------------------------------------------------------------------------
// 3. WRITE SCRIPTS
// -----------------------------------------------------------------------------
const cleanupSql = generateCleanupSQL();
fs.writeFileSync("scripts/cleanup_wangshi_test_data.sql", cleanupSql, "utf8");
console.log("Wrote cleanup script: scripts/cleanup_wangshi_test_data.sql");

const rollbackSql = generateRollbackSQL();
fs.writeFileSync("scripts/cleanup_wangshi_test_data_rollback.sql", rollbackSql, "utf8");
console.log("Wrote rollback script: scripts/cleanup_wangshi_test_data_rollback.sql");
