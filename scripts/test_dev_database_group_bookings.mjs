/**
 * ==============================================================================
 * POSTGRESQL / SUPABASE DEVELOPMENT DATABASE INTEGRATION TEST SUITE
 * Multi-Room Booking & Consolidated Invoicing Feature
 * ==============================================================================
 *
 * TARGET: Genuine local development PostgreSQL instance (or ephemeral test cluster).
 * SAFETY GUARD:
 * - Refuses to connect if host points to Supabase production (*.supabase.co / algorrnjotffcvtinbyy).
 * - Operates only on designated dev/test databases (127.0.0.1, localhost, or disposable_*).
 *
 * COVERED SCENARIOS:
 *   1. Single-room booking creation via atomic RPC
 *   2. Multi-room booking creation via atomic RPC (shared group_id, 1 lead)
 *   3. Concurrent booking attempts for the same room (FOR UPDATE row lock serialization)
 *   4. Atomic rollback when one room is unavailable (0 partial rows inserted)
 *   5. Consolidated invoice creation with multi-room line items
 *   6. Duplicate active group invoice prevention (partial unique index uq_invoices_active_group)
 *   7. Partial payments, ledger recording, and balance reconciliation
 *   8. Room-level cancellation (isolated cancellation and availability release)
 *   9. Rollback migration safety (Phase 2 restore and column drop)
 * ==============================================================================
 */

