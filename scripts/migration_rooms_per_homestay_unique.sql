-- ==============================================================================
-- MIGRATION: SCOPE ROOM NUMBER UNIQUE CONSTRAINT PER HOMESTAY (TENANT ISOLATION)
-- ==============================================================================
-- Problem:
--   The initial single-tenant schema defined `room_number TEXT UNIQUE NOT NULL` on `rooms`,
--   generating PostgreSQL constraint `rooms_room_number_key`. This enforces
--   global uniqueness across all homestays, preventing multiple properties from having
--   their own room '01', '02', '101', etc.
--
-- Solution:
--   1. Baseline Audit: Capture pre-migration row counts of rooms, bookings, invoices,
--      and payments into a transaction-local temporary table (_migration_room_baseline).
--   2. Pre-flight Audit: Ensure no duplicate (homestay_id, room_number) pairs exist
--      using exact value comparison (no silent TRIM normalization).
--   3. Legacy Constraint Audit & Removal:
--      - Explicitly verify table, type ('u'), ordered columns (['room_number']), and
--        canonical definition ('UNIQUE (room_number)') of `rooms_room_number_key` before dropping.
--      - Detect unexpected global unique constraints or standalone unique indexes
--        on room_number and abort with their names and definitions (never auto-drop unknown constraints).
--   4. Composite Constraint Creation:
--      - Idempotently create `uq_rooms_homestay_room_number` on (homestay_id, room_number).
--      - Validate exact columns and definition if already present.
--   5. Post-migration Verification & Data Immutability:
--      - Verify composite constraint is active with exact definition.
--      - Verify legacy constraint and standalone global unique indexes are absent.
--      - Re-query actual row counts and assert exact match against baseline counts stored in temp table.
--
-- Safety Guarantees:
--   - Does NOT delete, rename, or overwrite any existing room records.
--   - Does NOT modify historical bookings, invoices, or payments.
--   - Preserves all primary keys, UUIDs, and foreign key relationships.
--   - Preserves strict uniqueness protection within each homestay property.
--   - Fully idempotent and safe to rerun.
--   - Transactional: Entire migration rolls back automatically on error.
-- ==============================================================================

BEGIN;

