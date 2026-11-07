-- ==============================================================================
-- ROLLBACK: REVERT PER-HOMESTAY ROOM NUMBER UNIQUE CONSTRAINT
-- ==============================================================================
-- Purpose:
--   Rolls back `uq_rooms_homestay_room_number` and restores `rooms_room_number_key`.
--
-- Safety Guarantees:
--   1. Transaction-local Baseline Audit:
--      Captures row counts of rooms, bookings, invoices, and payments in a
--      temporary table (_rollback_room_baseline) dropped on transaction commit.
--   2. Strict Pre-flight Duplicate Guard:
--      Refuses execution if any duplicate room numbers exist across different
--      homestays (using exact value matching without TRIM normalization).
--   3. Composite Constraint Verification & Removal:
--      Verifies table, constraint type ('u'), ordered columns (['homestay_id', 'room_number']),
--      and canonical definition ('UNIQUE (homestay_id, room_number)') before dropping.
--   4. Legacy Constraint Restoration & Audit of Unexpected Uniqueness Enforcement:
--      - Idempotently restores `rooms_room_number_key UNIQUE (room_number)`.
--      - Detects and reports any unexpected global unique constraints or standalone
--        unique indexes without automatically dropping unknown objects.
--   5. Post-rollback Verification & Data Immutability:
--      - Verifies `rooms_room_number_key` is active and `uq_rooms_homestay_room_number` is absent.
--      - Compares post-rollback row counts against original baseline counts stored in temp table.
--      - Zero rows deleted, updated, or altered.
--   6. Transactional: Rolls back completely on error.
-- ==============================================================================

BEGIN;

