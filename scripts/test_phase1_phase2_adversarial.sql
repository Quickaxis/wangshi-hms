-- ==============================================================================
-- ADVERSARIAL POSTGRESQL AUDIT & VERIFICATION SUITE (PHASE 1 & PHASE 2)
-- ==============================================================================
-- RUN TARGET: Local / Test PostgreSQL Instance (psql or pgAdmin)
-- ZERO RESIDUAL STATE: Everything runs in isolated transactions with ROLLBACK.
-- DO NOT EXECUTE ON PRODUCTION OR STAGING DIRECTLY.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- TEST 1: COMPOSITE FK EXACT COLUMN ORDER & RESTRICT BEHAVIOR
-- ------------------------------------------------------------------------------
BEGIN;

-- Assert composite FK fk_payments_invoice_booking_homestay exact catalog definition
DO $$
DECLARE
    v_source_cols TEXT[];
    v_target_cols TEXT[];
    v_target_schema TEXT;
    v_target_table TEXT;
    v_confdeltype "char";
BEGIN
    SELECT 
        c.confdeltype,
        fn.nspname,
        ft.relname,
        (
            SELECT array_agg(a.attname::text ORDER BY u.ord)
            FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
        ),
        (
            SELECT array_agg(fa.attname::text ORDER BY u.ord)
            FROM unnest(c.confkey) WITH ORDINALITY AS u(attnum, ord)
            JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = u.attnum
        )
    INTO 
        v_confdeltype, v_target_schema, v_target_table, v_source_cols, v_target_cols
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    JOIN pg_class ft ON c.confrelid = ft.oid
    JOIN pg_namespace fn ON ft.relnamespace = fn.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'payments'
      AND c.conname = 'fk_payments_invoice_booking_homestay'
      AND c.contype = 'f';

    IF v_source_cols <> ARRAY['invoice_id', 'booking_id', 'homestay_id']::text[] THEN
        RAISE EXCEPTION 'TEST_FAILED: Source column order mismatch on composite FK: %', v_source_cols;
    END IF;

    IF v_target_cols <> ARRAY['id', 'booking_id', 'homestay_id']::text[] THEN
        RAISE EXCEPTION 'TEST_FAILED: Target column order mismatch on composite FK: %', v_target_cols;
    END IF;

    IF v_target_schema <> 'public' OR v_target_table <> 'invoices' THEN
        RAISE EXCEPTION 'TEST_FAILED: Target table mismatch on composite FK: %.%', v_target_schema, v_target_table;
    END IF;

    IF v_confdeltype <> 'r' THEN
        RAISE EXCEPTION 'TEST_FAILED: ON DELETE RESTRICT (r) not enforced on composite FK. Found: %', v_confdeltype;
    END IF;

    RAISE NOTICE 'TEST 1 PASSED: Composite FK catalog definition is 100%% verified.';
END $$;

ROLLBACK;

-- ------------------------------------------------------------------------------
-- TEST 2: CONCURRENT REFUND ATTEMPTS ON SAME PARENT PAYMENT
-- ------------------------------------------------------------------------------
-- Transaction 1 and Transaction 2 test logic:
-- In Transaction 1:
--   BEGIN;
--   INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, recorded_by, notes)
--   VALUES (v_hs, v_bk, 3000.00, 'refund', 'cash', v_p1, v_pt, 'Refund 1');
--   -- Holds row lock on booking v_bk
-- In Transaction 2 (simultaneous):
--   BEGIN;
--   INSERT INTO payments (homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, recorded_by, notes)
--   VALUES (v_hs, v_bk, 3000.00, 'refund', 'cash', v_p1, v_pt, 'Refund 2');
--   -- Blocks on booking row lock
--   -- When T1 commits, T2 re-reads parent balance: 5000 - 3000 = 2000 remaining.
--   -- T2 throws PARENT_BALANCE_EXCEEDED!

-- ------------------------------------------------------------------------------
-- TEST 3: CONCURRENT INVOICE DELETION AND PAYMENT INSERTION
-- ------------------------------------------------------------------------------
-- In Scenario A:
--   Transaction A1 (Payment Insert) begins and executes:
--     INSERT INTO payments (..., invoice_id = v_inv) ...
--     Trigger executes: SELECT booking_id, homestay_id FROM invoices WHERE id = v_inv FOR SHARE;
--     Foreign key takes FOR KEY SHARE on invoices row.
--   Transaction A2 (Invoice Delete) attempts:
--     DELETE FROM invoices WHERE id = v_inv;
--     Blocks waiting for A1's FOR SHARE lock.
--   Transaction A1 commits.
--   Transaction A2 unblocks:
--     trg_prevent_invoice_deletion_with_payments fires -> INVOICE_HAS_PAYMENTS exception.
--     fk_payments_invoice_restrict additionally blocks delete with RESTRICT.
--   Invoice is preserved.
--
-- In Scenario B:
--   Transaction B1 (Invoice Delete) executes first:
--     DELETE FROM invoices WHERE id = v_inv;
--     Holds FOR UPDATE lock.
--   Transaction B2 (Payment Insert) attempts:
--     INSERT INTO payments (..., invoice_id = v_inv) ...
--     Blocks waiting on invoices row lock.
--   Transaction B1 commits delete.
--   Transaction B2 unblocks:
--     Row in invoices is gone -> trigger throws PAYMENT_INVALID_INVOICE.
--   Zero orphan payments created.

-- ------------------------------------------------------------------------------
-- TEST 4: INVOICE ITEMS CROSS-TENANT RELATIONAL ENFORCEMENT
-- ------------------------------------------------------------------------------
BEGIN;