-- 1. BASELINE INTEGRITY AUDIT: Store pre-migration row counts in a transaction-local temporary table
CREATE TEMP TABLE _migration_room_baseline (
    rooms_count INTEGER NOT NULL,
    bookings_count INTEGER NOT NULL,
    invoices_count INTEGER NOT NULL,
    payments_count INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO _migration_room_baseline (rooms_count, bookings_count, invoices_count, payments_count)
VALUES (
    (SELECT COUNT(*) FROM public.rooms),
    (SELECT COUNT(*) FROM public.bookings),
    (SELECT COUNT(*) FROM public.invoices),
    (SELECT COUNT(*) FROM public.payments)
);

DO $$
DECLARE
    v_base _migration_room_baseline%ROWTYPE;
BEGIN
    SELECT * INTO v_base FROM _migration_room_baseline LIMIT 1;
    RAISE NOTICE 'Baseline captured: % rooms, % bookings, % invoices, % payments.',
        v_base.rooms_count, v_base.bookings_count, v_base.invoices_count, v_base.payments_count;
END $$;

-- 2. PRE-FLIGHT AUDIT: Ensure no duplicate room numbers exist within any single homestay
-- NOTE: Uses exact value matching matching PostgreSQL constraint semantics (no TRIM normalization).
DO $$
DECLARE
    v_dup_count INTEGER;
    v_dup_details TEXT;
BEGIN
    SELECT COUNT(*), string_agg(format('Homestay %s: Room "%s" (%s occurrences)', homestay_id, room_number, cnt), E'\n  - ')
    INTO v_dup_count, v_dup_details
    FROM (
        SELECT homestay_id, room_number, COUNT(*) AS cnt
        FROM public.rooms
        GROUP BY homestay_id, room_number
        HAVING COUNT(*) > 1
    ) dups;

    IF v_dup_count > 0 THEN
        RAISE EXCEPTION E'PRE-FLIGHT AUDIT FAILED: % duplicate room number(s) detected within individual homestays:\n  - %\nMigration aborted. No changes made.',
            v_dup_count, v_dup_details;
    END IF;

    RAISE NOTICE 'Pre-flight check passed: Zero intra-homestay duplicate room numbers found.';
END $$;

-- 3. LEGACY CONSTRAINT VERIFICATION & AUDIT OF UNEXPECTED UNIQUENESS ENFORCEMENT
DO $$
DECLARE
    v_legacy_oid OID;
    v_legacy_type CHAR(1);
    v_legacy_def TEXT;
    v_legacy_cols TEXT[];
    v_unexpected_con_details TEXT;
    v_unexpected_idx_details TEXT;
BEGIN
    -- 3A. Inspect and drop ONLY the explicitly approved legacy constraint: rooms_room_number_key
    SELECT c.oid, c.contype, pg_get_constraintdef(c.oid)
    INTO v_legacy_oid, v_legacy_type, v_legacy_def
    FROM pg_constraint c
    WHERE c.conrelid = 'public.rooms'::regclass
      AND c.conname = 'rooms_room_number_key';

    IF v_legacy_oid IS NOT NULL THEN
        -- Resolve column names in constraint key order (explicitly cast to text[] to avoid name[] = text[] operator mismatch)
        SELECT COALESCE(array_agg(a.attname::text ORDER BY array_position(c.conkey, a.attnum)), ARRAY[]::text[])
        INTO v_legacy_cols
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.oid = v_legacy_oid
        GROUP BY c.oid;

        -- Verify table, type, columns, and canonical definition
        IF v_legacy_type <> 'u' 
           OR v_legacy_cols IS DISTINCT FROM ARRAY['room_number']::text[] 
           OR v_legacy_def <> 'UNIQUE (room_number)' THEN
            RAISE EXCEPTION 'INCOMPATIBLE_LEGACY_CONSTRAINT: Constraint "rooms_room_number_key" on public.rooms has unexpected type (%s), columns (%), or definition (%). Expected UNIQUE (room_number). Aborting for safety.',
                v_legacy_type, v_legacy_cols, v_legacy_def;
        END IF;

        ALTER TABLE public.rooms DROP CONSTRAINT rooms_room_number_key;
        RAISE NOTICE 'Successfully verified and dropped legacy global unique constraint: rooms_room_number_key (definition: %).', v_legacy_def;
    ELSE
        RAISE NOTICE 'Legacy constraint rooms_room_number_key is absent or already dropped.';
    END IF;

    -- 3B. Detect UNEXPECTED global unique constraints on room_number (DO NOT auto-drop)
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
        RAISE EXCEPTION E'UNEXPECTED_GLOBAL_CONSTRAINT_DETECTED: Found unexpected unique constraint(s) enforcing global uniqueness on room_number:\n  - %\nAutomatic removal forbidden. Please inspect and resolve manually before migrating.',
            v_unexpected_con_details;
    END IF;

    -- 3C. Detect STANDALONE unique indexes that enforce global uniqueness on room_number
    -- NOTE: Uses i.indnkeyatts (key columns participating in uniqueness), strictly excluding non-key INCLUDE columns.
    -- This ensures indexes like `UNIQUE (room_number) INCLUDE (homestay_id)` or partial unique indexes
    -- are accurately and conservatively detected as enforcing global uniqueness.
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
        RAISE EXCEPTION E'UNEXPECTED_UNIQUE_INDEX_DETECTED: Found standalone unique index(es) enforcing global uniqueness on room_number:\n  - %\nThis index will block identical room numbers across homestays. Automatic removal forbidden. Please resolve manually before migrating.',
            v_unexpected_idx_details;
    END IF;

    RAISE NOTICE 'Constraint and index audit passed: No unexpected global uniqueness enforcement on room_number.';
END $$;

-- 4. COMPOSITE CONSTRAINT VERIFICATION & CREATION
-- Idempotently creates uq_rooms_homestay_room_number on (homestay_id, room_number).
-- Validates existing constraint definition if already present to ensure exact match.
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
        -- Resolve column names in constraint key order (explicitly cast to text[])
        SELECT COALESCE(array_agg(a.attname::text ORDER BY array_position(c.conkey, a.attnum)), ARRAY[]::text[])
        INTO v_comp_cols
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.oid = v_comp_oid
        GROUP BY c.oid;

        -- Verify existing constraint is strictly UNIQUE (homestay_id, room_number)
        IF v_comp_type <> 'u' 
           OR v_comp_cols IS DISTINCT FROM ARRAY['homestay_id', 'room_number']::text[] 
           OR v_comp_def <> 'UNIQUE (homestay_id, room_number)' THEN
            RAISE EXCEPTION 'INCOMPATIBLE_COMPOSITE_CONSTRAINT: Constraint "uq_rooms_homestay_room_number" already exists on public.rooms with unexpected type (%s), columns (%), or definition (%). Expected UNIQUE (homestay_id, room_number). Aborting.',
                v_comp_type, v_comp_cols, v_comp_def;
        END IF;

        RAISE NOTICE 'Composite constraint uq_rooms_homestay_room_number already exists with canonical definition: %.', v_comp_def;
    ELSE
        ALTER TABLE public.rooms
        ADD CONSTRAINT uq_rooms_homestay_room_number UNIQUE (homestay_id, room_number);
        RAISE NOTICE 'Successfully created composite unique constraint: uq_rooms_homestay_room_number UNIQUE (homestay_id, room_number).';
    END IF;
END $$;

-- 5. POST-MIGRATION VERIFICATION & BASELINE COMPARISON
DO $$
DECLARE
    v_base _migration_room_baseline%ROWTYPE;
    v_comp_verified BOOLEAN;
    v_legacy_remaining BOOLEAN;
    v_standalone_idx_remaining BOOLEAN;
    v_comp_def TEXT;
    v_curr_rooms INTEGER;
    v_curr_bookings INTEGER;
    v_curr_invoices INTEGER;
    v_curr_payments INTEGER;
BEGIN
    -- 5A. Retrieve baseline counts from transaction-local temporary table
    SELECT * INTO v_base FROM _migration_room_baseline LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'INTERNAL ERROR: Migration baseline record not found.';
    END IF;

    -- 5B. Verify composite constraint exists with canonical definition and ordered columns
    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conrelid = 'public.rooms'::regclass
          AND c.conname = 'uq_rooms_homestay_room_number'
          AND c.contype = 'u'
          AND (
              SELECT COALESCE(array_agg(a.attname::text ORDER BY array_position(c.conkey, a.attnum)), ARRAY[]::text[])
              FROM pg_attribute a
              WHERE a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
          ) = ARRAY['homestay_id', 'room_number']::text[]
          AND pg_get_constraintdef(c.oid) = 'UNIQUE (homestay_id, room_number)'
    ), (
        SELECT pg_get_constraintdef(c.oid)
        FROM pg_constraint c
        WHERE c.conrelid = 'public.rooms'::regclass
          AND c.conname = 'uq_rooms_homestay_room_number'
    )
    INTO v_comp_verified, v_comp_def;

    IF NOT v_comp_verified THEN
        RAISE EXCEPTION 'POST-MIGRATION VERIFICATION FAILED: Composite unique constraint uq_rooms_homestay_room_number (homestay_id, room_number) not found or invalid on public.rooms!';
    END IF;

    -- 5C. Verify legacy constraint rooms_room_number_key is absent
    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conrelid = 'public.rooms'::regclass
          AND c.conname = 'rooms_room_number_key'
    ) INTO v_legacy_remaining;

    IF v_legacy_remaining THEN
        RAISE EXCEPTION 'POST-MIGRATION VERIFICATION FAILED: Legacy global constraint rooms_room_number_key still exists on public.rooms!';
    END IF;

    -- 5D. Verify no standalone unique index on room_number remains
    SELECT EXISTS (
        SELECT 1
        FROM pg_index i
        JOIN pg_class idx_class ON idx_class.oid = i.indexrelid
        WHERE i.indrelid = 'public.rooms'::regclass
          AND i.indisunique = TRUE
          AND idx_class.relname <> 'uq_rooms_homestay_room_number'
          AND (
              SELECT COALESCE(array_agg(pg_get_indexdef(i.indexrelid, k.n, true)::text ORDER BY k.n), ARRAY[]::text[])
              FROM generate_series(1, i.indnkeyatts) AS k(n)
          ) = ARRAY['room_number']::text[]
    ) INTO v_standalone_idx_remaining;

    IF v_standalone_idx_remaining THEN
        RAISE EXCEPTION 'POST-MIGRATION VERIFICATION FAILED: Standalone unique index on room_number still exists on public.rooms!';
    END IF;

    -- 5E. Verify Business Data Immutability against original baseline counts
    SELECT COUNT(*) INTO v_curr_rooms FROM public.rooms;
    SELECT COUNT(*) INTO v_curr_bookings FROM public.bookings;
    SELECT COUNT(*) INTO v_curr_invoices FROM public.invoices;
    SELECT COUNT(*) INTO v_curr_payments FROM public.payments;

    IF v_curr_rooms <> v_base.rooms_count THEN
        RAISE EXCEPTION 'DATA IMMUTABILITY VIOLATION: rooms count changed from baseline % to current %! Aborting.',
            v_base.rooms_count, v_curr_rooms;
    END IF;
    IF v_curr_bookings <> v_base.bookings_count THEN
        RAISE EXCEPTION 'DATA IMMUTABILITY VIOLATION: bookings count changed from baseline % to current %! Aborting.',
            v_base.bookings_count, v_curr_bookings;
    END IF;
    IF v_curr_invoices <> v_base.invoices_count THEN
        RAISE EXCEPTION 'DATA IMMUTABILITY VIOLATION: invoices count changed from baseline % to current %! Aborting.',
            v_base.invoices_count, v_curr_invoices;
    END IF;
    IF v_curr_payments <> v_base.payments_count THEN
        RAISE EXCEPTION 'DATA IMMUTABILITY VIOLATION: payments count changed from baseline % to current %! Aborting.',
            v_base.payments_count, v_curr_payments;
    END IF;

    RAISE NOTICE 'MIGRATION VERIFIED: Constraint uq_rooms_homestay_room_number is active (%). Exactly % rooms, % bookings, % invoices, and % payments preserved.',
        v_comp_def, v_curr_rooms, v_curr_bookings, v_curr_invoices, v_curr_payments;
END $$;

COMMIT;