-- 1. BASELINE INTEGRITY AUDIT: Store pre-rollback row counts in a transaction-local temporary table
CREATE TEMP TABLE _rollback_room_baseline (
    rooms_count INTEGER NOT NULL,
    bookings_count INTEGER NOT NULL,
    invoices_count INTEGER NOT NULL,
    payments_count INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO _rollback_room_baseline (rooms_count, bookings_count, invoices_count, payments_count)
VALUES (
    (SELECT COUNT(*) FROM public.rooms),
    (SELECT COUNT(*) FROM public.bookings),
    (SELECT COUNT(*) FROM public.invoices),
    (SELECT COUNT(*) FROM public.payments)
);

DO $$
DECLARE
    v_base _rollback_room_baseline%ROWTYPE;
BEGIN
    SELECT * INTO v_base FROM _rollback_room_baseline LIMIT 1;
    RAISE NOTICE 'Rollback baseline captured: % rooms, % bookings, % invoices, % payments.',
        v_base.rooms_count, v_base.bookings_count, v_base.invoices_count, v_base.payments_count;
END $$;

-- 2. PRE-FLIGHT AUDIT: Fail safely if cross-homestay duplicate room numbers exist
-- NOTE: Uses exact value comparison matching PostgreSQL constraint semantics (no TRIM normalization).
DO $$
DECLARE
    v_cross_dup_count INTEGER;
    v_cross_dup_details TEXT;
BEGIN
    SELECT COUNT(*), string_agg(format('Room "%s" (shared across %s homestays: %s)', room_number, cnt, homestay_ids), E'\n  - ')
    INTO v_cross_dup_count, v_cross_dup_details
    FROM (
        SELECT room_number, COUNT(*) AS cnt, string_agg(homestay_id::text, ', ') AS homestay_ids
        FROM public.rooms
        GROUP BY room_number
        HAVING COUNT(*) > 1
    ) dups;

    IF v_cross_dup_count > 0 THEN
        RAISE EXCEPTION E'ROLLBACK ABORTED: Cannot restore global unique constraint "rooms_room_number_key" because % room number(s) are shared across multiple homestays:\n  - %\n\nManual reconciliation of conflicting room numbers is required before global uniqueness can be restored. Rollback aborted without modifying any tables or constraints.',
            v_cross_dup_count, v_cross_dup_details;
    END IF;

    RAISE NOTICE 'Rollback pre-flight passed: Zero cross-homestay duplicate room numbers found. Safe to restore global constraint.';
END $$;

-- 3. DROP COMPOSITE CONSTRAINT
-- Strictly verifies table, constraint type, target columns, and definition before dropping.
DO $$
DECLARE
    v_comp_oid OID;
    v_comp_type CHAR(1);
    v_comp_def TEXT;
    v_comp_cols TEXT[];
BEGIN
    SELECT c.oid, c.contype, pg_get_constraintdef(c.oid)
    INTO v_comp_oid, v_comp_type, v_comp_def
    FROM pg_constraint c
    WHERE c.conrelid = 'public.rooms'::regclass
      AND c.conname = 'uq_rooms_homestay_room_number';

    IF v_comp_oid IS NOT NULL THEN
        -- Resolve column names in constraint key order (explicitly cast to text[] to avoid name[] = text[] operator mismatch)
        SELECT COALESCE(array_agg(a.attname::text ORDER BY array_position(c.conkey, a.attnum)), ARRAY[]::text[])
        INTO v_comp_cols
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.oid = v_comp_oid
        GROUP BY c.oid;

        -- Verify constraint is strictly UNIQUE (homestay_id, room_number)
        IF v_comp_type <> 'u' 
           OR v_comp_cols IS DISTINCT FROM ARRAY['homestay_id', 'room_number']::text[] 
           OR v_comp_def <> 'UNIQUE (homestay_id, room_number)' THEN
            RAISE EXCEPTION 'INCOMPATIBLE_COMPOSITE_CONSTRAINT: Constraint "uq_rooms_homestay_room_number" on public.rooms has unexpected type (%s), columns (%s), or definition (%s). Expected UNIQUE (homestay_id, room_number). Refusing to drop unknown constraint.',
                v_comp_type, v_comp_cols, v_comp_def;
        END IF;

        ALTER TABLE public.rooms DROP CONSTRAINT uq_rooms_homestay_room_number;
        RAISE NOTICE 'Successfully verified and dropped composite constraint: uq_rooms_homestay_room_number (def: %).', v_comp_def;
    ELSE
        RAISE NOTICE 'Composite constraint uq_rooms_homestay_room_number not found or already dropped.';
    END IF;
END $$;

-- 4. RESTORE GLOBAL UNIQUE CONSTRAINT & AUDIT UNEXPECTED UNIQUENESS ENFORCEMENT
-- Idempotently restores rooms_room_number_key on (room_number).
-- Detects and reports any unexpected global unique constraints or standalone indexes.
DO $$
DECLARE
    v_legacy_oid OID;
    v_legacy_type CHAR(1);
    v_legacy_def TEXT;
    v_legacy_cols TEXT[];
    v_unexpected_con_details TEXT;
    v_unexpected_idx_details TEXT;
BEGIN
    -- 4A. Audit UNEXPECTED global unique constraints on room_number (DO NOT auto-drop)
    SELECT string_agg(format('Constraint "%s" on public.rooms: %s', c.conname, pg_get_constraintdef(c.oid)), E'\n  - ')
    INTO v_unexpected_con_details
    FROM pg_constraint c
    WHERE c.conrelid = 'public.rooms'::regclass
      AND c.contype = 'u'
      AND c.conname <> 'rooms_room_number_key'
      AND c.conname <> 'uq_rooms_homestay_room_number'
      AND (
          SELECT COALESCE(array_agg(a.attname::text ORDER BY array_position(c.conkey, a.attnum)), ARRAY[]::text[])
          FROM pg_attribute a
          WHERE a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      ) = ARRAY['room_number']::text[];

    IF v_unexpected_con_details IS NOT NULL THEN
        RAISE EXCEPTION E'UNEXPECTED_GLOBAL_CONSTRAINT_DETECTED: Found unexpected unique constraint(s) enforcing global uniqueness on room_number during rollback:\n  - %\nAutomatic modification forbidden. Please inspect and resolve manually.',
            v_unexpected_con_details;
    END IF;

    -- 4B. Audit STANDALONE unique indexes that enforce global uniqueness on room_number
    -- NOTE: Uses i.indnkeyatts (key columns participating in uniqueness), strictly excluding non-key INCLUDE columns.
    SELECT string_agg(format('Index "%s" (definition: %s)', idx_class.relname, pg_get_indexdef(i.indexrelid)), E'\n  - ')
    INTO v_unexpected_idx_details
    FROM pg_index i
    JOIN pg_class idx_class ON idx_class.oid = i.indexrelid
    WHERE i.indrelid = 'public.rooms'::regclass
      AND i.indisunique = TRUE
      AND idx_class.relname <> 'rooms_room_number_key'
      AND idx_class.relname <> 'uq_rooms_homestay_room_number'
      AND (
          SELECT COALESCE(array_agg(pg_get_indexdef(i.indexrelid, k.n, true)::text ORDER BY k.n), ARRAY[]::text[])
          FROM generate_series(1, i.indnkeyatts) AS k(n)
      ) = ARRAY['room_number']::text[];

    IF v_unexpected_idx_details IS NOT NULL THEN
        RAISE EXCEPTION E'UNEXPECTED_UNIQUE_INDEX_DETECTED: Found standalone unique index(es) enforcing global uniqueness on room_number:\n  - %\nAutomatic modification forbidden. Please inspect and resolve manually.',
            v_unexpected_idx_details;
    END IF;

    -- 4C. Check and restore rooms_room_number_key
    SELECT c.oid, c.contype, pg_get_constraintdef(c.oid)
    INTO v_legacy_oid, v_legacy_type, v_legacy_def
    FROM pg_constraint c
    WHERE c.conrelid = 'public.rooms'::regclass
      AND c.conname = 'rooms_room_number_key';

    IF v_legacy_oid IS NOT NULL THEN
        SELECT COALESCE(array_agg(a.attname::text ORDER BY array_position(c.conkey, a.attnum)), ARRAY[]::text[])
        INTO v_legacy_cols
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.oid = v_legacy_oid
        GROUP BY c.oid;

        IF v_legacy_type <> 'u' 
           OR v_legacy_cols IS DISTINCT FROM ARRAY['room_number']::text[] 
           OR v_legacy_def <> 'UNIQUE (room_number)' THEN
            RAISE EXCEPTION 'INCOMPATIBLE_LEGACY_CONSTRAINT: Constraint "rooms_room_number_key" already exists on public.rooms with unexpected type (%s), columns (%s), or definition (%s). Expected UNIQUE (room_number). Aborting.',
                v_legacy_type, v_legacy_cols, v_legacy_def;
        END IF;

        RAISE NOTICE 'Global unique constraint rooms_room_number_key already exists with canonical definition: %.', v_legacy_def;
    ELSE
        ALTER TABLE public.rooms
        ADD CONSTRAINT rooms_room_number_key UNIQUE (room_number);
        RAISE NOTICE 'Successfully restored global unique constraint: rooms_room_number_key UNIQUE (room_number).';
    END IF;
END $$;

-- 5. POST-ROLLBACK VERIFICATION & BASELINE COMPARISON
DO $$
DECLARE
    v_base _rollback_room_baseline%ROWTYPE;
    v_legacy_verified BOOLEAN;
    v_comp_remaining BOOLEAN;
    v_standalone_idx_remaining BOOLEAN;
    v_legacy_def TEXT;
    v_post_rooms INTEGER;
    v_post_bookings INTEGER;
    v_post_invoices INTEGER;
    v_post_payments INTEGER;
BEGIN
    -- 5A. Retrieve baseline counts from transaction-local temporary table
    SELECT * INTO v_base FROM _rollback_room_baseline LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'INTERNAL ERROR: Rollback baseline record not found.';
    END IF;

    -- 5B. Verify global constraint is active with exact definition
    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conrelid = 'public.rooms'::regclass
          AND c.conname = 'rooms_room_number_key'
          AND c.contype = 'u'
          AND (
              SELECT COALESCE(array_agg(a.attname::text ORDER BY array_position(c.conkey, a.attnum)), ARRAY[]::text[])
              FROM pg_attribute a
              WHERE a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
          ) = ARRAY['room_number']::text[]
          AND pg_get_constraintdef(c.oid) = 'UNIQUE (room_number)'
    ), (
        SELECT pg_get_constraintdef(c.oid)
        FROM pg_constraint c
        WHERE c.conrelid = 'public.rooms'::regclass
          AND c.conname = 'rooms_room_number_key'
    )
    INTO v_legacy_verified, v_legacy_def;

    IF NOT v_legacy_verified THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Global unique constraint rooms_room_number_key (room_number) not found or invalid on public.rooms!';
    END IF;

    -- 5C. Verify composite constraint is completely removed
    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conrelid = 'public.rooms'::regclass
          AND c.contype = 'u'
          AND (
              c.conname = 'uq_rooms_homestay_room_number'
              OR (
                  SELECT COALESCE(array_agg(a.attname::text ORDER BY array_position(c.conkey, a.attnum)), ARRAY[]::text[])
                  FROM pg_attribute a
                  WHERE a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
              ) = ARRAY['homestay_id', 'room_number']::text[]
          )
    ) INTO v_comp_remaining;

    IF v_comp_remaining THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Composite constraint uq_rooms_homestay_room_number still exists on public.rooms!';
    END IF;

    -- 5D. Verify no standalone unique index on (homestay_id, room_number) or room_number remains outside rooms_room_number_key
    SELECT EXISTS (
        SELECT 1
        FROM pg_index i
        JOIN pg_class idx_class ON idx_class.oid = i.indexrelid
        WHERE i.indrelid = 'public.rooms'::regclass
          AND i.indisunique = TRUE
          AND idx_class.relname <> 'rooms_room_number_key'
          AND (
              SELECT COALESCE(array_agg(pg_get_indexdef(i.indexrelid, k.n, true)::text ORDER BY k.n), ARRAY[]::text[])
              FROM generate_series(1, i.indnkeyatts) AS k(n)
          ) IN (ARRAY['homestay_id', 'room_number']::text[], ARRAY['room_number', 'homestay_id']::text[], ARRAY['room_number']::text[])
    ) INTO v_standalone_idx_remaining;

    IF v_standalone_idx_remaining THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Unexpected standalone unique index found on public.rooms!';
    END IF;

    -- 5E. Verify Business Data Immutability against original baseline counts
    SELECT COUNT(*) INTO v_post_rooms FROM public.rooms;
    SELECT COUNT(*) INTO v_post_bookings FROM public.bookings;
    SELECT COUNT(*) INTO v_post_invoices FROM public.invoices;
    SELECT COUNT(*) INTO v_post_payments FROM public.payments;

    IF v_post_rooms <> v_base.rooms_count THEN
        RAISE EXCEPTION 'DATA IMMUTABILITY VIOLATION: rooms count changed from rollback baseline % to post-rollback %! Aborting.',
            v_base.rooms_count, v_post_rooms;
    END IF;
    IF v_post_bookings <> v_base.bookings_count THEN
        RAISE EXCEPTION 'DATA IMMUTABILITY VIOLATION: bookings count changed from rollback baseline % to post-rollback %! Aborting.',
            v_base.bookings_count, v_post_bookings;
    END IF;
    IF v_post_invoices <> v_base.invoices_count THEN
        RAISE EXCEPTION 'DATA IMMUTABILITY VIOLATION: invoices count changed from rollback baseline % to post-rollback %! Aborting.',
            v_base.invoices_count, v_post_invoices;
    END IF;
    IF v_post_payments <> v_base.payments_count THEN
        RAISE EXCEPTION 'DATA IMMUTABILITY VIOLATION: payments count changed from rollback baseline % to post-rollback %! Aborting.',
            v_base.payments_count, v_post_payments;
    END IF;

    RAISE NOTICE 'ROLLBACK VERIFIED: Constraint rooms_room_number_key is active (%). Exactly % rooms, % bookings, % invoices, and % payments preserved.',
        v_legacy_def, v_post_rooms, v_post_bookings, v_post_invoices, v_post_payments;
END $$;

COMMIT;