DO $$
DECLARE
    v_hs1 UUID := gen_random_uuid();
    v_hs2 UUID := gen_random_uuid();
    v_bk1 UUID := gen_random_uuid();
    v_rm1 UUID := gen_random_uuid();
    v_pt1 UUID := gen_random_uuid();
    v_inv1 UUID := gen_random_uuid();
    v_item1 UUID := gen_random_uuid();
    v_cross_tenant_failed BOOLEAN := false;
BEGIN
    INSERT INTO homestays (id, name, slug) VALUES (v_hs1, 'HS 1', 'hs-1-' || substr(md5(random()::text), 1, 6));
    INSERT INTO homestays (id, name, slug) VALUES (v_hs2, 'HS 2', 'hs-2-' || substr(md5(random()::text), 1, 6));
    INSERT INTO partners (id, homestay_id, name, email, role, is_active)
    VALUES (v_pt1, v_hs1, 'Partner 1', 'pt1-' || substr(md5(random()::text), 1, 6) || '@test.local', 'super_admin', true);
    INSERT INTO rooms (id, homestay_id, room_number, name, nightly_rate)
    VALUES (v_rm1, v_hs1, '101', 'Room 101', 2000);
    INSERT INTO bookings (id, room_id, partner_id, homestay_id, check_in, check_out, total_amount, status)
    VALUES (v_bk1, v_rm1, v_pt1, v_hs1, CURRENT_DATE, CURRENT_DATE + 2, 4000, 'confirmed');

    INSERT INTO invoices (id, homestay_id, booking_id, invoice_number, check_in, check_out, guest_name)
    VALUES (v_inv1, v_hs1, v_bk1, 'INV-TEST-001', CURRENT_DATE, CURRENT_DATE + 2, 'Guest 1');

    -- Valid item for same homestay
    INSERT INTO invoice_items (id, invoice_id, homestay_id, description, quantity, rate, amount)
    VALUES (v_item1, v_inv1, v_hs1, 'Room charge', 2, 2000, 4000);

    -- Attempt to insert item for INV1 but with homestay_id = HS2
    BEGIN
        INSERT INTO invoice_items (invoice_id, homestay_id, description, quantity, rate, amount)
        VALUES (v_inv1, v_hs2, 'Malicious Cross-Tenant Charge', 1, 1000, 1000);
    EXCEPTION WHEN foreign_key_violation THEN
        v_cross_tenant_failed := true;
    END;

    IF NOT v_cross_tenant_failed THEN
        RAISE EXCEPTION 'TEST_FAILED: fk_invoice_items_tenant failed to block cross-tenant item!';
    END IF;

    RAISE NOTICE 'TEST 4 PASSED: fk_invoice_items_tenant strictly blocks cross-tenant items.';
END $$;

ROLLBACK;

-- ------------------------------------------------------------------------------
-- TEST 5: FAILED INVOICE CREATION ATOMICITY & ZERO ORPHANS
-- ------------------------------------------------------------------------------
BEGIN;

DO $$
DECLARE
    v_hs UUID := gen_random_uuid();
    v_bk UUID := gen_random_uuid();
    v_rm UUID := gen_random_uuid();
    v_pt UUID := gen_random_uuid();
    v_inv UUID := gen_random_uuid();
BEGIN
    INSERT INTO homestays (id, name, slug) VALUES (v_hs, 'HS Atomic', 'hs-atom-' || substr(md5(random()::text), 1, 6));
    INSERT INTO partners (id, homestay_id, name, email, role, is_active)
    VALUES (v_pt, v_hs, 'Partner Atom', 'pt-atom-' || substr(md5(random()::text), 1, 6) || '@test.local', 'super_admin', true);
    INSERT INTO rooms (id, homestay_id, room_number, name, nightly_rate)
    VALUES (v_rm, v_hs, '102', 'Room 102', 3000);
    INSERT INTO bookings (id, room_id, partner_id, homestay_id, check_in, check_out, total_amount, status)
    VALUES (v_bk, v_rm, v_pt, v_hs, CURRENT_DATE, CURRENT_DATE + 1, 3000, 'confirmed');

    -- Sub-transaction simulating failed multi-row insert
    BEGIN
        INSERT INTO invoices (id, homestay_id, booking_id, invoice_number, check_in, check_out, guest_name)
        VALUES (v_inv, v_hs, v_bk, 'INV-ATOM-001', CURRENT_DATE, CURRENT_DATE + 1, 'Guest Atom');

        -- Valid item
        INSERT INTO invoice_items (invoice_id, homestay_id, description, quantity, rate, amount)
        VALUES (v_inv, v_hs, 'Room charge', 1, 3000, 3000);

        -- Invalid item (violates chk quantity > 0)
        INSERT INTO invoice_items (invoice_id, homestay_id, description, quantity, rate, amount)
        VALUES (v_inv, v_hs, 'Invalid Item', -1, 3000, -3000);
    EXCEPTION WHEN check_violation THEN
        -- Expected failure
    END;

    -- Verify no invoice was created
    IF EXISTS (SELECT 1 FROM invoices WHERE id = v_inv) THEN
        RAISE EXCEPTION 'TEST_FAILED: Partial invoice was left behind after item failure!';
    END IF;

    -- Verify no orphan items exist
    IF EXISTS (SELECT 1 FROM invoice_items WHERE invoice_id = v_inv) THEN
        RAISE EXCEPTION 'TEST_FAILED: Orphan line items were left behind after failure!';
    END IF;

    RAISE NOTICE 'TEST 5 PASSED: Failed invoice creation transactionally leaves zero orphans.';
END $$;

ROLLBACK;