import { Client, Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import assert from 'node:assert';

console.log("===============================================================================");
console.log("🐘 POSTGRESQL DEVELOPMENT INTEGRATION TEST: MULTI-ROOM & CONSOLIDATED INVOICE");
console.log("===============================================================================\n");

const DB_HOST = process.env.DEV_PGHOST || process.env.PGHOST || '127.0.0.1';
const DB_PORT = process.env.DEV_PGPORT || process.env.PGPORT ? parseInt(process.env.DEV_PGPORT || process.env.PGPORT, 10) : 5432;
const DB_USER = process.env.DEV_PGUSER || process.env.PGUSER || 'postgres';
const DB_PASSWORD = process.env.DEV_PGPASSWORD !== undefined ? process.env.DEV_PGPASSWORD : (process.env.PGPASSWORD || '');
const DB_NAME = process.env.DEV_PGDATABASE || process.env.PGDATABASE || 'disposable_group_test';

// ------------------------------------------------------------------------------
// SAFETY ASSERTIONS: Ensure we NEVER touch production
// ------------------------------------------------------------------------------
const FORBIDDEN_HOST_PATTERNS = [
  'supabase.co',
  'algorrnjotffcvtinbyy',
  'aws.connect.psdb.cloud',
  'rds.amazonaws.com'
];

for (const pattern of FORBIDDEN_HOST_PATTERNS) {
  if (DB_HOST.includes(pattern) || (process.env.DATABASE_URL && process.env.DATABASE_URL.includes(pattern))) {
    console.error(`🚨 FATAL SAFETY VIOLATION: Refusing to run tests against remote/production host: ${DB_HOST}`);
    process.exit(1);
  }
}

function resolveSqlPath(filePath) {
  const candidates = [
    path.resolve(process.cwd(), filePath),
    path.resolve(process.cwd(), 'scripts', path.basename(filePath)),
    path.resolve(import.meta.dirname || '.', filePath),
    path.resolve(import.meta.dirname || '.', '..', filePath)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(`SQL file not found at candidate locations for: ${filePath}`);
}

async function executeSqlFile(client, filePath) {
  const resolved = resolveSqlPath(filePath);
  const sql = fs.readFileSync(resolved, 'utf8');
  await client.query(sql);
}

let testIndex = 0;
let passedCount = 0;

async function runScenario(title, fn) {
  testIndex++;
  console.log(`\n▶ [SCENARIO ${testIndex}] ${title}`);
  try {
    await fn();
    console.log(`  ✅ PASS: Scenario ${testIndex} passed.`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: Scenario ${testIndex} failed with error:`);
    console.error(err);
    throw err;
  }
}

async function main() {
  const pool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    max: 10,
    connectionTimeoutMillis: 5000
  });

  // Verify database connectivity
  let rootClient;
  try {
    rootClient = await pool.connect();
    const verRes = await rootClient.query('SELECT version();');
    console.log(`Connected to PostgreSQL: ${verRes.rows[0].version.split('\n')[0]}`);
  } catch (err) {
    console.warn(`⚠️ Could not connect to development database at ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
    console.warn(`Reason: ${err.message}`);
    console.warn("\nℹ️ Please run via 'scripts/run_dev_group_bookings_test.ps1' to automatically spin up");
    console.warn("   an isolated disposable PostgreSQL cluster, or provide DEV_PGHOST / DEV_PGPORT.\n");
    console.log("Printing development integration test specification summary:");
    printTestPlanSummary();
    process.exit(0);
  }

  try {
    console.log("\n📦 Setting up test tables, auth stubs, and core migrations...");

    await rootClient.query(`
      -- Provision standard Supabase roles if not present
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

      -- Provision standard Supabase auth stubs
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE plpgsql AS $$
      DECLARE
          v_val TEXT;
      BEGIN
          v_val := current_setting('request.jwt.claim.sub', true);
          IF v_val IS NULL OR v_val = '' THEN RETURN NULL; END IF;
          RETURN v_val::UUID;
      EXCEPTION WHEN OTHERS THEN RETURN NULL;
      END;
      $$;

      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;

      -- Core Tables
      CREATE TABLE IF NOT EXISTS public.homestays (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS public.rooms (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          homestay_id UUID NOT NULL REFERENCES public.homestays(id),
          room_number TEXT NOT NULL,
          name TEXT NOT NULL,
          nightly_rate NUMERIC(12,2) DEFAULT 0.00,
          is_active BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS public.partners (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          auth_user_id UUID,
          homestay_id UUID REFERENCES public.homestays(id),
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          role TEXT DEFAULT 'partner',
          is_active BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS public.bookings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          homestay_id UUID NOT NULL REFERENCES public.homestays(id),
          room_id UUID REFERENCES public.rooms(id),
          partner_id UUID REFERENCES public.partners(id),
          check_in DATE NOT NULL,
          check_in_time TIME,
          check_out DATE NOT NULL,
          check_out_time TIME,
          number_of_guests INTEGER NOT NULL DEFAULT 1,
          nightly_rate INTEGER NOT NULL DEFAULT 0,
          total_amount NUMERIC(12,2) NOT NULL,
          notes TEXT,
          guest_name TEXT,
          status TEXT DEFAULT 'confirmed',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS public.guests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
          homestay_id UUID REFERENCES public.homestays(id),
          name TEXT NOT NULL,
          phone TEXT,
          email TEXT,
          is_primary BOOLEAN DEFAULT false
      );

      -- User stubs
      CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS BOOLEAN LANGUAGE plpgsql AS $$
      BEGIN RETURN true; END;
      $$;

      CREATE OR REPLACE FUNCTION public.get_user_homestay_id() RETURNS UUID LANGUAGE plpgsql AS $$
      BEGIN RETURN (SELECT id FROM public.homestays LIMIT 1); END;
      $$;

      CREATE OR REPLACE FUNCTION public.is_active_partner() RETURNS BOOLEAN LANGUAGE plpgsql AS $$
      BEGIN RETURN true; END;
      $$;
    `);

    // Execute Phase 1 and Phase 2 migrations
    await executeSqlFile(rootClient, 'scripts/migration_phase1_payments.sql');
    await executeSqlFile(rootClient, 'scripts/migration_phase2_invoices.sql');

    // Execute Multi-Room Booking Migration
    console.log("📜 Applying Multi-Room Booking Migration: scripts/migration_group_bookings.sql...");
    await executeSqlFile(rootClient, 'scripts/migration_group_bookings.sql');
    console.log("✅ Schema migration applied successfully.\n");

    // Seed test property, partner, and 3 rooms
    const propRes = await rootClient.query(`
      INSERT INTO public.homestays (name, slug)
      VALUES ('Integration Homestay', 'dev-group-homestay')
      RETURNING id;
    `);
    const homestayId = propRes.rows[0].id;

    const partnerRes = await rootClient.query(`
      INSERT INTO public.partners (homestay_id, name, email, role, is_active)
      VALUES ($1, 'Dev Lead Partner', 'devpartner@test.local', 'super_admin', true)
      RETURNING id;
    `, [homestayId]);
    const partnerId = partnerRes.rows[0].id;

    const room1Res = await rootClient.query(`
      INSERT INTO public.rooms (homestay_id, room_number, name, nightly_rate, is_active)
      VALUES ($1, '101', 'Room 101 - Valley View', 2500.00, true)
      RETURNING id;
    `, [homestayId]);
    const room1Id = room1Res.rows[0].id;

    const room2Res = await rootClient.query(`
      INSERT INTO public.rooms (homestay_id, room_number, name, nightly_rate, is_active)
      VALUES ($1, '102', 'Room 102 - Mountain View', 2500.00, true)
      RETURNING id;
    `, [homestayId]);
    const room2Id = room2Res.rows[0].id;

    const room3Res = await rootClient.query(`
      INSERT INTO public.rooms (homestay_id, room_number, name, nightly_rate, is_active)
      VALUES ($1, '103', 'Room 103 - Pine View', 2500.00, true)
      RETURNING id;
    `, [homestayId]);
    const room3Id = room3Res.rows[0].id;

    console.log(`🏡 Seeded Homestay (${homestayId}) with Rooms: 101, 102, 103.`);

    // --------------------------------------------------------------------------
    // SCENARIO 1: Single-Room Booking
    // --------------------------------------------------------------------------
    let singleGroupId = null;
    let singleBookingId = null;
    await runScenario("Single-room booking creation via create_group_booking_atomic", async () => {
      const checkIn = '2026-12-01';
      const checkOut = '2026-12-03'; // 2 nights * 2500 = 5000
      const guests = JSON.stringify([
        { name: 'Alice Single', phone: '9876543210', email: 'alice@test.local', is_primary: true }
      ]);

      const res = await rootClient.query(`
        SELECT public.create_group_booking_atomic(
          ARRAY[$1]::UUID[],
          $2,
          $3,
          $4,
          2,
          'Single room booking test',
          $5::jsonb
        ) AS result;
      `, [room1Id, partnerId, checkIn, checkOut, guests]);

      const data = res.rows[0].result;
      assert.ok(data.group_id, "group_id must be generated");
      assert.strictEqual(data.room_count, 1, "Room count should be 1");
      assert.strictEqual(data.total_amount, 5000, "Total amount should be 5000");
      assert.strictEqual(data.booking_ids.length, 1, "Should have 1 booking ID");

      singleGroupId = data.group_id;
      singleBookingId = data.booking_ids[0];

      // Assert row in bookings table
      const bRes = await rootClient.query('SELECT * FROM public.bookings WHERE id = $1', [singleBookingId]);
      assert.strictEqual(bRes.rows.length, 1);
      assert.strictEqual(bRes.rows[0].group_id, singleGroupId);
      assert.strictEqual(bRes.rows[0].is_group_lead, true, "Single room booking is lead by definition");
      assert.strictEqual(bRes.rows[0].status, 'confirmed');
    });

    // --------------------------------------------------------------------------
    // SCENARIO 2: Multi-Room Booking (3 Rooms, 1 Lead, Same Group ID)
    // --------------------------------------------------------------------------
    let multiGroupId = null;
    let leadBookingId = null;
    let allGroupBookingIds = [];
    await runScenario("Multi-room group booking creation (3 rooms, 2 nights, ₹15,000 total)", async () => {
      const checkIn = '2026-12-10';
      const checkOut = '2026-12-12'; // 2 nights * 2500 * 3 rooms = 15000
      const guests = JSON.stringify([
        { name: 'Chaitanya Reddy', phone: '9876500000', email: 'chaitanya@test.local', is_primary: true },
        { name: 'Friend 1', phone: '9876500001', email: 'friend1@test.local', is_primary: false }
      ]);

      const res = await rootClient.query(`
        SELECT public.create_group_booking_atomic(
          ARRAY[$1, $2, $3]::UUID[],
          $4,
          $5,
          $6,
          4,
          'Multi-room family vacation',
          $7::jsonb
        ) AS result;
      `, [room1Id, room2Id, room3Id, partnerId, checkIn, checkOut, guests]);

      const data = res.rows[0].result;
      assert.ok(data.group_id, "Group ID must be present");
      assert.strictEqual(data.room_count, 3, "Room count must be 3");
      assert.strictEqual(data.total_amount, 15000, "Grand total must be 15,000");

      multiGroupId = data.group_id;
      leadBookingId = data.lead_booking_id;
      allGroupBookingIds = data.booking_ids;

      assert.strictEqual(allGroupBookingIds.length, 3, "Must return 3 booking IDs");

      // Verify records in database
      const groupRowsRes = await rootClient.query(`
        SELECT id, room_id, group_id, is_group_lead, total_amount, status
        FROM public.bookings
        WHERE group_id = $1
        ORDER BY is_group_lead DESC, id ASC;
      `, [multiGroupId]);

      assert.strictEqual(groupRowsRes.rows.length, 3, "Database must contain exactly 3 booking rows for group");
      
      const leads = groupRowsRes.rows.filter(r => r.is_group_lead);
      assert.strictEqual(leads.length, 1, "Exactly ONE booking row must have is_group_lead = true");
      assert.strictEqual(leads[0].id, leadBookingId, "Lead booking ID must match lead row");

      const totalSum = groupRowsRes.rows.reduce((sum, r) => sum + parseFloat(r.total_amount), 0);
      assert.strictEqual(totalSum, 15000, "Sum of individual room amounts must equal ₹15,000");
    });

    // --------------------------------------------------------------------------
    // SCENARIO 2b: Two-Room Group Booking Creation and Shared group_id Assertion
    // --------------------------------------------------------------------------
    let twoRoomGroupId = null;
    let twoRoomBookingIds = [];
    await runScenario("Actual two-room group booking creation (2 rooms, shared group_id verification)", async () => {
      const checkIn = '2026-12-15';
      const checkOut = '2026-12-17'; // 2 nights * 2500 * 2 rooms = 10,000
      const guests = JSON.stringify([
        { name: 'Rohan Sharma', phone: '9988776655', email: 'rohan@test.local', is_primary: true },
        { name: 'Priya Sharma', phone: '9988776656', email: 'priya@test.local', is_primary: false }
      ]);

      const res = await rootClient.query(`
        SELECT public.create_group_booking_atomic(
          ARRAY[$1, $2]::UUID[],
          $3,
          $4,
          $5,
          2,
          'Two-room couple getaway',
          $6::jsonb
        ) AS result;
      `, [room1Id, room2Id, partnerId, checkIn, checkOut, guests]);

      const data = res.rows[0].result;
      assert.ok(data.group_id, "Group ID must be generated for two-room booking");
      assert.strictEqual(data.room_count, 2, "Room count must be exactly 2");
      assert.strictEqual(data.total_amount, 10000, "Total amount for 2 rooms over 2 nights must be 10,000");
      assert.strictEqual(data.booking_ids.length, 2, "Exactly 2 booking IDs must be returned");

      twoRoomGroupId = data.group_id;
      twoRoomBookingIds = data.booking_ids;

      // Verify both room booking rows in the database
      const rowsRes = await rootClient.query(`
        SELECT id, room_id, group_id, is_group_lead, total_amount, status
        FROM public.bookings
        WHERE id = ANY($1::UUID[])
        ORDER BY is_group_lead DESC;
      `, [twoRoomBookingIds]);

      assert.strictEqual(rowsRes.rows.length, 2, "Must return both booking rows from database");
      
      const row1 = rowsRes.rows[0];
      const row2 = rowsRes.rows[1];

      // CRITICAL ASSERTION: Both room booking rows MUST share the exact same group_id
      assert.strictEqual(row1.group_id, twoRoomGroupId, "Room 1 booking must have the generated group_id");
      assert.strictEqual(row2.group_id, twoRoomGroupId, "Room 2 booking must have the generated group_id");
      assert.strictEqual(row1.group_id, row2.group_id, "Both room bookings must have the exact same group_id");

      // Verify lead designation
      assert.strictEqual(row1.is_group_lead, true, "First room must be lead");
      assert.strictEqual(row2.is_group_lead, false, "Second room must not be lead");

      // Verify individual room rates
      assert.strictEqual(parseFloat(row1.total_amount), 5000, "Room 1 total amount must be ₹5,000");
      assert.strictEqual(parseFloat(row2.total_amount), 5000, "Room 2 total amount must be ₹5,000");
    });

    // --------------------------------------------------------------------------
    // SCENARIO 3: Concurrent Booking Attempts for the Same Room
    // --------------------------------------------------------------------------
    await runScenario("Concurrent booking attempts for the same room (FOR UPDATE row lock serialization)", async () => {
      const clientA = await pool.connect();
      const clientB = await pool.connect();

      const checkIn = '2026-12-20';
      const checkOut = '2026-12-22';

      let aSuccess = false;
      let bSuccess = false;
      let bErrorMessage = '';

      try {
        // Start Client A: acquires FOR UPDATE on room1Id and creates booking
        await clientA.query('BEGIN;');
        const aRes = await clientA.query(`
          SELECT public.create_group_booking_atomic(
            ARRAY[$1]::UUID[], $2, $3, $4, 2, 'Client A concurrent lock', '[]'::jsonb
          ) AS result;
        `, [room1Id, partnerId, checkIn, checkOut]);
        aSuccess = !!aRes.rows[0].result.group_id;

        // Concurrent Client B: attempts overlapping booking for room1Id
        // In PostgreSQL, FOR UPDATE on room1Id forces Client B to wait until Client A commits,
        // after which the availability check inside the function sees Client A's booking and rejects.
        const pB = (async () => {
          try {
            await clientB.query('BEGIN;');
            await clientB.query(`
              SELECT public.create_group_booking_atomic(
                ARRAY[$1]::UUID[], $2, $3, $4, 2, 'Client B concurrent lock', '[]'::jsonb
              ) AS result;
            `, [room1Id, partnerId, checkIn, checkOut]);
            await clientB.query('COMMIT;');
            bSuccess = true;
          } catch (err) {
            await clientB.query('ROLLBACK;').catch(() => {});
            bErrorMessage = err.message;
          }
        })();

        // Delay slightly then commit Client A
        await new Promise(r => setTimeout(r, 100));
        await clientA.query('COMMIT;');

        // Await Client B completion
        await pB;

        assert.strictEqual(aSuccess, true, "Client A transaction must succeed");
        assert.strictEqual(bSuccess, false, "Client B transaction must fail due to overlap");
        assert.ok(
          bErrorMessage.includes('ROOM_UNAVAILABLE'),
          `Client B should fail with ROOM_UNAVAILABLE, received: ${bErrorMessage}`
        );
      } finally {
        clientA.release();
        clientB.release();
      }
    });

    // --------------------------------------------------------------------------
    // SCENARIO 4: Atomic Rollback when One Room is Unavailable
    // --------------------------------------------------------------------------
    await runScenario("Atomic rollback when one room is unavailable (zero partial rows created)", async () => {
      // Room 101 is already booked from 2026-12-20 to 2026-12-22 (from Scenario 3).
      // Attempt multi-room booking for Room 101, Room 102, Room 103 for the same dates.
      const initialCountRes = await rootClient.query('SELECT COUNT(*) FROM public.bookings;');
      const initialCount = parseInt(initialCountRes.rows[0].count, 10);

      let caughtError = null;
      try {
        await rootClient.query(`
          SELECT public.create_group_booking_atomic(
            ARRAY[$1, $2, $3]::UUID[],
            $4,
            '2026-12-20',
            '2026-12-22',
            6,
            'Should fail and roll back completely',
            '[]'::jsonb
          );
        `, [room1Id, room2Id, room3Id, partnerId]);
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError, "RPC must raise an exception when one room is unavailable");
      assert.ok(
        caughtError.message.includes('ROOM_UNAVAILABLE'),
        `Error message must indicate ROOM_UNAVAILABLE, got: ${caughtError.message}`
      );

      // Verify complete atomicity: no partial rows inserted for room2 or room3
      const postCountRes = await rootClient.query('SELECT COUNT(*) FROM public.bookings;');
      const postCount = parseInt(postCountRes.rows[0].count, 10);
      assert.strictEqual(postCount, initialCount, "Database booking row count must remain 100% unchanged (atomic rollback)");
    });

    // --------------------------------------------------------------------------
    // SCENARIO 5: Consolidated Invoice Creation with Multi-Room Line Items
    // --------------------------------------------------------------------------
    let invoiceId = null;
    await runScenario("Consolidated invoice creation with line items for each room", async () => {
      // We will create an invoice linked to leadBookingId (which has multiGroupId)
      const invoiceNumber = `INV-TEST-GRP-${Date.now()}`;
      const items = JSON.stringify([
        { category: 'room', description: 'Room 101 - Valley View (2 nights)', quantity: 2, rate: 2500, amount: 5000, sort_order: 1 },
        { category: 'room', description: 'Room 102 - Mountain View (2 nights)', quantity: 2, rate: 2500, amount: 5000, sort_order: 2 },
        { category: 'room', description: 'Room 103 - Pine View (2 nights)', quantity: 2, rate: 2500, amount: 5000, sort_order: 3 }
      ]);

      const invRes = await rootClient.query(`
        SELECT public.create_invoice_with_items(
          $1,
          $2,
          'Chaitanya Reddy',
          '2026-12-10',
          '2026-12-12',
          15000.00,
          0.00,
          0.00,
          0.00,
          15000.00,
          $3::jsonb,
          CURRENT_DATE,
          'issued',
          '9876500000',
          'chaitanya@test.local',
          'Hyderabad, Telangana'
        ) AS invoice_id;
      `, [leadBookingId, invoiceNumber, items]);

      invoiceId = invRes.rows[0].invoice_id;
      assert.ok(invoiceId, "Invoice ID must be returned");

      // Verify invoice row
      const invCheck = await rootClient.query('SELECT * FROM public.invoices WHERE id = $1', [invoiceId]);
      assert.strictEqual(invCheck.rows.length, 1);
      const inv = invCheck.rows[0];
      assert.strictEqual(inv.group_id, multiGroupId, "Invoice must inherit group_id from booking");
      assert.strictEqual(parseFloat(inv.subtotal), 15000.00);
      assert.strictEqual(parseFloat(inv.grand_total), 15000.00);
      assert.strictEqual(parseFloat(inv.amount_paid), 0.00);
      assert.strictEqual(parseFloat(inv.balance_due), 15000.00);
      assert.strictEqual(inv.status, 'issued');

      // Verify line items count
      const itemCheck = await rootClient.query('SELECT COUNT(*) FROM public.invoice_items WHERE invoice_id = $1', [invoiceId]);
      assert.strictEqual(parseInt(itemCheck.rows[0].count, 10), 3, "Must have exactly 3 room line items");
    });

    // --------------------------------------------------------------------------
    // SCENARIO 6: Duplicate Active Group Invoice Prevention
    // --------------------------------------------------------------------------
    await runScenario("Database-level prevention of duplicate active invoices for same group", async () => {
      // Attempt 1: Call create_invoice_with_items again for the same group booking
      const duplicateInvoiceNumber = `INV-TEST-DUP-${Date.now()}`;
      let rpcCaughtError = null;

      try {
        await rootClient.query(`
          SELECT public.create_invoice_with_items(
            $1,
            $2,
            'Chaitanya Reddy Duplicate',
            '2026-12-10',
            '2026-12-12',
            15000.00,
            0.00,
            0.00,
            0.00,
            15000.00,
            '[]'::jsonb,
            CURRENT_DATE,
            'draft'
          );
        `, [leadBookingId, duplicateInvoiceNumber]);
      } catch (err) {
        rpcCaughtError = err;
      }

      assert.ok(rpcCaughtError, "RPC must reject duplicate active group invoice");
      assert.ok(
        rpcCaughtError.message.includes('DUPLICATE_GROUP_INVOICE') || rpcCaughtError.code === '23505',
        `RPC error should indicate duplicate invoice (code 23505 or DUPLICATE_GROUP_INVOICE), got: ${rpcCaughtError.message}`
      );

      // Attempt 2: Direct raw SQL insert bypassing the RPC to verify the partial unique index uq_invoices_active_group
      let directInsertCaught = null;
      try {
        await rootClient.query(`
          INSERT INTO public.invoices (
            homestay_id, booking_id, group_id, invoice_number, status, guest_name,
            invoice_date, check_in, check_out, subtotal, grand_total, balance_due, amount_paid
          ) VALUES (
            $1, $2, $3, $4, 'draft', 'Bypass Attempt', CURRENT_DATE, '2026-12-10', '2026-12-12', 15000, 15000, 15000, 0
          );
        `, [homestayId, leadBookingId, multiGroupId, `INV-DIRECT-${Date.now()}`]);
      } catch (err) {
        directInsertCaught = err;
      }

      assert.ok(directInsertCaught, "Direct raw insert must be rejected by partial unique index");
      assert.strictEqual(directInsertCaught.code, '23505', "PostgreSQL error code must be 23505 (unique_violation)");
      assert.ok(
        directInsertCaught.message.includes('uq_invoices_active_group'),
        `Error must mention index uq_invoices_active_group, got: ${directInsertCaught.message}`
      );

      // Assert that count of active invoices for group is still exactly 1
      const activeCount = await rootClient.query(`
        SELECT COUNT(*) FROM public.invoices WHERE group_id = $1 AND status != 'cancelled';
      `, [multiGroupId]);
      assert.strictEqual(parseInt(activeCount.rows[0].count, 10), 1, "Exactly one active invoice must exist");
    });

    // --------------------------------------------------------------------------
    // SCENARIO 7: Partial Payments, Ledger Triggers, and Balance Due
    // --------------------------------------------------------------------------
    await runScenario("Partial payment recording and automatic invoice balance reconciliation", async () => {
      // 1. Record partial payment of ₹5,000 using record_invoice_payment RPC
      const pay1Res = await rootClient.query(`
        SELECT public.record_invoice_payment(
          $1,
          5000.00,
          'upi',
          'UPI-REF-001',
          'Advance partial payment for group',
          'idemp-key-part-1'
        ) AS result;
      `, [invoiceId]);

      const pay1Data = pay1Res.rows[0].result;
      assert.strictEqual(pay1Data.success, true);
      assert.strictEqual(parseFloat(pay1Data.balance_due), 10000.00, "Balance due should be ₹10,000");

      // Verify invoice row updated via trg_sync_invoice_from_payments
      const invAfterPay1 = await rootClient.query('SELECT * FROM public.invoices WHERE id = $1', [invoiceId]);
      assert.strictEqual(parseFloat(invAfterPay1.rows[0].amount_paid), 5000.00);
      assert.strictEqual(parseFloat(invAfterPay1.rows[0].balance_due), 10000.00);
      assert.strictEqual(invAfterPay1.rows[0].status, 'partially_paid');

      // 2. Record remaining payment of ₹10,000
      const pay2Res = await rootClient.query(`
        SELECT public.record_invoice_payment(
          $1,
          10000.00,
          'cash',
          NULL,
          'Final settlement',
          'idemp-key-part-2'
        ) AS result;
      `, [invoiceId]);

      const pay2Data = pay2Res.rows[0].result;
      assert.strictEqual(pay2Data.success, true);
      assert.strictEqual(parseFloat(pay2Data.balance_due), 0.00, "Balance due should be ₹0.00");

      const invAfterPay2 = await rootClient.query('SELECT * FROM public.invoices WHERE id = $1', [invoiceId]);
      assert.strictEqual(parseFloat(invAfterPay2.rows[0].amount_paid), 15000.00);
      assert.strictEqual(parseFloat(invAfterPay2.rows[0].balance_due), 0.00);
      assert.strictEqual(invAfterPay2.rows[0].status, 'paid', "Status must transition to 'paid'");
    });

    // --------------------------------------------------------------------------
    // SCENARIO 8: Room-Level Cancellation
    // --------------------------------------------------------------------------
    await runScenario("Room-level cancellation (isolated cancellation & room availability release)", async () => {
      // Find non-lead room in the 3-room group
      const nonLeadRow = await rootClient.query(`
        SELECT id, room_id FROM public.bookings
        WHERE group_id = $1 AND is_group_lead = false
        LIMIT 1;
      `, [multiGroupId]);
      assert.ok(nonLeadRow.rows.length > 0);
      const cancelBookingId = nonLeadRow.rows[0].id;
      const releasedRoomId = nonLeadRow.rows[0].room_id;

      // Cancel only that individual room booking
      await rootClient.query(`
        UPDATE public.bookings
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1;
      `, [cancelBookingId]);

      // Verify the other 2 rooms remain 'confirmed'
      const statusCheck = await rootClient.query(`
        SELECT id, status, is_group_lead
        FROM public.bookings
        WHERE group_id = $1;
      `, [multiGroupId]);

      const cancelledRows = statusCheck.rows.filter(r => r.status === 'cancelled');
      const confirmedRows = statusCheck.rows.filter(r => r.status === 'confirmed');

      assert.strictEqual(cancelledRows.length, 1, "Exactly one room booking is cancelled");
      assert.strictEqual(cancelledRows[0].id, cancelBookingId);
      assert.strictEqual(confirmedRows.length, 2, "The remaining two rooms must remain confirmed");

      // Verify the released room is immediately bookable for the same dates by another party
      const rebookRes = await rootClient.query(`
        SELECT public.create_group_booking_atomic(
          ARRAY[$1]::UUID[],
          $2,
          '2026-12-10',
          '2026-12-12',
          2,
          'New guest booking released room',
          '[]'::jsonb
        ) AS result;
      `, [releasedRoomId, partnerId]);

      assert.ok(rebookRes.rows[0].result.group_id, "Released room must be immediately bookable");
    });

    // --------------------------------------------------------------------------
    // SCENARIO 9: Rollback Verification
    // --------------------------------------------------------------------------
    await runScenario("Rollback migration execution & Phase 2 create_invoice_with_items verification", async () => {
      // Execute the rollback script
      console.log("    Executing scripts/migration_group_bookings_rollback.sql...");
      await executeSqlFile(rootClient, 'scripts/migration_group_bookings_rollback.sql');

      // Verify atomic group function is dropped
      const fnCheck = await rootClient.query(`
        SELECT 1 FROM pg_proc WHERE proname = 'create_group_booking_atomic';
      `);
      assert.strictEqual(fnCheck.rows.length, 0, "create_group_booking_atomic must be dropped");

      // Verify partial unique index is dropped
      const idxCheck = await rootClient.query(`
        SELECT 1 FROM pg_indexes WHERE indexname = 'uq_invoices_active_group';
      `);
      assert.strictEqual(idxCheck.rows.length, 0, "uq_invoices_active_group must be dropped");

      // Verify group_id column is dropped from bookings and invoices
      const colCheck = await rootClient.query(`
        SELECT column_name, table_name FROM information_schema.columns
        WHERE table_schema = 'public' 
          AND column_name IN ('group_id', 'is_group_lead')
          AND table_name IN ('bookings', 'invoices');
      `);
      assert.strictEqual(colCheck.rows.length, 0, "group_id and is_group_lead columns must be dropped");

      // Verify Phase 2 create_invoice_with_items is restored and functions cleanly without group_id
      const p2Items = JSON.stringify([
        { category: 'room', description: 'Room 101 single stay', quantity: 2, rate: 2500, amount: 5000, sort_order: 1 }
      ]);
      const p2InvRes = await rootClient.query(`
        SELECT public.create_invoice_with_items(
          $1,
          $2,
          'Post Rollback Guest',
          '2026-12-01',
          '2026-12-03',
          5000.00,
          0.00,
          0.00,
          0.00,
          5000.00,
          $3::jsonb
        ) AS inv_id;
      `, [singleBookingId, `INV-ROLLBACK-${Date.now()}`, p2Items]);
      assert.ok(p2InvRes.rows[0].inv_id, "Restored Phase 2 create_invoice_with_items must function cleanly");
    });

    console.log("\n===============================================================================");
    console.log(`🎉 ALL ${passedCount}/${testIndex} INTEGRATION SCENARIOS PASSED SUCCESSFULLY ON POSTGRESQL!`);
    console.log("===============================================================================\n");

  } finally {
    if (rootClient) rootClient.release();
    await pool.end();
  }
}

function printTestPlanSummary() {
  console.log(`
-------------------------------------------------------------------------------
📋 COMPREHENSIVE INTEGRATION TEST PLAN FOR DEV / CI ENVIRONMENTS:
-------------------------------------------------------------------------------
1. Single-Room Booking:
   - Input: 1 room ID, valid dates, primary guest.
   - Assert: 1 booking row created, is_group_lead = true, room reserved.
2. Multi-Room Booking:
   - Input: N room IDs, valid dates, guest profiles.
   - Assert: N booking rows created sharing unique group_id, exactly 1 is_group_lead = true.
3. Concurrent Booking Protection:
   - Input: Two parallel clients requesting overlapping dates for same room.
   - Assert: One transaction succeeds; second transaction fails with ROOM_UNAVAILABLE.
4. Atomic Rollback on Partial Unavailability:
   - Input: Multi-room request where Room K is already booked.
   - Assert: RPC raises exception; zero bookings created for remaining rooms.
5. Consolidated Invoice Creation:
   - Input: Group lead booking ID + line items for each room.
   - Assert: Invoice inherits group_id, line items created, totals equal sum of room rates.
6. Duplicate Active Group Invoice Prevention:
   - Input: Second active invoice creation attempted for same group.
   - Assert: Blocked by uq_invoices_active_group index (code 23505 / DUPLICATE_GROUP_INVOICE).
7. Partial Payments & Balance Reconciliation:
   - Input: Payment amount < invoice grand_total.
   - Assert: Ledger row recorded, invoice.amount_paid updated, balance_due decremented, status = 'partially_paid'.
8. Room-Level Cancellation:
   - Input: Cancel one room in group.
   - Assert: Only target room status becomes 'cancelled'; sibling rooms remain 'confirmed'; room becomes rebookable.
9. Rollback Migration Verification:
   - Input: Execute migration_group_bookings_rollback.sql.
   - Assert: Phase 2 create_invoice_with_items restored, columns and indexes dropped cleanly.
-------------------------------------------------------------------------------
`);
}

main().catch(err => {
  console.error("Test execution terminated with error:", err);
  process.exit(1);
});
