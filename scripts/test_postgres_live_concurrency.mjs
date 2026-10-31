/**
 * ==============================================================================
 * LIVE POSTGRESQL CONCURRENCY & TRANSACTION AUDIT TEST SUITE
 * ==============================================================================
 * TARGET: Genuine local PostgreSQL 18 instance running on 127.0.0.1:5432.
 * ARCHITECTURE:
 * - Creates a completely disposable isolated database: `disposable_audit_live_test`.
 * - Executes actual parallel TCP client connections using node-postgres (`pg`).
 * - Runs real PostgreSQL transactions concurrently to verify row locks, triggers,
 *   foreign keys, and RPC atomicity in the PostgreSQL engine.
 * - Destroys the disposable database cleanly upon completion.
 * ==============================================================================
 */

import { Client, Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import assert from 'node:assert';

const DB_HOST = process.env.PGHOST || '127.0.0.1';
const DB_PORT = process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432;
const DB_USER = process.env.PGUSER || 'postgres';
const RUN_ID = `${Date.now()}_${process.pid}_${Math.random().toString(36).substring(2, 8)}`;
const TEST_DB_NAME = `disposable_audit_live_test_${RUN_ID}`;

// Safety Guard: Explicit list of protected databases that must never be created, overwritten, or dropped
const FORBIDDEN_DATABASE_NAMES = new Set([
  'postgres',
  'template0',
  'template1',
  'quickaxis',
  'wangshi_hms',
  'hms_wng_shi',
  'hms',
  'defaultdb',
  'supabase_admin',
]);

function assertSafeDisposableDatabaseName(dbName) {
  if (typeof dbName !== 'string' || dbName.trim() === '') {
    throw new Error(`CRITICAL DATABASE SAFETY VIOLATION: Database name must be a non-empty string.`);
  }
  const cleanName = dbName.trim().toLowerCase();
  if (FORBIDDEN_DATABASE_NAMES.has(cleanName)) {
    throw new Error(`CRITICAL DATABASE SAFETY VIOLATION: Refusing to create or drop protected system/production database: "${cleanName}".`);
  }
  if (!cleanName.startsWith('disposable_audit_live_test_')) {
    throw new Error(`CRITICAL DATABASE SAFETY VIOLATION: Database name "${cleanName}" does not have the mandatory disposable prefix 'disposable_audit_live_test_'. Operation aborted.`);
  }
  if (!/^[a-z0-9_]+$/.test(cleanName)) {
    throw new Error(`CRITICAL DATABASE SAFETY VIOLATION: Database name "${cleanName}" contains invalid characters.`);
  }
}

console.log("🚀 Starting Genuine PostgreSQL Concurrency & Transaction Audit Suite...\n");

// Helper to resolve SQL script path reliably across cwd and relative locations
function resolveSqlPath(filePath) {
  const candidates = [
    path.resolve(process.cwd(), filePath),
    path.resolve(process.cwd(), 'src', filePath),
    path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1')), path.basename(filePath)),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(`SQL file not found at any candidate location for "${filePath}":\n` + candidates.join('\n'));
}

// Helper to execute SQL script via pg client
async function executeSqlFile(client, filePath) {
  const resolved = resolveSqlPath(filePath);
  const sql = fs.readFileSync(resolved, 'utf8');
  await client.query(sql);
}

const DB_PASSWORD = process.env.PGPASSWORD || 'postgres';

async function run() {
  let dbCreated = false;
  let pool = null;

  try {
    const rootClient = new Client({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: 'postgres'
    });

    try {
      await rootClient.connect();
      console.log("✅ Connected to local PostgreSQL 18 engine.");

      // 1. Safety verification and creation of unique disposable test database
      assertSafeDisposableDatabaseName(TEST_DB_NAME);
      const existingCheck = await rootClient.query(
        `SELECT 1 FROM pg_database WHERE datname = $1;`,
        [TEST_DB_NAME]
      );
      if (existingCheck.rows.length > 0) {
        throw new Error(`Database safety violation: Generated disposable database "${TEST_DB_NAME}" unexpectedly already exists.`);
      }

      console.log(`📦 Creating unique disposable database: "${TEST_DB_NAME}"...`);
      await rootClient.query(`CREATE DATABASE "${TEST_DB_NAME}";`);
      dbCreated = true;
      console.log(`✅ Database "${TEST_DB_NAME}" created successfully.\n`);
    } finally {
      await rootClient.end().catch(() => {});
    }

    // Pool for running tests against the disposable database
    pool = new Pool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: TEST_DB_NAME,
      max: 10
    });

    const setupClient = await pool.connect();
    try {
      console.log("⚙️ Installing prerequisite core schema & Supabase auth mocks...");
      await setupClient.query(`
        -- Provision standard roles if not present
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                CREATE ROLE anon;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                CREATE ROLE authenticated;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
                CREATE ROLE service_role;
            END IF;
        END $$;

        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

        -- Core Tables
        CREATE TABLE public.homestays (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE
        );

        CREATE TABLE public.rooms (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            homestay_id UUID NOT NULL REFERENCES public.homestays(id),
            room_number TEXT NOT NULL,
            name TEXT NOT NULL,
            nightly_rate NUMERIC(12,2) DEFAULT 0.00
        );

        CREATE TABLE public.partners (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            auth_user_id UUID,
            homestay_id UUID REFERENCES public.homestays(id),
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            role TEXT DEFAULT 'partner',
            is_active BOOLEAN DEFAULT true
        );

        CREATE TABLE public.bookings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            room_id UUID REFERENCES public.rooms(id),
            partner_id UUID REFERENCES public.partners(id),
            homestay_id UUID NOT NULL REFERENCES public.homestays(id),
            check_in DATE NOT NULL,
            check_out DATE NOT NULL,
            total_amount NUMERIC(12,2) NOT NULL,
            guest_name TEXT,
            status TEXT DEFAULT 'confirmed'
        );

        -- Auth & Tenant Helper Stubs
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE plpgsql AS $$
        DECLARE
            v_val TEXT;
        BEGIN
            v_val := current_setting('request.jwt.claim.sub', true);
            IF v_val IS NULL OR v_val = '' THEN
                RETURN NULL;
            END IF;
            RETURN v_val::UUID;
        EXCEPTION WHEN OTHERS THEN
            RETURN NULL;
        END;
        $$;

        CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;

        CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS BOOLEAN LANGUAGE plpgsql AS $$
        BEGIN
            IF auth.uid() IS NULL THEN
                RETURN true; -- service role / system migrations
            END IF;
            RETURN EXISTS (
                SELECT 1 FROM public.partners
                WHERE auth_user_id = auth.uid() AND role = 'super_admin' AND is_active = true
            );
        END;
        $$;

        CREATE OR REPLACE FUNCTION public.get_user_homestay_id() RETURNS UUID LANGUAGE plpgsql AS $$
        DECLARE
            v_hid UUID;
        BEGIN
            SELECT homestay_id INTO v_hid
            FROM public.partners
            WHERE auth_user_id = auth.uid() AND is_active = true
            LIMIT 1;
            RETURN v_hid;
        END;
        $$;

        CREATE OR REPLACE FUNCTION public.is_active_partner() RETURNS BOOLEAN LANGUAGE plpgsql AS $$
        BEGIN
            IF auth.uid() IS NULL THEN
                RETURN true;
            END IF;
            RETURN EXISTS (
                SELECT 1 FROM public.partners
                WHERE auth_user_id = auth.uid() AND is_active = true
            );
        END;
        $$;
      `);
      console.log("✅ Prerequisite schema installed.");

      // 2. Apply Phase 1 and Phase 2 migrations
      console.log("📜 Executing Phase 1 Migration: migration_phase1_payments.sql...");
      await executeSqlFile(setupClient, 'scripts/migration_phase1_payments.sql');
      console.log("✅ Phase 1 Migration applied cleanly.");

      console.log("📜 Executing Phase 2 Migration: migration_phase2_invoices.sql...");
      await executeSqlFile(setupClient, 'scripts/migration_phase2_invoices.sql');
      console.log("✅ Phase 2 Migration applied cleanly.\n");

      // Setup Test Fixtures in Disposable DB
      const fixtures = await setupClient.query(`
        INSERT INTO public.homestays (name, slug) VALUES ('Wangshi Homestay', 'wangshi-hs') RETURNING id;
      `);
      const homestayId = fixtures.rows[0].id;

      const partnerRes = await setupClient.query(`
        INSERT INTO public.partners (homestay_id, name, email, role, is_active)
        VALUES ($1, 'Admin Partner', 'admin@wangshi.test', 'super_admin', true) RETURNING id;
      `, [homestayId]);
      const partnerId = partnerRes.rows[0].id;

      const roomRes = await setupClient.query(`
        INSERT INTO public.rooms (homestay_id, room_number, name, nightly_rate)
        VALUES ($1, '101', 'Heritage Suite', 5000.00) RETURNING id;
      `, [homestayId]);
      const roomId = roomRes.rows[0].id;

      const bookingRes = await setupClient.query(`
        INSERT INTO public.bookings (homestay_id, room_id, partner_id, check_in, check_out, total_amount, status)
        VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE + 2, 10000.00, 'confirmed') RETURNING id;
      `, [homestayId, roomId, partnerId]);
      const bookingId = bookingRes.rows[0].id;

      // -------------------------------------------------------------
      // TEST 1: LIVE CONCURRENT REFUNDS WITH EXPLICIT LOCK SYNCHRONIZATION
      // -------------------------------------------------------------
      console.log("⚡ TEST 1: Live Concurrent Refunds against Parent Payment (Amount: ₹5,000)...");
      const parentPayRes = await setupClient.query(`
        INSERT INTO public.payments (homestay_id, booking_id, amount, payment_type, payment_method, recorded_by, notes)
        VALUES ($1, $2, 5000.00, 'payment', 'cash', $3, 'Initial Advance') RETURNING id;
      `, [homestayId, bookingId, partnerId]);
      const parentPayId = parentPayRes.rows[0].id;

      // Launch two genuine simultaneous PostgreSQL transactions via two distinct client connections
      const client1 = await pool.connect();
      const client2 = await pool.connect();

      let t1Success = false;
      let t2Success = false;
      let t1Error = null;
      let t2Error = null;

      try {
        // 1. Obtain Client 2 backend PID for observable lock observation
        const c2PidRes = await client2.query('SELECT pg_backend_pid() AS pid;');
        const client2Pid = parseInt(c2PidRes.rows[0].pid);

        // 2. Client 1 begins transaction and inserts refund.
        // During refund validation in validate_payment_integrity(), PostgreSQL acquires
        // a row-level lock (FOR UPDATE) on the parent booking and parent payment.
        // Client 1 holds transaction open WITHOUT committing yet.
        await client1.query('BEGIN;');
        await client1.query(`
          INSERT INTO public.payments (homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, recorded_by, notes)
          VALUES ($1, $2, 3000.00, 'refund', 'cash', $3, $4, 'Refund Transaction 1');
        `, [homestayId, bookingId, parentPayId, partnerId]);

        // 3. Client 2 initiates competing refund transaction in concurrent background task.
        // It must block because row locks conflict with Client 1's active uncommitted transaction.
        let p2Finished = false;
        const p2Promise = (async () => {
          try {
            await client2.query('BEGIN;');
            await client2.query(`
              INSERT INTO public.payments (homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, recorded_by, notes)
              VALUES ($1, $2, 3000.00, 'refund', 'cash', $3, $4, 'Refund Transaction 2');
            `, [homestayId, bookingId, parentPayId, partnerId]);
            await client2.query('COMMIT;');
            t2Success = true;
          } catch (err) {
            await client2.query('ROLLBACK;').catch(() => {});
            t2Error = err;
          } finally {
            p2Finished = true;
          }
        })();

        // 4. Observable lock-wait monitoring in pg_stat_activity (identical to Test 2)
        let lockObserved = false;
        for (let attempt = 0; attempt < 50; attempt++) {
          const check = await setupClient.query(`
            SELECT pid, wait_event_type, wait_event, state
            FROM pg_stat_activity 
            WHERE pid = $1;
          `, [client2Pid]);
          if (check.rows.length > 0 && check.rows[0].wait_event_type === 'Lock') {
            lockObserved = true;
            console.log(`   🔒 Confirmed Client 2 actively queued in PostgreSQL lock manager: wait_event_type='${check.rows[0].wait_event_type}', wait_event='${check.rows[0].wait_event}'`);
            break;
          }
          await new Promise(r => setTimeout(r, 20));
        }

        assert.strictEqual(lockObserved, true, "Client 2 must be observably queued in lock wait in pg_stat_activity!");
        assert.strictEqual(p2Finished, false, "Client 2 must be blocked and incomplete while Client 1 holds uncommitted transaction!");

        // 5. Client 1 commits its transaction
        await client1.query('COMMIT;');
        t1Success = true;

        // 6. Await completion of Client 2's transaction
        await p2Promise;
      } catch (err) {
        if (!t1Success) {
          await client1.query('ROLLBACK;').catch(() => {});
          t1Error = t1Error || err;
        }
        await client2.query('ROLLBACK;').catch(() => {});
      } finally {
        client1.release();
        client2.release();
      }

      // Assert PostgreSQL engine behavior: Exactly one transaction succeeded, other failed with PARENT_BALANCE_EXCEEDED
      assert.strictEqual(t1Success !== t2Success, true, "Exactly one concurrent transaction must succeed and one must fail!");
      const failedError = t1Error || t2Error;
      assert.strictEqual(failedError !== null, true, "Failed transaction must throw an error.");
      assert.match(failedError.message, /PARENT_BALANCE_EXCEEDED/, "Error must be PARENT_BALANCE_EXCEEDED");

      // Verify PostgreSQL ledger state: Exactly one refund row of ₹3,000 exists
      const refundsCountRes = await setupClient.query(`
        SELECT COUNT(*) as count, SUM(amount) as sum FROM public.payments WHERE parent_payment_id = $1 AND payment_type = 'refund';
      `, [parentPayId]);
      assert.strictEqual(parseInt(refundsCountRes.rows[0].count), 1);
      assert.strictEqual(parseFloat(refundsCountRes.rows[0].sum), 3000.00);

      console.log("✅ TEST 1 PASSED: PostgreSQL serialized transactions; second transaction rejected with PARENT_BALANCE_EXCEEDED; cumulative refund strictly capped at original balance.\n");

      // -------------------------------------------------------------
      // TEST 2: LIVE CONCURRENT INVOICE DELETION VS PAYMENT INSERTION RACE
      // -------------------------------------------------------------
      console.log("⚡ TEST 2: Live Concurrent Invoice Deletion vs Payment Insertion Race...");
      const invoiceRes = await setupClient.query(`
        INSERT INTO public.invoices (homestay_id, booking_id, invoice_number, check_in, check_out, guest_name, grand_total, balance_due)
        VALUES ($1, $2, 'INV-CONCUR-001', CURRENT_DATE, CURRENT_DATE + 2, 'Test Guest', 5000.00, 5000.00) RETURNING id;
      `, [homestayId, bookingId]);
      const invoiceId = invoiceRes.rows[0].id;

      // Client A attempts to record a payment while Client B attempts to delete the invoice
      const clientA = await pool.connect();
      const clientB = await pool.connect();

      let payInsertSuccess = false;
      let payInsertError = null;
      let invDeleteSuccess = false;
      let deleteError = null;

      try {
        // 1. Obtain Client B backend PID for deterministic pg_stat_activity lock observation
        const pidRes = await clientB.query('SELECT pg_backend_pid();');
        const clientBPid = parseInt(pidRes.rows[0].pg_backend_pid);

        // 2. Client A begins transaction and inserts payment.
        // During FK check on invoices(id, booking_id, homestay_id), PostgreSQL acquires FOR KEY SHARE lock on invoice row.
        // Client A intentionally holds transaction open WITHOUT committing.
        await clientA.query('BEGIN;');
        await clientA.query(`
          INSERT INTO public.payments (homestay_id, booking_id, invoice_id, amount, payment_type, payment_method, recorded_by, notes)
          VALUES ($1, $2, $3, 1500.00, 'payment', 'cash', $4, 'Payment during deletion race');
        `, [homestayId, bookingId, invoiceId, partnerId]);

        // 3. Client B attempts to delete invoice in concurrent transaction.
        // DELETE requires exclusive FOR UPDATE lock on the invoice row, so it MUST wait for Client A's transaction.
        let deleteFinished = false;
        const deletePromise = (async () => {
          try {
            await clientB.query('BEGIN;');
            await clientB.query(`DELETE FROM public.invoices WHERE id = $1;`, [invoiceId]);
            await clientB.query('COMMIT;');
            invDeleteSuccess = true;
          } catch (err) {
            await clientB.query('ROLLBACK;').catch(() => {});
            deleteError = err;
          } finally {
            deleteFinished = true;
          }
        })();

        // 4. Use observable PostgreSQL lock wait in pg_stat_activity instead of timing assumptions
        let observedLockWait = false;
        for (let attempt = 0; attempt < 50; attempt++) {
          const statRes = await setupClient.query(`
            SELECT wait_event_type, wait_event, state
            FROM pg_stat_activity
            WHERE pid = $1;
          `, [clientBPid]);
          if (statRes.rows.length > 0 && statRes.rows[0].wait_event_type === 'Lock') {
            observedLockWait = true;
            break;
          }
          await new Promise(r => setTimeout(r, 20));
        }

        assert.strictEqual(observedLockWait, true, "Client B must be observably queued in lock wait in pg_stat_activity!");
        assert.strictEqual(deleteFinished, false, "Client B delete must be blocked and incomplete while Client A holds uncommitted transaction!");

        // 5. Client A commits payment transaction
        await clientA.query('COMMIT;');
        payInsertSuccess = true;

        // 6. Await completion of Client B's delete
        await deletePromise;
      } catch (err) {
        payInsertError = err;
        await clientA.query('ROLLBACK;').catch(() => {});
      } finally {
        clientA.release();
        clientB.release();
      }

      // 7. Strict assertions of exact expected payment and deletion outcomes
      assert.strictEqual(payInsertError, null, "Client A payment insertion must not produce an unhandled error.");
      assert.strictEqual(payInsertSuccess, true, "Client A payment insert must commit successfully.");
      assert.strictEqual(invDeleteSuccess, false, "Client B delete must NOT succeed once payment has committed!");
      assert.notStrictEqual(deleteError, null, "Client B delete must fail with an explicit database error.");
      assert.match(
        deleteError.message,
        /INVOICE_HAS_PAYMENTS|violates foreign key constraint|cannot delete invoice with existing payments/i,
        "Delete must be blocked by trigger trg_prevent_invoice_deletion_with_payments or foreign key RESTRICT."
      );

      // 8. Assert final invoice and payment state after both transactions
      const finalInvoiceRes = await setupClient.query(
        `SELECT id, invoice_number, status FROM public.invoices WHERE id = $1;`,
        [invoiceId]
      );
      assert.strictEqual(finalInvoiceRes.rows.length, 1, "Invoice must still exist in database.");
      assert.strictEqual(finalInvoiceRes.rows[0].id, invoiceId);

      const finalPaymentRes = await setupClient.query(
        `SELECT id, amount, payment_type, invoice_id FROM public.payments WHERE invoice_id = $1;`,
        [invoiceId]
      );
      assert.strictEqual(finalPaymentRes.rows.length, 1, "Payment must be persisted in database.");
      assert.strictEqual(parseFloat(finalPaymentRes.rows[0].amount), 1500.00);
      assert.strictEqual(finalPaymentRes.rows[0].invoice_id, invoiceId);

      console.log("✅ TEST 2 PASSED: Mutual exclusion verified with observable pg_stat_activity lock wait; deletion strictly blocked by committed payment; invoice and payment state verified.\n");

      // -------------------------------------------------------------
      // TEST 3: LIVE ATOMIC INVOICE + ITEMS RPC WITH ROLLBACK
      // -------------------------------------------------------------
      console.log("🛡️ TEST 3: Live Atomic Invoice + Items RPC Transaction...");
      
      // Case 3A: Valid invoice + valid items
      const validRpcRes = await setupClient.query(`
        SELECT public.create_invoice_with_items(
            $1, 'INV-RPC-001', 'Atomic Guest', CURRENT_DATE, CURRENT_DATE + 2,
            5000.00, 5.00, 250.00, 0.00, 5250.00,
            '[{"description": "Deluxe Room", "quantity": 1, "rate": 5000, "amount": 5000, "category": "room"}]'::jsonb
        ) AS invoice_id;
      `, [bookingId]);
      const validInvoiceId = validRpcRes.rows[0].invoice_id;
      assert.strictEqual(typeof validInvoiceId, 'string');

      // Verify invoice and item were committed
      const itemsCount = await setupClient.query(`SELECT COUNT(*) FROM public.invoice_items WHERE invoice_id = $1;`, [validInvoiceId]);
      assert.strictEqual(parseInt(itemsCount.rows[0].count), 1);

      // Case 3B: Valid invoice + INVALID line item (quantity <= 0)
      let rpcFailed = false;
      try {
        await setupClient.query(`
          SELECT public.create_invoice_with_items(
              $1, 'INV-RPC-FAIL', 'Failing Guest', CURRENT_DATE, CURRENT_DATE + 2,
              5000.00, 0.00, 0.00, 0.00, 5000.00,
              '[
                {"description": "Room", "quantity": 1, "rate": 5000, "amount": 5000, "category": "room"},
                {"description": "Bad Item", "quantity": -1, "rate": 500, "amount": -500, "category": "room"}
              ]'::jsonb
          );
        `, [bookingId]);
      } catch (err) {
        rpcFailed = true;
      }
      assert.strictEqual(rpcFailed, true, "RPC call with invalid item must throw exception!");

      // Assert rollback: Zero invoices created with number 'INV-RPC-FAIL', zero orphan items
      const failInvCheck = await setupClient.query(`SELECT 1 FROM public.invoices WHERE invoice_number = 'INV-RPC-FAIL';`);
      assert.strictEqual(failInvCheck.rows.length, 0, "Failed invoice must not exist in database!");

      const orphanItemCheck = await setupClient.query(`SELECT 1 FROM public.invoice_items WHERE description = 'Bad Item' OR description = 'Room' AND invoice_id NOT IN (SELECT id FROM public.invoices);`);
      assert.strictEqual(orphanItemCheck.rows.length, 0, "No orphan invoice items must remain!");

      console.log("✅ TEST 3 PASSED: create_invoice_with_items executes atomically; failed line item rolled back entire invoice.\n");

      // Case 3C: Cross-tenant invoice_items relational rejection
      console.log("🔒 TEST 3C: Live Invoice Items Cross-Tenant Relational Rejection...");
      const hs2Res = await setupClient.query(`
        INSERT INTO public.homestays (name, slug) VALUES ('Second Homestay', 'second-hs') RETURNING id;
      `);
      const homestayId2 = hs2Res.rows[0].id;

      let crossTenantRejected = false;
      try {
        await setupClient.query(`
          INSERT INTO public.invoice_items (invoice_id, homestay_id, category, description, quantity, rate, amount)
          VALUES ($1, $2, 'room', 'Malicious Cross-Tenant Item', 1, 1000, 1000);
        `, [validInvoiceId, homestayId2]);
      } catch (err) {
        crossTenantRejected = true;
        assert.match(err.message, /violates foreign key constraint|fk_invoice_items_tenant/, "Must violate fk_invoice_items_tenant");
      }
      assert.strictEqual(crossTenantRejected, true, "Cross-tenant invoice item must be rejected by foreign key constraint!");
      console.log("✅ TEST 3C PASSED: fk_invoice_items_tenant strictly blocks cross-tenant invoice items in PostgreSQL.\n");

      // Case 3D: Server-side validation of invoice totals inside PostgreSQL
      console.log("🧮 TEST 3D: Server-Side Invoice Totals Validation Inside PostgreSQL...");
      let totalMismatchRejected = false;
      try {
        await setupClient.query(`
          SELECT public.create_invoice_with_items(
              $1, 'INV-FRAUD-001', 'Fraud Guest', CURRENT_DATE, CURRENT_DATE + 2,
              5000.00, 5.00, 250.00, 0.00, 100.00, -- Fraudulent grand_total: claimed 100 vs actual 5250
              '[{"description": "Deluxe Room", "quantity": 1, "rate": 5000, "amount": 5000, "category": "room"}]'::jsonb
          );
        `, [bookingId]);
      } catch (err) {
        totalMismatchRejected = true;
        assert.match(err.message, /INVOICE_TOTAL_MISMATCH/, "Must reject mismatched grand total");
      }
      assert.strictEqual(totalMismatchRejected, true, "PostgreSQL must reject fraudulent grand total!");
      console.log("✅ TEST 3D PASSED: PostgreSQL recalculates subtotal and rejects mismatched client totals.\n");

      // Case 3E: Hardened booking ID access-denied error (non-existent vs cross-tenant)
      console.log("🛡️ TEST 3E: Hardened Uniform Booking Authorization Errors...");
      const randomFakeBooking = '00000000-0000-0000-0000-000000009999';
      let fakeBookingError = null;
      try {
        await setupClient.query(`
          SELECT public.create_invoice_with_items(
              $1, 'INV-TEST-002', 'Guest', CURRENT_DATE, CURRENT_DATE + 2,
              1000.00, 0.00, 0.00, 0.00, 1000.00,
              '[{"description": "Item", "quantity": 1, "rate": 1000, "amount": 1000}]'::jsonb
          );
        `, [randomFakeBooking]);
      } catch (err) {
        fakeBookingError = err;
      }
      assert.strictEqual(fakeBookingError !== null, true);
      assert.match(fakeBookingError.message, /ACCESS_DENIED/, "Must return ACCESS_DENIED for non-existent booking");
      console.log("✅ TEST 3E PASSED: Non-existent booking returns hardened ACCESS_DENIED without leaking existence.\n");

      // Case 3F: Atomic update_invoice_with_items execution
      console.log("🔄 TEST 3F: Atomic update_invoice_with_items RPC Execution...");
      await setupClient.query(`
        SELECT public.update_invoice_with_items(
            $1, 
            jsonb_build_object(
              'invoice_number', 'INV-RPC-001',
              'guest_name', 'Updated Atomic Guest',
              'check_in', CURRENT_DATE,
              'check_out', CURRENT_DATE + 3,
              'subtotal', 6000.00,
              'tax_rate', 5.00,
              'tax_amount', 300.00,
              'flat_discount', 0.00,
              'grand_total', 6300.00
            ),
            '[
              {"description": "Suite Room", "quantity": 1, "rate": 5000, "amount": 5000, "category": "room"},
              {"description": "Dinner Buffet", "quantity": 1, "rate": 1000, "amount": 1000, "category": "food_beverage"}
            ]'::jsonb
        );
      `, [validInvoiceId]);

      const updatedInv = await setupClient.query(`SELECT guest_name, grand_total FROM public.invoices WHERE id = $1;`, [validInvoiceId]);
      assert.strictEqual(updatedInv.rows[0].guest_name, 'Updated Atomic Guest');
      assert.strictEqual(parseFloat(updatedInv.rows[0].grand_total), 6300.00);

      const updatedItems = await setupClient.query(`SELECT COUNT(*) FROM public.invoice_items WHERE invoice_id = $1;`, [validInvoiceId]);
      assert.strictEqual(parseInt(updatedItems.rows[0].count), 2);
      console.log("✅ TEST 3F PASSED: update_invoice_with_items updated header and replaced items atomically.\n");

      // Case 3G: update_invoice_with_items rejection when invoice has recorded payments
      console.log("🔒 TEST 3G: update_invoice_with_items Rejection When Invoice Has Recorded Payments...");
      await setupClient.query(`
        INSERT INTO public.payments (homestay_id, booking_id, invoice_id, amount, payment_type, payment_method, recorded_by, notes)
        VALUES ($1, $2, $3, 2000.00, 'payment', 'cash', $4, 'Payment on valid invoice');
      `, [homestayId, bookingId, validInvoiceId, partnerId]);

      let paidUpdateRejected = false;
      try {
        await setupClient.query(`
          SELECT public.update_invoice_with_items(
              $1,
              jsonb_build_object(
                'invoice_number', 'INV-RPC-001',
                'guest_name', 'Malicious Edit After Payment',
                'subtotal', 1000.00,
                'grand_total', 1000.00
              ),
              '[{"description": "Cheap Room", "quantity": 1, "rate": 1000, "amount": 1000, "category": "room"}]'::jsonb
          );
        `, [validInvoiceId]);
      } catch (err) {
        paidUpdateRejected = true;
        assert.match(err.message, /INVOICE_HAS_PAYMENTS_IMMUTABLE/, "Must reject update when payments exist");
      }
      assert.strictEqual(paidUpdateRejected, true, "Invoice with recorded payments must reject item mutation!");
      console.log("✅ TEST 3G PASSED: Invoices with recorded payments strictly reject line item modifications.\n");

      // -------------------------------------------------------------
      // Case 3H: Presence-Aware Partial-Update Semantics (Omitted vs NULL vs Empty vs Literal '__UNCHANGED__')
      // -------------------------------------------------------------
      console.log("📝 TEST 3H: Presence-Aware Partial-Update Semantics (Omitted vs NULL vs Empty vs Literal '__UNCHANGED__')...");
      // Create invoice with full optional details
      const inv3HRes = await setupClient.query(`
        SELECT public.create_invoice_with_items(
            $1, 'INV-PARTIAL-001', 'Partial Test Guest', CURRENT_DATE, CURRENT_DATE + 2,
            5000.00, 0.00, 0.00, 0.00, 5000.00,
            '[{"description": "Room", "quantity": 1, "rate": 5000, "amount": 5000, "category": "room"}]'::jsonb,
            CURRENT_DATE, 'draft', '+91 9999999999', 'guest@test.com', '123 Test St', $2, 'Room 101', 'Original notes', 'Original rules'
        ) AS id;
      `, [bookingId, roomId]);
      const inv3HId = inv3HRes.rows[0].id;

      // 1. Partial update: omit guest_phone, notes, house_rules, room_name (keys not present in p_patch)
      await setupClient.query(`
        SELECT public.update_invoice_with_items(
            p_invoice_id := $1,
            p_patch := jsonb_build_object(
              'guest_name', 'Updated Partial Guest'
            )
        );
      `, [inv3HId]);

      const invCheckPreserved = await setupClient.query(`
        SELECT guest_name, guest_phone, guest_email, guest_address, notes, house_rules, room_name, room_id, subtotal
        FROM public.invoices WHERE id = $1;
      `, [inv3HId]);
      const pRow = invCheckPreserved.rows[0];
      assert.strictEqual(pRow.guest_name, 'Updated Partial Guest');
      assert.strictEqual(pRow.guest_phone, '+91 9999999999', "Omitted guest_phone must NOT be overwritten with NULL!");
      assert.strictEqual(pRow.guest_email, 'guest@test.com', "Omitted guest_email must NOT be overwritten with NULL!");
      assert.strictEqual(pRow.notes, 'Original notes', "Omitted notes must NOT be overwritten with NULL!");
      assert.strictEqual(pRow.house_rules, 'Original rules', "Omitted house_rules must NOT be overwritten with NULL!");
      assert.strictEqual(pRow.room_name, 'Room 101', "Omitted room_name must NOT be overwritten with NULL!");
      assert.strictEqual(pRow.room_id, roomId, "Omitted room_id must NOT be overwritten with NULL!");
      assert.strictEqual(parseFloat(pRow.subtotal), 5000.00, "Omitted items must preserve existing subtotal!");

      // 2. Intentional clear: pass p_patch with 'notes': null, 'guest_phone': ''
      await setupClient.query(`
        SELECT public.update_invoice_with_items(
            p_invoice_id := $1,
            p_patch := jsonb_build_object(
              'guest_phone', '',
              'notes', null
            )
        );
      `, [inv3HId]);

      const invCheckCleared = await setupClient.query(`
        SELECT guest_phone, notes, guest_email
        FROM public.invoices WHERE id = $1;
      `, [inv3HId]);
      assert.strictEqual(invCheckCleared.rows[0].guest_phone, null, "Passing empty string must intentionally clear guest_phone to NULL.");
      assert.strictEqual(invCheckCleared.rows[0].notes, null, "Passing NULL must intentionally clear notes to NULL.");
      assert.strictEqual(invCheckCleared.rows[0].guest_email, 'guest@test.com', "Omitted field must remain preserved when other fields are cleared.");

      // 3. Literal string '__UNCHANGED__': pass literal '__UNCHANGED__' in notes
      await setupClient.query(`
        SELECT public.update_invoice_with_items(
            p_invoice_id := $1,
            p_patch := jsonb_build_object(
              'notes', '__UNCHANGED__'
            )
        );
      `, [inv3HId]);

      const invCheckLiteral = await setupClient.query(`
        SELECT notes FROM public.invoices WHERE id = $1;
      `, [inv3HId]);
      assert.strictEqual(invCheckLiteral.rows[0].notes, '__UNCHANGED__', "Literal '__UNCHANGED__' must be stored literally and not treated as a sentinel!");
      console.log("✅ TEST 3H PASSED: Partial update preserved omitted fields; null/empty cleared fields; literal '__UNCHANGED__' stored literally.\n");

      // -------------------------------------------------------------
      // Case 3I: Strict Line Item Amount Verification & Negative Value Rejection
      // -------------------------------------------------------------
      console.log("🧮 TEST 3I: Strict Line Item Amount Verification & Negative Rejections...");
      // Negative quantity
      let negQtyErr = null;
      try {
        await setupClient.query(`
          SELECT public.create_invoice_with_items(
              $1, 'INV-FAIL-QTY', 'Guest', CURRENT_DATE, CURRENT_DATE + 1,
              1000.00, 0.00, 0.00, 0.00, 1000.00,
              '[{"description": "Room", "quantity": 0, "rate": 1000, "amount": 0, "category": "room"}]'::jsonb
          );
        `, [bookingId]);
      } catch (e) { negQtyErr = e; }
      assert.strictEqual(negQtyErr !== null, true);
      assert.match(negQtyErr.message, /INVALID_ITEM_QUANTITY/);

      // Negative rate
      let negRateErr = null;
      try {
        await setupClient.query(`
          SELECT public.create_invoice_with_items(
              $1, 'INV-FAIL-RATE', 'Guest', CURRENT_DATE, CURRENT_DATE + 1,
              1000.00, 0.00, 0.00, 0.00, 1000.00,
              '[{"description": "Room", "quantity": 1, "rate": -500, "amount": -500, "category": "room"}]'::jsonb
          );
        `, [bookingId]);
      } catch (e) { negRateErr = e; }
      assert.strictEqual(negRateErr !== null, true);
      assert.match(negRateErr.message, /INVALID_ITEM_RATE/);

      // Negative amount
      let negAmtErr = null;
      try {
        await setupClient.query(`
          SELECT public.create_invoice_with_items(
              $1, 'INV-FAIL-AMT', 'Guest', CURRENT_DATE, CURRENT_DATE + 1,
              1000.00, 0.00, 0.00, 0.00, 1000.00,
              '[{"description": "Discount", "quantity": 1, "rate": 500, "amount": -500, "category": "discount"}]'::jsonb
          );
        `, [bookingId]);
      } catch (e) { negAmtErr = e; }
      assert.strictEqual(negAmtErr !== null, true);
      assert.match(negAmtErr.message, /INVALID_ITEM_AMOUNT/);

      // Mismatched amount vs quantity * rate
      let mismatchAmtErr = null;
      try {
        await setupClient.query(`
          SELECT public.create_invoice_with_items(
              $1, 'INV-FAIL-CALC', 'Guest', CURRENT_DATE, CURRENT_DATE + 1,
              1000.00, 0.00, 0.00, 0.00, 1000.00,
              '[{"description": "Room", "quantity": 2, "rate": 500, "amount": 999.00, "category": "room"}]'::jsonb
          );
        `, [bookingId]);
      } catch (e) { mismatchAmtErr = e; }
      assert.strictEqual(mismatchAmtErr !== null, true);
      assert.match(mismatchAmtErr.message, /INVALID_ITEM_AMOUNT.*does not match/);
      console.log("✅ TEST 3I PASSED: Negative quantities, negative rates, negative amounts, and quantity*rate mismatches strictly rejected.\n");

      // -------------------------------------------------------------
      // Case 3J: Explicit Discount-Item Calculation & Subtotal Exceeded Rejection
      // -------------------------------------------------------------
      console.log("🏷️ TEST 3J: Explicit Discount-Item Calculation & Limit Enforcement...");
      // Valid discount item
      const discInvRes = await setupClient.query(`
        SELECT public.create_invoice_with_items(
            $1, 'INV-DISC-001', 'Discount Guest', CURRENT_DATE, CURRENT_DATE + 2,
            5000.00, 10.00, 450.00, 0.00, 4950.00,
            '[
              {"description": "Deluxe Suite", "quantity": 1, "rate": 5000, "amount": 5000, "category": "room"},
              {"description": "Promotional Voucher", "quantity": 1, "rate": 500, "amount": 500, "category": "discount"}
            ]'::jsonb
        ) AS id;
      `, [bookingId]);
      const discInvId = discInvRes.rows[0].id;
      const discCheck = await setupClient.query(`SELECT subtotal, tax_amount, grand_total FROM public.invoices WHERE id = $1;`, [discInvId]);
      assert.strictEqual(parseFloat(discCheck.rows[0].subtotal), 5000.00);
      assert.strictEqual(parseFloat(discCheck.rows[0].tax_amount), 450.00); // (5000 - 500) * 10% = 450
      assert.strictEqual(parseFloat(discCheck.rows[0].grand_total), 4950.00);

      // Discount exceeding subtotal
      let discExceedErr = null;
      try {
        await setupClient.query(`
          SELECT public.create_invoice_with_items(
              $1, 'INV-FAIL-DISC', 'Over Discount Guest', CURRENT_DATE, CURRENT_DATE + 1,
              1000.00, 0.00, 0.00, 0.00, 0.00,
              '[
                {"description": "Room", "quantity": 1, "rate": 1000, "amount": 1000, "category": "room"},
                {"description": "Excessive Discount", "quantity": 1, "rate": 1500, "amount": 1500, "category": "discount"}
              ]'::jsonb
          );
        `, [bookingId]);
      } catch (e) { discExceedErr = e; }
      assert.strictEqual(discExceedErr !== null, true);
      assert.match(discExceedErr.message, /DISCOUNT_EXCEEDS_SUBTOTAL/);
      console.log("✅ TEST 3J PASSED: Discount items properly calculated; total discounts exceeding subtotal strictly rejected.\n");

      // -------------------------------------------------------------
      // Case 3K: Zero-Tolerance Exact Paise Comparison
      // -------------------------------------------------------------
      console.log("🎯 TEST 3K: Zero-Tolerance Exact Paise Comparison...");
      // Subtotal off by 1 paisa (₹0.01)
      let paiseMismatchErr = null;
      try {
        await setupClient.query(`
          SELECT public.create_invoice_with_items(
              $1, 'INV-PAISE-FAIL', 'Paise Mismatch', CURRENT_DATE, CURRENT_DATE + 1,
              1000.01, 0.00, 0.00, 0.00, 1000.01,
              '[{"description": "Room", "quantity": 1, "rate": 1000, "amount": 1000, "category": "room"}]'::jsonb
          );
        `, [bookingId]);
      } catch (e) { paiseMismatchErr = e; }
      assert.strictEqual(paiseMismatchErr !== null, true);
      assert.match(paiseMismatchErr.message, /INVOICE_TOTAL_MISMATCH/);

      // Tax off by 1 paisa (₹0.01)
      let taxPaiseErr = null;
      try {
        await setupClient.query(`
          SELECT public.create_invoice_with_items(
              $1, 'INV-TAX-FAIL', 'Tax Paise Mismatch', CURRENT_DATE, CURRENT_DATE + 1,
              1000.00, 10.00, 100.01, 0.00, 1100.00,
              '[{"description": "Room", "quantity": 1, "rate": 1000, "amount": 1000, "category": "room"}]'::jsonb
          );
        `, [bookingId]);
      } catch (e) { taxPaiseErr = e; }
      assert.strictEqual(taxPaiseErr !== null, true);
      assert.match(taxPaiseErr.message, /INVOICE_TOTAL_MISMATCH/);

      console.log("✅ TEST 3K PASSED: 0.05 tolerance eliminated; exact paise mismatch rejected with zero tolerance.\n");

      // -------------------------------------------------------------
      // Case 3L: Explicit Non-Array JSON Validation for p_items and p_patch
      // -------------------------------------------------------------
      console.log("🛡️ TEST 3L: Explicit Non-Array JSON Validation (p_items & p_patch)...");
      // 1. create_invoice_with_items rejecting non-array p_items
      const nonArrayPayloads = [
        { label: "Object", val: '{"item": 1}' },
        { label: "String", val: '"invalid_payload_string"' },
        { label: "Number", val: '12345' },
        { label: "Boolean", val: 'true' }
      ];

      for (const p of nonArrayPayloads) {
        let createErr = null;
        try {
          await setupClient.query(`
            SELECT public.create_invoice_with_items(
                $1, 'INV-JSON-FAIL', 'JSON Guest', CURRENT_DATE, CURRENT_DATE + 1,
                1000.00, 0.00, 0.00, 0.00, 1000.00,
                $2::jsonb
            );
          `, [bookingId, p.val]);
        } catch (e) { createErr = e; }
        assert.strictEqual(createErr !== null, true, `create_invoice_with_items must reject ${p.label} for p_items`);
        assert.match(createErr.message, /INVALID_ITEMS_PAYLOAD/, `Expected INVALID_ITEMS_PAYLOAD for ${p.label}`);
      }

      // Test SQL NULL for create_invoice_with_items
      let nullCreateErr = null;
      try {
        await setupClient.query(`
          SELECT public.create_invoice_with_items(
              $1, 'INV-JSON-FAIL', 'JSON Guest', CURRENT_DATE, CURRENT_DATE + 1,
              1000.00, 0.00, 0.00, 0.00, 1000.00,
              NULL
          );
        `, [bookingId]);
      } catch (e) { nullCreateErr = e; }
      assert.strictEqual(nullCreateErr !== null, true, "create_invoice_with_items must reject NULL for p_items");
      assert.match(nullCreateErr.message, /INVALID_ITEMS_PAYLOAD/);

      // 2. update_invoice_with_items rejecting non-array non-null p_items
      for (const p of nonArrayPayloads) {
        let updateErr = null;
        try {
          await setupClient.query(`
            SELECT public.update_invoice_with_items(
                p_invoice_id := $1,
                p_patch := '{}'::jsonb,
                p_items := $2::jsonb
            );
          `, [inv3HId, p.val]);
        } catch (e) { updateErr = e; }
        assert.strictEqual(updateErr !== null, true, `update_invoice_with_items must reject ${p.label} for p_items`);
        assert.match(updateErr.message, /INVALID_ITEMS_PAYLOAD/, `Expected INVALID_ITEMS_PAYLOAD for ${p.label}`);
      }

      // 3. update_invoice_with_items with SQL NULL p_items must succeed (preserve items)
      await setupClient.query(`
        SELECT public.update_invoice_with_items(
            p_invoice_id := $1,
            p_patch := '{"guest_name": "Preserved Items Guest"}'::jsonb,
            p_items := NULL
        );
      `, [inv3HId]);
      const checkItemsPreserved = await setupClient.query(`SELECT COUNT(*) FROM public.invoice_items WHERE invoice_id = $1;`, [inv3HId]);
      assert.strictEqual(parseInt(checkItemsPreserved.rows[0].count) > 0, true, "SQL NULL for p_items in update must preserve existing items!");

      // 4. update_invoice_with_items rejecting non-object p_patch
      let badPatchErr = null;
      try {
        await setupClient.query(`
          SELECT public.update_invoice_with_items(
              p_invoice_id := $1,
              p_patch := '[1, 2, 3]'::jsonb
          );
        `, [inv3HId]);
      } catch (e) { badPatchErr = e; }
      assert.strictEqual(badPatchErr !== null, true, "update_invoice_with_items must reject array for p_patch");
      assert.match(badPatchErr.message, /INVALID_PATCH_PAYLOAD/);

      console.log("✅ TEST 3L PASSED: Non-array p_items (objects, strings, numbers, booleans, null) and invalid patches strictly rejected.\n");

      // -------------------------------------------------------------
      // Case 3M: Discount Accounting: Combined Flat & Itemized Discounts
      // -------------------------------------------------------------
      console.log("💰 TEST 3M: Discount Accounting: Combined Flat and Itemized Discounts...");
      // Subtotal: 6000 (Room 5000 + Food 1000)
      // Itemized discount: 500 (Early Bird)
      // Flat discount: 300
      // Total discount: 800
      // Net before tax: 5200
      // Tax (10%): 520
      // Grand total: 5720
      const combInvRes = await setupClient.query(`
        SELECT public.create_invoice_with_items(
            $1, 'INV-COMB-DISC', 'Combined Discount Guest', CURRENT_DATE, CURRENT_DATE + 2,
            6000.00, 10.00, 520.00, 300.00, 5720.00,
            '[
              {"description": "Room Stay", "quantity": 1, "rate": 5000, "amount": 5000, "category": "room"},
              {"description": "Breakfast Buffet", "quantity": 1, "rate": 1000, "amount": 1000, "category": "food_beverage"},
              {"description": "Early Bird Discount", "quantity": 1, "rate": 500, "amount": 500, "category": "discount"}
            ]'::jsonb
        ) AS id;
      `, [bookingId]);
      const combInvId = combInvRes.rows[0].id;

      const combCheck = await setupClient.query(`
        SELECT subtotal, discount_amount, tax_rate, tax_amount, grand_total, balance_due 
        FROM public.invoices WHERE id = $1;
      `, [combInvId]);
      const cRow = combCheck.rows[0];
      assert.strictEqual(parseFloat(cRow.subtotal), 6000.00);
      assert.strictEqual(parseFloat(cRow.discount_amount), 800.00, "invoices.discount_amount must store TOTAL discount (itemized 500 + flat 300)!");
      assert.strictEqual(parseFloat(cRow.tax_amount), 520.00);
      assert.strictEqual(parseFloat(cRow.grand_total), 5720.00);
      assert.strictEqual(parseFloat(cRow.balance_due), 5720.00);
      // Mathematical identity verification
      const mathIdentity = parseFloat(cRow.subtotal) - parseFloat(cRow.discount_amount) + parseFloat(cRow.tax_amount);
      assert.strictEqual(mathIdentity, parseFloat(cRow.grand_total), "Accounting identity (subtotal - discount_amount + tax_amount = grand_total) must hold exactly!");

      // Update invoice with new flat discount = 400.00
      // Total discount becomes 500 + 400 = 900.00
      // Net before tax: 6000 - 900 = 5100.00
      // Tax (10%): 510.00
      // Grand total: 5610.00
      await setupClient.query(`
        SELECT public.update_invoice_with_items(
            p_invoice_id := $1,
            p_patch := jsonb_build_object(
              'flat_discount', 400.00,
              'tax_rate', 10.00,
              'subtotal', 6000.00,
              'tax_amount', 510.00,
              'grand_total', 5610.00
            ),
            p_items := '[
              {"description": "Room Stay", "quantity": 1, "rate": 5000, "amount": 5000, "category": "room"},
              {"description": "Breakfast Buffet", "quantity": 1, "rate": 1000, "amount": 1000, "category": "food_beverage"},
              {"description": "Early Bird Discount", "quantity": 1, "rate": 500, "amount": 500, "category": "discount"}
            ]'::jsonb
        );
      `, [combInvId]);

      const combUpdatedCheck = await setupClient.query(`
        SELECT subtotal, discount_amount, tax_amount, grand_total, balance_due 
        FROM public.invoices WHERE id = $1;
      `, [combInvId]);
      const cuRow = combUpdatedCheck.rows[0];
      assert.strictEqual(parseFloat(cuRow.subtotal), 6000.00);
      assert.strictEqual(parseFloat(cuRow.discount_amount), 900.00, "Updated discount_amount must reflect new flat discount (400) + itemized (500) = 900!");
      assert.strictEqual(parseFloat(cuRow.tax_amount), 510.00);
      assert.strictEqual(parseFloat(cuRow.grand_total), 5610.00);
      assert.strictEqual(parseFloat(cuRow.balance_due), 5610.00);
      console.log("✅ TEST 3M PASSED: Combined flat and itemized discounts reconciled to exact paise across create and update.\n");

      // -------------------------------------------------------------
      // Case 3M2: Targeted Regression Lifecycle: Create, Reload, Update, Reload
      // Values: Subtotal ₹5000, Itemized Discount ₹500, Flat Discount ₹200, Total Discount ₹700, Grand Total ₹4300
      // -------------------------------------------------------------
      console.log("🔄 TEST 3M2: Targeted Regression Lifecycle: Create, Reload, Update, Reload...");
      // Step 1: Create
      const regrInvRes = await setupClient.query(`
        SELECT public.create_invoice_with_items(
            $1, 'INV-REGR-DISC', 'Regression Guest', CURRENT_DATE, CURRENT_DATE + 2,
            5000.00, 0.00, 0.00, 200.00, 4300.00,
            '[
              {"description": "Room Stay", "quantity": 1, "rate": 5000, "amount": 5000, "category": "room"},
              {"description": "Promotional Discount", "quantity": 1, "rate": 500, "amount": 500, "category": "discount"}
            ]'::jsonb
        ) AS id;
      `, [bookingId]);
      const regrInvId = regrInvRes.rows[0].id;

      // Assert Step 1 Database state
      const check1 = await setupClient.query(`
        SELECT subtotal, discount_amount, tax_rate, tax_amount, grand_total, balance_due 
        FROM public.invoices WHERE id = $1;
      `, [regrInvId]);
      const r1 = check1.rows[0];
      assert.strictEqual(parseFloat(r1.subtotal), 5000.00, "Subtotal must be ₹5,000.00");
      assert.strictEqual(parseFloat(r1.discount_amount), 700.00, "Stored discount_amount must be TOTAL discount ₹700.00 (₹500 itemized + ₹200 flat)!");
      assert.strictEqual(parseFloat(r1.grand_total), 4300.00, "Grand total must be ₹4,300.00!");
      assert.strictEqual(parseFloat(r1.balance_due), 4300.00, "Balance due must be ₹4,300.00!");

      // Step 2: Reload 1 (Simulate reopening the invoice in InvoiceEditorModal / getInvoiceByIdAction)
      const itemsCheck1 = await setupClient.query(`
        SELECT category, description, amount FROM public.invoice_items WHERE invoice_id = $1;
      `, [regrInvId]);
      const itemizedDisc1 = itemsCheck1.rows
        .filter(it => it.category === 'discount')
        .reduce((sum, it) => sum + parseFloat(it.amount), 0);
      assert.strictEqual(itemizedDisc1, 500.00, "Itemized discount must be ₹500.00");

      const derivedFlat1 = Math.max(0, parseFloat(r1.discount_amount) - itemizedDisc1);
      assert.strictEqual(derivedFlat1, 200.00, "Modal derived flat discount must remain exactly ₹200.00 (700 - 500)!");

      // Step 3: Update (User updates guest name and preserves flat discount ₹200)
      await setupClient.query(`
        SELECT public.update_invoice_with_items(
            p_invoice_id := $1,
            p_patch := jsonb_build_object(
              'guest_name', 'Regression Guest Renamed',
              'flat_discount', $2::numeric,
              'tax_rate', 0.00,
              'subtotal', 5000.00,
              'tax_amount', 0.00,
              'grand_total', 4300.00
            ),
            p_items := '[
              {"description": "Room Stay", "quantity": 1, "rate": 5000, "amount": 5000, "category": "room"},
              {"description": "Promotional Discount", "quantity": 1, "rate": 500, "amount": 500, "category": "discount"}
            ]'::jsonb
        );
      `, [regrInvId, derivedFlat1]);

      // Step 4: Reload 2 (Confirm state after update)
      const check2 = await setupClient.query(`
        SELECT guest_name, subtotal, discount_amount, tax_rate, tax_amount, grand_total, balance_due 
        FROM public.invoices WHERE id = $1;
      `, [regrInvId]);
      const r2 = check2.rows[0];
      assert.strictEqual(r2.guest_name, 'Regression Guest Renamed', "Guest name must be updated!");
      assert.strictEqual(parseFloat(r2.subtotal), 5000.00, "Subtotal must remain ₹5,000.00");
      assert.strictEqual(parseFloat(r2.discount_amount), 700.00, "Stored discount_amount must remain ₹700.00 (NOT double-counted to ₹900)!");
      assert.strictEqual(parseFloat(r2.grand_total), 4300.00, "Grand total must remain ₹4,300.00!");

      const itemsCheck2 = await setupClient.query(`
        SELECT category, description, amount FROM public.invoice_items WHERE invoice_id = $1;
      `, [regrInvId]);
      const itemizedDisc2 = itemsCheck2.rows
        .filter(it => it.category === 'discount')
        .reduce((sum, it) => sum + parseFloat(it.amount), 0);
      assert.strictEqual(itemizedDisc2, 500.00, "Itemized discount must remain ₹500.00");

      const derivedFlat2 = Math.max(0, parseFloat(r2.discount_amount) - itemizedDisc2);
      assert.strictEqual(derivedFlat2, 200.00, "Modal derived flat discount after reload must remain exactly ₹200.00!");

      // Step 5: Second Update: Modify flat discount to ₹350, then reload again
      await setupClient.query(`
        SELECT public.update_invoice_with_items(
            p_invoice_id := $1,
            p_patch := jsonb_build_object(
              'flat_discount', 350.00,
              'tax_rate', 0.00,
              'subtotal', 5000.00,
              'tax_amount', 0.00,
              'grand_total', 4150.00
            ),
            p_items := '[
              {"description": "Room Stay", "quantity": 1, "rate": 5000, "amount": 5000, "category": "room"},
              {"description": "Promotional Discount", "quantity": 1, "rate": 500, "amount": 500, "category": "discount"}
            ]'::jsonb
        );
      `, [regrInvId]);

      // Reload 3
      const check3 = await setupClient.query(`
        SELECT subtotal, discount_amount, grand_total FROM public.invoices WHERE id = $1;
      `, [regrInvId]);
      const r3 = check3.rows[0];
      assert.strictEqual(parseFloat(r3.subtotal), 5000.00);
      assert.strictEqual(parseFloat(r3.discount_amount), 850.00, "Stored discount_amount must now be ₹850.00 (₹500 itemized + ₹350 flat)!");
      assert.strictEqual(parseFloat(r3.grand_total), 4150.00, "Grand total must be ₹4,150.00!");

      const derivedFlat3 = Math.max(0, parseFloat(r3.discount_amount) - 500.00);
      assert.strictEqual(derivedFlat3, 350.00, "Derived flat discount after second reload must be ₹350.00!");
      console.log("✅ TEST 3M2 PASSED: Create, reload, update, reload lifecycle confirmed: flat discount remains ₹200 without double-counting.\n");

      // -------------------------------------------------------------
      // Case 3N: Unique Invoice Number Collision & Complete Transactional Rollback
      // -------------------------------------------------------------
      console.log("🔄 TEST 3N: Duplicate Invoice Number Collision & Full Transactional Rollback...");
      // Create Invoice A
      const invARes = await setupClient.query(`
        SELECT public.create_invoice_with_items(
            $1, 'INV-UNIQUE-A', 'Unique A Guest', CURRENT_DATE, CURRENT_DATE + 1,
            2000.00, 0.00, 0.00, 0.00, 2000.00,
            '[{"description": "Room A", "quantity": 1, "rate": 2000, "amount": 2000, "category": "room"}]'::jsonb
        ) AS id;
      `, [bookingId]);
      const invAId = invARes.rows[0].id;

      // Create Invoice B with 2 distinct line items
      const invBRes = await setupClient.query(`
        SELECT public.create_invoice_with_items(
            $1, 'INV-UNIQUE-B', 'Original B Guest', CURRENT_DATE, CURRENT_DATE + 1,
            3000.00, 0.00, 0.00, 0.00, 3000.00,
            '[
              {"description": "Original Item B1", "quantity": 1, "rate": 2000, "amount": 2000, "category": "room"},
              {"description": "Original Item B2", "quantity": 1, "rate": 1000, "amount": 1000, "category": "food_beverage"}
            ]'::jsonb
        ) AS id;
      `, [bookingId]);
      const invBId = invBRes.rows[0].id;

      // Attempt to update Invoice B to 'INV-UNIQUE-A' (duplicate invoice_number for same homestay)
      // along with replacement line items
      let dupUpdateErr = null;
      try {
        await setupClient.query(`
          SELECT public.update_invoice_with_items(
              p_invoice_id := $1,
              p_patch := jsonb_build_object(
                'invoice_number', 'INV-UNIQUE-A',
                'guest_name', 'Hacked Duplicate Guest'
              ),
              p_items := '[{"description": "Should Not Exist", "quantity": 1, "rate": 500, "amount": 500, "category": "room"}]'::jsonb
          );
        `, [invBId]);
      } catch (err) {
        dupUpdateErr = err;
      }
      assert.strictEqual(dupUpdateErr !== null, true, "Must reject duplicate invoice_number");
      assert.match(dupUpdateErr.message, /uq_invoice_number_per_homestay|unique constraint/i, "Must trigger uq_invoice_number_per_homestay constraint violation!");

      // Verify complete transactional rollback: Invoice B must remain completely intact!
      const invBAfterCheck = await setupClient.query(`SELECT invoice_number, guest_name FROM public.invoices WHERE id = $1;`, [invBId]);
      assert.strictEqual(invBAfterCheck.rows[0].invoice_number, 'INV-UNIQUE-B', "Invoice number must not have changed!");
      assert.strictEqual(invBAfterCheck.rows[0].guest_name, 'Original B Guest', "Guest name must not have changed!");

      const invBItemsAfter = await setupClient.query(`
        SELECT description, amount FROM public.invoice_items WHERE invoice_id = $1 ORDER BY description;
      `, [invBId]);
      assert.strictEqual(invBItemsAfter.rows.length, 2, "Invoice items count must remain exactly 2 after failed update!");
      assert.strictEqual(invBItemsAfter.rows[0].description, 'Original Item B1');
      assert.strictEqual(invBItemsAfter.rows[1].description, 'Original Item B2');
      console.log("✅ TEST 3N PASSED: Duplicate invoice_number rejected and rolled back the entire update atomically.\n");

      // -------------------------------------------------------------
      // Case 3O: Security Definer & Cross-Tenant Isolation Enforcement
      // -------------------------------------------------------------
      console.log("🔐 TEST 3O: Security Definer & Cross-Tenant Isolation Enforcement...");
      // Setup second tenant (Homestay Beta) and second partner (Partner Beta)
      const hsBetaRes = await setupClient.query(`
        INSERT INTO public.homestays (name, slug)
        VALUES ('Homestay Beta', 'homestay-beta')
        RETURNING id;
      `);
      const homestayBetaId = hsBetaRes.rows[0].id;

      const pBetaRes = await setupClient.query(`
        INSERT INTO public.partners (name, email, role, is_active, homestay_id)
        VALUES ('Partner Beta', 'partner.beta@test.com', 'partner', true, $1)
        RETURNING id;
      `, [homestayBetaId]);
      const partnerBetaId = pBetaRes.rows[0].id;

      const bBetaRes = await setupClient.query(`
        INSERT INTO public.bookings (homestay_id, check_in, check_out, total_amount, status)
        VALUES ($1, CURRENT_DATE, CURRENT_DATE + 2, 8000.00, 'confirmed')
        RETURNING id;
      `, [homestayBetaId]);
      const bookingBetaId = bBetaRes.rows[0].id;

      const invBetaRes = await setupClient.query(`
        SELECT public.create_invoice_with_items(
            $1, 'INV-BETA-001', 'Beta Guest', CURRENT_DATE, CURRENT_DATE + 2,
            8000.00, 0.00, 0.00, 0.00, 8000.00,
            '[{"description": "Beta Room", "quantity": 1, "rate": 8000, "amount": 8000, "category": "room"}]'::jsonb
        ) AS id;
      `, [bookingBetaId]);
      const invBetaId = invBetaRes.rows[0].id;

      // Now simulate authenticated user of Homestay Alpha trying to access Homestay Beta resources
      const partnerAlphaAuthUid = '11111111-1111-1111-1111-111111111111';
      await setupClient.query(`
        UPDATE public.partners SET auth_user_id = $1, role = 'partner' WHERE id = $2;
      `, [partnerAlphaAuthUid, partnerId]);

      // Set session authorization as non-super-admin partner of Homestay Alpha
      await setupClient.query(`SET request.jwt.claim.sub = '${partnerAlphaAuthUid}';`);

      // 1. Attempt create_invoice_with_items for Booking Beta (Cross-tenant)
      let crossCreateErr = null;
      try {
        await setupClient.query(`
          SELECT public.create_invoice_with_items(
              $1, 'INV-HACK-001', 'Intruder Guest', CURRENT_DATE, CURRENT_DATE + 1,
              1000.00, 0.00, 0.00, 0.00, 1000.00,
              '[{"description": "Hack Room", "quantity": 1, "rate": 1000, "amount": 1000, "category": "room"}]'::jsonb
          );
        `, [bookingBetaId]);
      } catch (err) { crossCreateErr = err; }
      assert.strictEqual(crossCreateErr !== null, true, "Cross-tenant invoice creation must be rejected!");
      assert.match(crossCreateErr.message, /ACCESS_DENIED/, "Must raise ACCESS_DENIED on cross-tenant invoice creation!");

      // 2. Attempt update_invoice_with_items for Invoice Beta (Cross-tenant)
      let crossUpdateErr = null;
      try {
        await setupClient.query(`
          SELECT public.update_invoice_with_items(
              p_invoice_id := $1,
              p_patch := '{"guest_name": "Hacked Beta Guest"}'::jsonb
          );
        `, [invBetaId]);
      } catch (err) { crossUpdateErr = err; }
      assert.strictEqual(crossUpdateErr !== null, true, "Cross-tenant invoice update must be rejected!");
      assert.match(crossUpdateErr.message, /ACCESS_DENIED/, "Must raise ACCESS_DENIED on cross-tenant invoice update!");

      // 3. Attempt invoice_has_payments probe for Invoice Beta (Cross-tenant)
      let crossProbeErr = null;
      try {
        await setupClient.query(`
          SELECT public.invoice_has_payments($1);
        `, [invBetaId]);
      } catch (err) { crossProbeErr = err; }
      assert.strictEqual(crossProbeErr !== null, true, "Cross-tenant payment probe must be rejected!");
      assert.match(crossProbeErr.message, /ACCESS_DENIED/, "Must raise ACCESS_DENIED on cross-tenant payment probe!");

      // Reset session auth
      await setupClient.query(`RESET request.jwt.claim.sub;`);
      await setupClient.query(`
        UPDATE public.partners SET role = 'super_admin' WHERE id = $1;
      `, [partnerId]);
      console.log("✅ TEST 3O PASSED: Security definer tenant isolation prevents cross-tenant creation, updates, and probing.\n");

      // -------------------------------------------------------------
      // Case 3P: Function Ownership, Grants, and RLS Audit
      // -------------------------------------------------------------
      console.log("📜 TEST 3P: Function Ownership, EXECUTE Grants, and RLS Security Audit...");
      // Check ownership
      const ownershipCheck = await setupClient.query(`
        SELECT p.proname, r.rolname AS owner, p.prosecdef
        FROM pg_proc p
        JOIN pg_roles r ON p.proowner = r.oid
        WHERE p.proname IN (
          'create_invoice_with_items',
          'update_invoice_with_items',
          'invoice_has_payments',
          'prevent_invoice_deletion_with_payments',
          'prevent_invoice_relationship_mutation',
          'validate_payment_integrity',
          'prevent_payment_ledger_mutation'
        );
      `);
      assert.strictEqual(ownershipCheck.rows.length >= 7, true, "All 7 audit functions must exist in pg_proc!");
      for (const row of ownershipCheck.rows) {
        assert.strictEqual(row.owner, 'postgres', `Function ${row.proname} must be owned by postgres! Found: ${row.owner}`);
        assert.strictEqual(row.prosecdef, true, `Function ${row.proname} must be SECURITY DEFINER!`);
      }

      // Check EXECUTE privileges: PUBLIC must NOT have execute on these functions
      const publicPrivCheck = await setupClient.query(`
        SELECT p.proname, has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute,
               has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
               has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
        FROM pg_proc p
        WHERE p.proname IN (
          'create_invoice_with_items',
          'update_invoice_with_items',
          'invoice_has_payments',
          'prevent_invoice_deletion_with_payments',
          'prevent_invoice_relationship_mutation',
          'validate_payment_integrity',
          'prevent_payment_ledger_mutation'
        );
      `);
      for (const row of publicPrivCheck.rows) {
        assert.strictEqual(row.public_execute, false, `PUBLIC must NOT have EXECUTE on ${row.proname}`);
        assert.strictEqual(row.auth_execute, true, `authenticated must have EXECUTE on ${row.proname}`);
        assert.strictEqual(row.service_execute, true, `service_role must have EXECUTE on ${row.proname}`);
      }

      // Check RLS enabled on all three tables
      const rlsCheck = await setupClient.query(`
        SELECT relname, relrowsecurity 
        FROM pg_class 
        WHERE relname IN ('invoices', 'invoice_items', 'payments')
          AND relnamespace = 'public'::regnamespace;
      `);
      assert.strictEqual(rlsCheck.rows.length, 3, "Must check all 3 financial tables!");
      for (const row of rlsCheck.rows) {
        assert.strictEqual(row.relrowsecurity, true, `Table ${row.relname} must have ROW LEVEL SECURITY enabled!`);
      }
      console.log("✅ TEST 3P PASSED: Function ownership (postgres), strict EXECUTE grants, and RLS policies verified.\n");

      // -------------------------------------------------------------
      // Case 3Q: Regression Suite for update_invoice_with_items & updateInvoiceAction:
      // Omitted items, explicit null items, empty items array, and existing itemized discounts
      // -------------------------------------------------------------
      console.log("🧪 TEST 3Q: Regression Suite for Omitted Items, Null Items, Empty Items, and Itemized Discounts...");
      
      // Setup invoice with 2 items: 1 room item (₹4000) and 1 itemized discount (₹400), plus flat discount ₹100
      // Subtotal: 4000, Itemized Discount: 400, Flat Discount: 100, Total Discount: 500
      // Net: 3500, Tax (10%): 350, Grand Total: 3850
      const inv3QRes = await setupClient.query(`
        SELECT public.create_invoice_with_items(
            $1, 'INV-REGR-ITEMS-01', 'Regression Items Guest', CURRENT_DATE, CURRENT_DATE + 2,
            4000.00, 10.00, 350.00, 100.00, 3850.00,
            '[
              {"description": "Deluxe Room", "quantity": 1, "rate": 4000, "amount": 4000, "category": "room"},
              {"description": "Itemized Promo", "quantity": 1, "rate": 400, "amount": 400, "category": "discount"}
            ]'::jsonb
        ) AS id;
      `, [bookingId]);
      const inv3QId = inv3QRes.rows[0].id;

      // 1. Test Omitted items (p_items := NULL) with flat discount updated to ₹250
      // Subtotal: 4000 (from existing invoice_items)
      // Itemized discount: 400 (from existing invoice_items)
      // Flat discount: 250 (from patch)
      // Total discount: 650 (400 + 250)
      // Net: 3350
      // Tax (10%): 335
      // Grand total: 3685
      await setupClient.query(`
        SELECT public.update_invoice_with_items(
            p_invoice_id := $1,
            p_patch := jsonb_build_object(
              'guest_name', 'Guest Omitted Items',
              'flat_discount', 250.00,
              'tax_rate', 10.00,
              'subtotal', 4000.00,
              'tax_amount', 335.00,
              'grand_total', 3685.00
            ),
            p_items := NULL
        );
      `, [inv3QId]);

      const checkOmitted = await setupClient.query(`
        SELECT guest_name, subtotal, discount_amount, tax_amount, grand_total, balance_due
        FROM public.invoices WHERE id = $1;
      `, [inv3QId]);
      const coRow = checkOmitted.rows[0];
      assert.strictEqual(coRow.guest_name, 'Guest Omitted Items');
      assert.strictEqual(parseFloat(coRow.subtotal), 4000.00, "Subtotal must remain ₹4,000.00 when items are omitted!");
      assert.strictEqual(parseFloat(coRow.discount_amount), 650.00, "Discount amount must be ₹650.00 (₹400 itemized + ₹250 flat) without double-counting!");
      assert.strictEqual(parseFloat(coRow.tax_amount), 335.00);
      assert.strictEqual(parseFloat(coRow.grand_total), 3685.00);

      // Verify line items were preserved untouched
      const coItems = await setupClient.query(`
        SELECT category, description, amount FROM public.invoice_items WHERE invoice_id = $1 ORDER BY sort_order;
      `, [inv3QId]);
      assert.strictEqual(coItems.rows.length, 2, "Line items in invoice_items must be preserved untouched when items are omitted!");
      assert.strictEqual(coItems.rows[0].description, 'Deluxe Room');
      assert.strictEqual(coItems.rows[1].description, 'Itemized Promo');

      // 2. Test Explicit NULL p_items: verify it behaves identically to omitted items
      await setupClient.query(`
        SELECT public.update_invoice_with_items(
            p_invoice_id := $1,
            p_patch := jsonb_build_object('guest_phone', '+91 7777777777'),
            p_items := NULL
        );
      `, [inv3QId]);

      const checkNull = await setupClient.query(`
        SELECT guest_phone, subtotal, discount_amount, grand_total FROM public.invoices WHERE id = $1;
      `, [inv3QId]);
      assert.strictEqual(checkNull.rows[0].guest_phone, '+91 7777777777');
      assert.strictEqual(parseFloat(checkNull.rows[0].subtotal), 4000.00);
      assert.strictEqual(parseFloat(checkNull.rows[0].discount_amount), 650.00);

      const cnItems = await setupClient.query(`SELECT COUNT(*) FROM public.invoice_items WHERE invoice_id = $1;`, [inv3QId]);
      assert.strictEqual(parseInt(cnItems.rows[0].count), 2, "Items must still be preserved after explicit NULL p_items!");

      // 3. Test Empty Items Array ('[]'::jsonb): intentionally clears all items and resets totals to 0
      await setupClient.query(`
        SELECT public.update_invoice_with_items(
            p_invoice_id := $1,
            p_patch := jsonb_build_object(
              'subtotal', 0.00,
              'flat_discount', 0.00,
              'tax_rate', 0.00,
              'tax_amount', 0.00,
              'grand_total', 0.00
            ),
            p_items := '[]'::jsonb
        );
      `, [inv3QId]);

      const checkEmpty = await setupClient.query(`
        SELECT subtotal, discount_amount, tax_amount, grand_total FROM public.invoices WHERE id = $1;
      `, [inv3QId]);
      assert.strictEqual(parseFloat(checkEmpty.rows[0].subtotal), 0.00, "Subtotal must be 0 after empty array replaces items!");
      assert.strictEqual(parseFloat(checkEmpty.rows[0].discount_amount), 0.00);
      assert.strictEqual(parseFloat(checkEmpty.rows[0].grand_total), 0.00);

      const ceItems = await setupClient.query(`SELECT COUNT(*) FROM public.invoice_items WHERE invoice_id = $1;`, [inv3QId]);
      assert.strictEqual(parseInt(ceItems.rows[0].count), 0, "All items must be deleted when empty array is explicitly passed!");

      console.log("✅ TEST 3Q PASSED: Regression tests verified: omitted items preserve records and totals, explicit NULL preserves items, empty array replaces all items, itemized discounts never double-counted.\n");

      // -------------------------------------------------------------
      // TEST 4: LIVE REPEATED MIGRATION IDEMPOTENCY
      // -------------------------------------------------------------
      console.log("⚙️ TEST 4: Live Repeated Migration Idempotency...");
      console.log("Re-executing Phase 1 Migration on live database...");
      await executeSqlFile(setupClient, 'scripts/migration_phase1_payments.sql');
      console.log("Re-executing Phase 2 Migration on live database...");
      await executeSqlFile(setupClient, 'scripts/migration_phase2_invoices.sql');

      // Assert zero duplicate constraints
      const dupConstraints = await setupClient.query(`
        SELECT conname, COUNT(*) FROM pg_constraint 
        WHERE conrelid IN ('payments'::regclass, 'invoices'::regclass, 'invoice_items'::regclass)
        GROUP BY conname HAVING COUNT(*) > 1;
      `);
      assert.strictEqual(dupConstraints.rows.length, 0, "Must have zero duplicate constraints after re-run!");

      console.log("✅ TEST 4 PASSED: Re-running Phase 1 & 2 is 100% idempotent with zero catalog collisions.\n");

      // -------------------------------------------------------------
      // TEST 5: LIVE EXECUTION OF PRODUCTION PREFLIGHT REPORT
      // -------------------------------------------------------------
      console.log("📊 TEST 5: Live Execution of production_preflight_phase1_report.sql...");
      const preflightSql = fs.readFileSync(resolveSqlPath('production_preflight_phase1_report.sql'), 'utf8');
      const preflightRes = await setupClient.query(preflightSql);
      
      // Check results of diagnostic checks
      const reportRows = Array.isArray(preflightRes) ? preflightRes[0].rows : preflightRes.rows;
      assert.strictEqual(reportRows.length > 0, true, "Preflight report must return diagnostic rows!");
      console.log(`Preflight diagnostics generated ${reportRows.length} audit metrics.`);
      const failedChecks = reportRows.filter(r => r.status && r.status.includes('FAIL'));
      assert.strictEqual(failedChecks.length, 0, "No preflight diagnostic checks should fail on valid data!");
      console.log("✅ TEST 5 PASSED: production_preflight_phase1_report.sql executes cleanly and produces structured diagnostics.\n");

      // -------------------------------------------------------------
      // TEST 6: PHASE 3 ATOMIC PAYMENT & INVOICE SYNCHRONIZATION SUITE
      // -------------------------------------------------------------
      console.log("⚡ TEST 6: Phase 3 Atomic Payment & Invoice Synchronization Suite...\n");

      // 6.1: ₹1,499 invoice, ₹500 payment -> ₹999 balance
      console.log("  [6.1] ₹1,499 invoice, ₹500 payment -> ₹999 balance & partially_paid status...");
      const b61Res = await setupClient.query(`
        INSERT INTO public.bookings (homestay_id, room_id, guest_name, check_in, check_out, total_amount, status)
        VALUES ($1, $2, 'Guest 6.1', '2026-11-01', '2026-11-03', 1499.00, 'confirmed') RETURNING id;
      `, [homestayId, roomId]);
      const booking61Id = b61Res.rows[0].id;

      const inv61Res = await setupClient.query(`
        SELECT public.create_invoice_with_items(
          p_booking_id := $1,
          p_invoice_number := 'INV-TEST-601',
          p_guest_name := 'Guest 6.1',
          p_check_in := '2026-11-01'::date,
          p_check_out := '2026-11-03'::date,
          p_subtotal := 1499.00,
          p_tax_rate := 0.00,
          p_tax_amount := 0.00,
          p_discount_amount := 0.00,
          p_grand_total := 1499.00,
          p_items := '[{"category":"room","description":"2 nights stay","quantity":1,"rate":1499.00,"amount":1499.00}]'::jsonb,
          p_status := 'issued'
        ) AS id;
      `, [booking61Id]);
      const invoice61Id = inv61Res.rows[0].id;

      // Call record_invoice_payment with ₹500
      const pay61Res = await setupClient.query(`
        SELECT public.record_invoice_payment(
          p_invoice_id := $1,
          p_amount := 500.00,
          p_payment_method := 'upi',
          p_transaction_ref := 'TXN-601-A',
          p_notes := 'Advance payment'
        ) AS result;
      `, [invoice61Id]);
      const res61 = pay61Res.rows[0].result;
      assert.strictEqual(res61.success, true);
      assert.strictEqual(Number(res61.amount_paid), 500.00);
      assert.strictEqual(Number(res61.balance_due), 999.00);
      assert.strictEqual(res61.status, 'partially_paid');

      // Verify row in public.invoices
      const inv61Check = await setupClient.query(`SELECT amount_paid, balance_due, status FROM public.invoices WHERE id = $1;`, [invoice61Id]);
      assert.strictEqual(Number(inv61Check.rows[0].amount_paid), 500.00);
      assert.strictEqual(Number(inv61Check.rows[0].balance_due), 999.00);
      assert.strictEqual(inv61Check.rows[0].status, 'partially_paid');
      console.log("  ✅ 6.1 Passed: ₹1,499 invoice -> ₹500 payment = ₹999 balance & partially_paid status.");

      // 6.2: ₹999 second payment -> ₹0 balance and paid status
      console.log("  [6.2] ₹999 second payment -> ₹0 balance and paid status...");
      const pay62Res = await setupClient.query(`
        SELECT public.record_invoice_payment(
          p_invoice_id := $1,
          p_amount := 999.00,
          p_payment_method := 'cash',
          p_transaction_ref := 'TXN-601-B',
          p_notes := 'Final settlement'
        ) AS result;
      `, [invoice61Id]);
      const res62 = pay62Res.rows[0].result;
      assert.strictEqual(res62.success, true);
      assert.strictEqual(Number(res62.amount_paid), 1499.00);
      assert.strictEqual(Number(res62.balance_due), 0.00);
      assert.strictEqual(res62.status, 'paid');

      const inv62Check = await setupClient.query(`SELECT amount_paid, balance_due, status FROM public.invoices WHERE id = $1;`, [invoice61Id]);
      assert.strictEqual(Number(inv62Check.rows[0].amount_paid), 1499.00);
      assert.strictEqual(Number(inv62Check.rows[0].balance_due), 0.00);
      assert.strictEqual(inv62Check.rows[0].status, 'paid');
      console.log("  ✅ 6.2 Passed: ₹999 second payment = ₹0 balance & paid status.");

      // 6.3: ₹1,500 payment against ₹1,499 invoice -> rejected
      console.log("  [6.3] ₹1,500 payment against ₹1,499 invoice -> rejected...");
      const b63Res = await setupClient.query(`
        INSERT INTO public.bookings (homestay_id, room_id, guest_name, check_in, check_out, total_amount, status)
        VALUES ($1, $2, 'Guest 6.3', '2026-11-05', '2026-11-07', 1499.00, 'confirmed') RETURNING id;
      `, [homestayId, roomId]);
      const booking63Id = b63Res.rows[0].id;

      const inv63Res = await setupClient.query(`
        SELECT public.create_invoice_with_items(
          p_booking_id := $1,
          p_invoice_number := 'INV-TEST-603',
          p_guest_name := 'Guest 6.3',
          p_check_in := '2026-11-05'::date,
          p_check_out := '2026-11-07'::date,
          p_subtotal := 1499.00,
          p_tax_rate := 0.00,
          p_tax_amount := 0.00,
          p_discount_amount := 0.00,
          p_grand_total := 1499.00,
          p_items := '[{"category":"room","description":"2 nights stay","quantity":1,"rate":1499.00,"amount":1499.00}]'::jsonb,
          p_status := 'issued'
        ) AS id;
      `, [booking63Id]);
      const invoice63Id = inv63Res.rows[0].id;

      let overpaymentRejected = false;
      try {
        await setupClient.query(`
          SELECT public.record_invoice_payment(
            p_invoice_id := $1,
            p_amount := 1500.00
          );
        `, [invoice63Id]);
      } catch (err) {
        if (err.message && err.message.includes('INVOICE_OVERPAYMENT_EXCEEDED')) {
          overpaymentRejected = true;
        }
      }
      assert.strictEqual(overpaymentRejected, true, "Payment of ₹1,500 against ₹1,499 invoice must be rejected with INVOICE_OVERPAYMENT_EXCEEDED!");

      // Confirm invoice state was not mutated
      const inv63Check = await setupClient.query(`SELECT amount_paid, balance_due, status FROM public.invoices WHERE id = $1;`, [invoice63Id]);
      assert.strictEqual(Number(inv63Check.rows[0].amount_paid), 0.00);
      assert.strictEqual(Number(inv63Check.rows[0].balance_due), 1499.00);
      console.log("  ✅ 6.3 Passed: ₹1,500 payment against ₹1,499 invoice strictly rejected with INVOICE_OVERPAYMENT_EXCEEDED.");

      // 6.4: Two concurrent payments whose combined amount exceeds balance -> only valid amount accepted
      console.log("  [6.4] Two concurrent payments whose combined amount exceeds balance -> serialized & overpayment rejected...");
      const b64Res = await setupClient.query(`
        INSERT INTO public.bookings (homestay_id, room_id, guest_name, check_in, check_out, total_amount, status)
        VALUES ($1, $2, 'Guest 6.4', '2026-11-10', '2026-11-12', 1499.00, 'confirmed') RETURNING id;
      `, [homestayId, roomId]);
      const booking64Id = b64Res.rows[0].id;

      const inv64Res = await setupClient.query(`
        SELECT public.create_invoice_with_items(
          p_booking_id := $1,
          p_invoice_number := 'INV-TEST-604',
          p_guest_name := 'Guest 6.4',
          p_check_in := '2026-11-10'::date,
          p_check_out := '2026-11-12'::date,
          p_subtotal := 1499.00,
          p_tax_rate := 0.00,
          p_tax_amount := 0.00,
          p_discount_amount := 0.00,
          p_grand_total := 1499.00,
          p_items := '[{"category":"room","description":"2 nights stay","quantity":1,"rate":1499.00,"amount":1499.00}]'::jsonb,
          p_status := 'issued'
        ) AS id;
      `, [booking64Id]);
      const invoice64Id = inv64Res.rows[0].id;

      // Concurrently execute two ₹1,000 payments on two parallel pool connections
      const client64A = await pool.connect();
      const client64B = await pool.connect();
      try {
        const [resA, resB] = await Promise.allSettled([
          client64A.query(`SELECT public.record_invoice_payment($1, 1000.00, 'upi', 'TXN-CONC-A') AS res;`, [invoice64Id]),
          client64B.query(`SELECT public.record_invoice_payment($1, 1000.00, 'card', 'TXN-CONC-B') AS res;`, [invoice64Id]),
        ]);

        const fulfilled = [resA, resB].filter(r => r.status === 'fulfilled');
        const rejected = [resA, resB].filter(r => r.status === 'rejected');

        assert.strictEqual(fulfilled.length, 1, "Exactly one concurrent payment must succeed!");
        assert.strictEqual(rejected.length, 1, "Exactly one concurrent payment must fail!");
        assert.strictEqual(rejected[0].reason.message.includes('INVOICE_OVERPAYMENT_EXCEEDED'), true, "Failing transaction must be rejected with INVOICE_OVERPAYMENT_EXCEEDED!");

        // Verify invoice balance: ₹1,499 - ₹1,000 = ₹499
        const inv64Check = await setupClient.query(`SELECT amount_paid, balance_due, status FROM public.invoices WHERE id = $1;`, [invoice64Id]);
        assert.strictEqual(Number(inv64Check.rows[0].amount_paid), 1000.00);
        assert.strictEqual(Number(inv64Check.rows[0].balance_due), 499.00);
        assert.strictEqual(inv64Check.rows[0].status, 'partially_paid');
      } finally {
        client64A.release();
        client64B.release();
      }
      console.log("  ✅ 6.4 Passed: Two concurrent payments serialized; exactly one succeeded (₹1,000) and the other rejected.");

      // 6.5: Refund and reversal preserve correct invoice totals
      console.log("  [6.5] Refund and reversal preserve correct invoice totals...");
      const b65Res = await setupClient.query(`
        INSERT INTO public.bookings (homestay_id, room_id, guest_name, check_in, check_out, total_amount, status)
        VALUES ($1, $2, 'Guest 6.5', '2026-11-15', '2026-11-17', 2000.00, 'confirmed') RETURNING id;
      `, [homestayId, roomId]);
      const booking65Id = b65Res.rows[0].id;

      const inv65Res = await setupClient.query(`
        SELECT public.create_invoice_with_items(
          p_booking_id := $1,
          p_invoice_number := 'INV-TEST-605',
          p_guest_name := 'Guest 6.5',
          p_check_in := '2026-11-15'::date,
          p_check_out := '2026-11-17'::date,
          p_subtotal := 2000.00,
          p_tax_rate := 0.00,
          p_tax_amount := 0.00,
          p_discount_amount := 0.00,
          p_grand_total := 2000.00,
          p_items := '[{"category":"room","description":"2 nights stay","quantity":1,"rate":2000.00,"amount":2000.00}]'::jsonb,
          p_status := 'issued'
        ) AS id;
      `, [booking65Id]);
      const invoice65Id = inv65Res.rows[0].id;

      // Full payment of ₹2,000
      const pay65Res = await setupClient.query(`
        SELECT public.record_invoice_payment(
          p_invoice_id := $1,
          p_amount := 2000.00,
          p_payment_method := 'upi',
          p_transaction_ref := 'TXN-605-FULL'
        ) AS result;
      `, [invoice65Id]);
      const originalPaymentId = pay65Res.rows[0].result.payment_id;

      // Reversal of ₹500 against parent payment
      await setupClient.query(`
        INSERT INTO public.payments (
          homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, notes, recorded_by
        ) VALUES ($1, $2, 500.00, 'reversal', 'upi', $3, 'Accidental duplicate charge correction', $4);
      `, [homestayId, booking65Id, originalPaymentId, partnerId]);

      // Trigger trg_sync_invoice_from_payments updates invoice: 2000 - 500 = 1500 paid, 500 balance
      const inv65RevCheck = await setupClient.query(`SELECT amount_paid, balance_due, status FROM public.invoices WHERE id = $1;`, [invoice65Id]);
      assert.strictEqual(Number(inv65RevCheck.rows[0].amount_paid), 1500.00);
      assert.strictEqual(Number(inv65RevCheck.rows[0].balance_due), 500.00);
      assert.strictEqual(inv65RevCheck.rows[0].status, 'partially_paid');

      // Refund of ₹500 to guest
      await setupClient.query(`
        INSERT INTO public.payments (
          homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, notes, recorded_by
        ) VALUES ($1, $2, 500.00, 'refund', 'upi', $3, 'Guest requested cancellation of meal addon', $4);
      `, [homestayId, booking65Id, originalPaymentId, partnerId]);

      // Trigger updates invoice: 1500 - 500 = 1000 paid, 1000 balance
      const inv65RefCheck = await setupClient.query(`SELECT amount_paid, balance_due, status FROM public.invoices WHERE id = $1;`, [invoice65Id]);
      assert.strictEqual(Number(inv65RefCheck.rows[0].amount_paid), 1000.00);
      assert.strictEqual(Number(inv65RefCheck.rows[0].balance_due), 1000.00);
      assert.strictEqual(inv65RefCheck.rows[0].status, 'partially_paid');
      console.log("  ✅ 6.5 Passed: Reversals and refunds atomically update invoice amount_paid, balance_due, and status.");

      // 6.6: Duplicate idempotency key does not create duplicate payments
      console.log("  [6.6] Duplicate idempotency key does not create duplicate payments...");
      const idempKey = 'IDEMP_ORDER_KEY_9999';
      const idempFirst = await setupClient.query(`
        SELECT public.record_invoice_payment(
          p_invoice_id := $1,
          p_amount := 500.00,
          p_payment_method := 'upi',
          p_idempotency_key := $2
        ) AS result;
      `, [invoice65Id, idempKey]);
      const resFirst = idempFirst.rows[0].result;
      assert.strictEqual(resFirst.success, true);
      assert.strictEqual(resFirst.is_duplicate, false);
      const paymentIdFirst = resFirst.payment_id;

      // Second submission with identical idempotency key
      const idempSecond = await setupClient.query(`
        SELECT public.record_invoice_payment(
          p_invoice_id := $1,
          p_amount := 500.00,
          p_payment_method := 'upi',
          p_idempotency_key := $2
        ) AS result;
      `, [invoice65Id, idempKey]);
      const resSecond = idempSecond.rows[0].result;
      assert.strictEqual(resSecond.success, true);
      assert.strictEqual(resSecond.is_duplicate, true);
      assert.strictEqual(resSecond.payment_id, paymentIdFirst);

      // Verify payments table has exactly ONE row with that idempotency key
      const countIdemp = await setupClient.query(`SELECT COUNT(*) FROM public.payments WHERE idempotency_key = $1;`, [idempKey]);
      assert.strictEqual(parseInt(countIdemp.rows[0].count, 10), 1);
      console.log("  ✅ 6.6 Passed: Duplicate idempotency key returned existing payment without duplicate ledger insertion.");

      // 6.7: Booking-only payments continue working
      console.log("  [6.7] Booking-only payments continue working (invoice_id IS NULL)...");
      const b67Res = await setupClient.query(`
        INSERT INTO public.bookings (homestay_id, room_id, guest_name, check_in, check_out, total_amount, status)
        VALUES ($1, $2, 'Guest 6.7', '2026-11-20', '2026-11-22', 3000.00, 'confirmed') RETURNING id;
      `, [homestayId, roomId]);
      const booking67Id = b67Res.rows[0].id;

      const directPayRes = await setupClient.query(`
        INSERT INTO public.payments (
          homestay_id, booking_id, amount, payment_type, payment_method, notes, recorded_by
        ) VALUES ($1, $2, 1000.00, 'payment', 'cash', 'Advance deposit for booking', $3)
        RETURNING id, invoice_id;
      `, [homestayId, booking67Id, partnerId]);

      assert.strictEqual(directPayRes.rows.length, 1);
      assert.strictEqual(directPayRes.rows[0].invoice_id, null);
      console.log("  ✅ 6.7 Passed: Booking-only payment recorded with invoice_id NULL without interference.");

      // 6.8: Unauthorized tenant cannot record invoice payment
      console.log("  [6.8] Unauthorized tenant cannot record invoice payment...");
      const otherHsRes = await setupClient.query(`
        INSERT INTO public.homestays (name, slug) VALUES ('Other Homestay', 'other-hs') RETURNING id;
      `);
      const otherHsId = otherHsRes.rows[0].id;

      const otherPartnerRes = await setupClient.query(`
        INSERT INTO public.partners (homestay_id, name, email, role, is_active, auth_user_id)
        VALUES ($1, 'Other Partner', 'other@partner.test', 'partner', true, gen_random_uuid()) RETURNING id, auth_user_id;
      `, [otherHsId]);
      const otherPartnerId = otherPartnerRes.rows[0].id;
      const otherAuthUserId = otherPartnerRes.rows[0].auth_user_id;

      // Mock auth.uid() as otherAuthUserId in a transaction
      let crossTenantPayRejected = false;
      const tenantClient = await pool.connect();
      try {
        await tenantClient.query('BEGIN;');
        // Mock auth context for other partner
        await tenantClient.query(`
          CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS $$ SELECT '${otherAuthUserId}'::uuid; $$;
        `);
        // Attempt to pay invoice61Id (belongs to homestayId, not otherHsId)
        try {
          await tenantClient.query(`SELECT public.record_invoice_payment($1, 100.00);`, [invoice61Id]);
        } catch (err) {
          if (err.message && (err.message.includes('ACCESS_DENIED') || err.code === '42501')) {
            crossTenantPayRejected = true;
          }
        }
        await tenantClient.query('ROLLBACK;');
      } finally {
        tenantClient.release();
      }

      assert.strictEqual(crossTenantPayRejected, true, "Cross-tenant invoice payment must be rejected with ACCESS_DENIED!");
      console.log("  ✅ 6.8 Passed: Cross-tenant payment rejected with ACCESS_DENIED.");
      console.log("✅ TEST 6 PASSED: All 8 Phase 3 Atomic Payment & Invoice Synchronization requirements verified!\n");

      // -------------------------------------------------------------
      // Case 7: Phase 3.1 Security & Consistency Hardening Verification
      // -------------------------------------------------------------
      console.log("🔒 TEST 7: Phase 3.1 Security & Consistency Hardening Invariants...");

      // 7.1: Idempotency conflict on different amount, payment method, or transaction reference
      console.log("  [7.1] Idempotency keys cannot be reused with different amount, method, or ref...");
      const inv71Res = await setupClient.query(`
        SELECT public.create_invoice_with_items(
          p_booking_id := $1,
          p_invoice_number := 'INV-TEST-701',
          p_guest_name := 'Guest 7.1',
          p_check_in := '2026-11-25'::date,
          p_check_out := '2026-11-27'::date,
          p_subtotal := 2000.00,
          p_tax_rate := 0.00,
          p_tax_amount := 0.00,
          p_discount_amount := 0.00,
          p_grand_total := 2000.00,
          p_items := '[{"category":"room","description":"2 nights stay","quantity":1,"rate":2000.00,"amount":2000.00}]'::jsonb,
          p_status := 'issued'
        ) AS id;
      `, [bookingId]);
      const invoice71Id = inv71Res.rows[0].id;

      const idempKey71 = 'IDEMP_PHASE31_LIVE_KEY_001';
      await setupClient.query(`
        SELECT public.record_invoice_payment(
          p_invoice_id := $1,
          p_amount := 250.00,
          p_payment_method := 'cash',
          p_transaction_ref := 'TXN-71-ORIG',
          p_idempotency_key := $2
        );
      `, [invoice71Id, idempKey71]);

      // Subcase A: Different amount
      let diffAmountErr = null;
      try {
        await setupClient.query(`
          SELECT public.record_invoice_payment(
            p_invoice_id := $1,
            p_amount := 300.00,
            p_payment_method := 'cash',
            p_transaction_ref := 'TXN-71-ORIG',
            p_idempotency_key := $2
          );
        `, [invoice71Id, idempKey71]);
      } catch (err) { diffAmountErr = err; }
      assert.ok(diffAmountErr);
      assert.ok(diffAmountErr.message.includes('IDEMPOTENCY_CONFLICT'));
      assert.ok(diffAmountErr.message.includes('different amount'));

      // Subcase B: Different payment method
      let diffMethodErr = null;
      try {
        await setupClient.query(`
          SELECT public.record_invoice_payment(
            p_invoice_id := $1,
            p_amount := 250.00,
            p_payment_method := 'upi',
            p_transaction_ref := 'TXN-71-ORIG',
            p_idempotency_key := $2
          );
        `, [invoice71Id, idempKey71]);
      } catch (err) { diffMethodErr = err; }
      assert.ok(diffMethodErr);
      assert.ok(diffMethodErr.message.includes('IDEMPOTENCY_CONFLICT'));
      assert.ok(diffMethodErr.message.includes('different payment method'));

      // Subcase C: Different transaction ref
      let diffRefErr = null;
      try {
        await setupClient.query(`
          SELECT public.record_invoice_payment(
            p_invoice_id := $1,
            p_amount := 250.00,
            p_payment_method := 'cash',
            p_transaction_ref := 'TXN-71-MODIFIED',
            p_idempotency_key := $2
          );
        `, [invoice71Id, idempKey71]);
      } catch (err) { diffRefErr = err; }
      assert.ok(diffRefErr);
      assert.ok(diffRefErr.message.includes('IDEMPOTENCY_CONFLICT'));
      assert.ok(diffRefErr.message.includes('different transaction reference'));
      console.log("  ✅ 7.1 Passed: Idempotency conflict strictly raised for divergent amount, method, or transaction reference.");

      // 7.2: Reconcile RPC validates tenant authorization
      console.log("  [7.2] Reconcile RPC (reconcile_invoice_summary) validates tenant authorization...");
      const tenantClient72 = await pool.connect();
      try {
        await tenantClient72.query('BEGIN;');
        await tenantClient72.query(`
          CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS $$ SELECT '${otherAuthUserId}'::uuid; $$;
        `);
        let crossReconcileErr = null;
        try {
          await tenantClient72.query(`SELECT public.reconcile_invoice_summary($1);`, [invoice71Id]);
        } catch (err) { crossReconcileErr = err; }
        assert.ok(crossReconcileErr);
        assert.strictEqual(crossReconcileErr.code, '42501');
        assert.ok(crossReconcileErr.message.includes('ACCESS_DENIED: Invoice not found or access denied.'));
        await tenantClient72.query('ROLLBACK;');
      } finally {
        tenantClient72.release();
      }
      console.log("  ✅ 7.2 Passed: Reconcile RPC rejects cross-tenant caller with 42501 ACCESS_DENIED.");

      // 7.3: Function ownership, grants, and search_path on reconcile_invoice_summary
      console.log("  [7.3] Function privileges on reconcile_invoice_summary...");
      const priv73 = await setupClient.query(`
        SELECT p.proname, p.prosecdef, r.rolname AS owner,
               has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec,
               has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
               has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
        FROM pg_proc p
        JOIN pg_roles r ON p.proowner = r.oid
        WHERE p.proname = 'reconcile_invoice_summary';
      `);
      assert.strictEqual(priv73.rows.length, 1);
      assert.strictEqual(priv73.rows[0].owner, 'postgres');
      assert.strictEqual(priv73.rows[0].prosecdef, true);
      assert.strictEqual(priv73.rows[0].public_exec, false);
      assert.strictEqual(priv73.rows[0].auth_exec, true);
      assert.strictEqual(priv73.rows[0].service_exec, true);
      console.log("  ✅ 7.3 Passed: reconcile_invoice_summary is owned by postgres, SECURITY DEFINER, with PUBLIC revoked.");

      // 7.4: Rollback Refusal Guard test
      console.log("  [7.4] Rollback script refusal guard halts when billing data exists...");
      const rollbackSql = fs.readFileSync(resolveSqlPath('scripts/migration_phase2_invoices_rollback.sql'), 'utf8');
      const guardBlock = rollbackSql.slice(rollbackSql.indexOf('DO $$'), rollbackSql.indexOf('END $$;') + 7);
      let rollbackHaltErr = null;
      try {
        await setupClient.query(guardBlock);
      } catch (err) { rollbackHaltErr = err; }
      assert.ok(rollbackHaltErr);
      assert.ok(rollbackHaltErr.message.includes('SAFETY HALT: Rollback refused!'));
      console.log("  ✅ 7.4 Passed: Rollback script strictly refused execution due to active billing data.");

      // 7.5: Two concurrent requests with the same idempotency key return the same payment ID, with exactly one ledger row
      console.log("  [7.5] Two concurrent requests with identical idempotency key return same payment ID with exactly 1 ledger row...");
      const idempConcurrentKey = 'IDEMP_CONCURRENT_LIVE_DUAL_' + Date.now();
      const concClient1 = await pool.connect();
      const concClient2 = await pool.connect();
      try {
        const [res1, res2] = await Promise.all([
          concClient1.query(`
            SELECT public.record_invoice_payment(
              p_invoice_id := $1,
              p_amount := 100.00,
              p_payment_method := 'cash',
              p_transaction_ref := 'TXN-CONC-1',
              p_idempotency_key := $2
            ) AS result;
          `, [invoice71Id, idempConcurrentKey]),
          concClient2.query(`
            SELECT public.record_invoice_payment(
              p_invoice_id := $1,
              p_amount := 100.00,
              p_payment_method := 'cash',
              p_transaction_ref := 'TXN-CONC-1',
              p_idempotency_key := $2
            ) AS result;
          `, [invoice71Id, idempConcurrentKey])
        ]);

        const r1 = res1.rows[0].result;
        const r2 = res2.rows[0].result;
        assert.strictEqual(r1.success, true);
        assert.strictEqual(r2.success, true);
        assert.strictEqual(r1.payment_id, r2.payment_id, "Both concurrent requests must return identical payment_id!");
        const dupFlags = [r1.is_duplicate, r2.is_duplicate].sort();
        assert.deepStrictEqual(dupFlags, [false, true], "Exactly one request must be primary (false) and one duplicate (true)!");

        const ledgerCountRes = await setupClient.query(
          `SELECT COUNT(*) FROM public.payments WHERE idempotency_key = $1;`,
          [idempConcurrentKey]
        );
        assert.strictEqual(parseInt(ledgerCountRes.rows[0].count, 10), 1, "Exactly one ledger row must exist!");
        console.log("  ✅ 7.5 Passed: Two concurrent requests with identical idempotency key returned identical payment ID with exactly 1 ledger row.");
      } finally {
        concClient1.release();
        concClient2.release();
      }

      console.log("✅ TEST 7 PASSED: All Phase 3.1 Security & Consistency Hardening requirements verified in live PostgreSQL!\n");

    } finally {
      setupClient.release();
    }

    console.log("\n🎉 ALL LIVE POSTGRESQL CONCURRENCY & TRANSACTION AUDIT TESTS PASSED WITH 100% SUCCESS!");
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }

    if (dbCreated) {
      assertSafeDisposableDatabaseName(TEST_DB_NAME);
      const cleanupClient = new Client({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: 'postgres'
      });

      try {
        await cleanupClient.connect();
        console.log(`🧹 Dropping unique disposable database: "${TEST_DB_NAME}"...`);
        await cleanupClient.query(`
          SELECT pg_terminate_backend(pid) 
          FROM pg_stat_activity 
          WHERE datname = $1 AND pid <> pg_backend_pid();
        `, [TEST_DB_NAME]);
        await cleanupClient.query(`DROP DATABASE "${TEST_DB_NAME}";`);
        console.log(`✅ Unique disposable database "${TEST_DB_NAME}" dropped cleanly. Zero residual state.`);
      } catch (cleanupErr) {
        console.error(`❌ Warning: Failed to drop disposable database "${TEST_DB_NAME}":`, cleanupErr);
      } finally {
        await cleanupClient.end().catch(() => {});
      }
    }
  }
}

run().catch(err => {
  console.error("❌ Live PostgreSQL Audit Test Failed:", err);
  process.exit(1);
});
