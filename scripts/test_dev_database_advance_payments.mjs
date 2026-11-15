/**
 * Real PostgreSQL 18 Engine Integration Test: Advance & Partial Payments
 *
 * Runs against an ephemeral, disposable local PostgreSQL cluster on loopback.
 * Strictly 0% production involvement.
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const connectionString = process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:54334/disposable_advance_test';

console.log("===============================================================================");
console.log("🐘 DISPOSABLE REAL POSTGRESQL 18 ENGINE TEST: ADVANCE & PARTIAL PAYMENTS");
console.log("===============================================================================\n");

let passedTests = 0;
let totalTests = 0;

function runStep(name, fn) {
  totalTests++;
  return fn()
    .then(() => {
      console.log(`✅ [SCENARIO ${totalTests}] PASS: ${name}`);
      passedTests++;
    })
    .catch((err) => {
      console.error(`❌ [SCENARIO ${totalTests}] FAIL: ${name}`);
      console.error(err);
      throw err;
    });
}

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    // SCENARIO 1: Setup Core Schema & Phase 2
    await runStep("Setup core tables (homestays, rooms, partners, bookings, guests)", async () => {
      await client.query(`
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

        CREATE EXTENSION IF NOT EXISTS btree_gist;
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

        CREATE TABLE IF NOT EXISTS public.homestays (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            location TEXT,
            phone TEXT,
            email TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS public.rooms (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            homestay_id UUID NOT NULL REFERENCES public.homestays(id),
            name TEXT NOT NULL,
            room_number TEXT,
            room_type TEXT DEFAULT 'room',
            nightly_rate NUMERIC(10,2) NOT NULL DEFAULT 1000.00,
            max_guests INTEGER NOT NULL DEFAULT 2,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS public.partners (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            auth_user_id UUID,
            homestay_id UUID REFERENCES public.homestays(id),
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            role TEXT DEFAULT 'staff',
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS public.bookings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            homestay_id UUID NOT NULL REFERENCES public.homestays(id),
            room_id UUID NOT NULL REFERENCES public.rooms(id),
            partner_id UUID NOT NULL REFERENCES public.partners(id),
            check_in DATE NOT NULL,
            check_out DATE NOT NULL,
            status TEXT NOT NULL DEFAULT 'confirmed',
            number_of_guests INTEGER NOT NULL DEFAULT 1,
            nightly_rate NUMERIC(10,2) NOT NULL DEFAULT 1000.00,
            total_amount NUMERIC(10,2) NOT NULL DEFAULT 1000.00,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS public.guests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            is_primary BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS public.payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            homestay_id UUID NOT NULL REFERENCES public.homestays(id),
            booking_id UUID NOT NULL REFERENCES public.bookings(id),
            amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
            payment_type TEXT NOT NULL DEFAULT 'payment' CHECK (payment_type IN ('payment', 'refund', 'reversal')),
            payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'upi', 'bank_transfer', 'card', 'ota_payout')),
            parent_payment_id UUID REFERENCES public.payments(id),
            transaction_ref TEXT,
            notes TEXT,
            recorded_by UUID NOT NULL REFERENCES public.partners(id),
            idempotency_key TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE SCHEMA IF NOT EXISTS auth;

        CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE plpgsql AS $$
        BEGIN RETURN '00000000-0000-0000-0000-000000000001'::uuid; END;
        $$;

        CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;

        CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS BOOLEAN LANGUAGE plpgsql AS $$
        BEGIN RETURN true; END;
        $$;

        CREATE OR REPLACE FUNCTION public.get_user_homestay_id() RETURNS UUID LANGUAGE plpgsql AS $$
        BEGIN RETURN (SELECT id FROM public.homestays LIMIT 1); END;
        $$;

        CREATE OR REPLACE FUNCTION public.is_active_partner() RETURNS BOOLEAN LANGUAGE plpgsql AS $$
        BEGIN RETURN true; END;
        $$;

        CREATE OR REPLACE FUNCTION auth.email() RETURNS text AS $$
        BEGIN
            RETURN 'test.receptionist@wangshi.test';
        END;
        $$ LANGUAGE plpgsql;
      `);
    });

    // SCENARIO 2: Apply Phase 2 Invoices Schema
    await runStep("Apply Phase 2 Invoices Schema", async () => {
      const phase2Sql = fs.readFileSync(path.join(projectRoot, 'scripts', 'migration_phase2_invoices.sql'), 'utf-8');
      await client.query(phase2Sql);

      const res = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices'
        ) as has_inv;
      `);
      assert.strictEqual(res.rows[0].has_inv, true, "invoices table must exist");
    });

    // SCENARIO 3: Apply Group Bookings Migration
    await runStep("Apply Group Bookings Migration", async () => {
      const groupSql = fs.readFileSync(path.join(projectRoot, 'scripts', 'migration_group_bookings.sql'), 'utf-8');
      await client.query(groupSql);

      const res = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'bookings' AND column_name = 'group_id';
      `);
      assert.strictEqual(res.rows.length, 1, "group_id column must exist on bookings");
    });

    // SCENARIO 4: Apply Advance & Partial Payments Migration
    await runStep("Apply Advance & Partial Payments Migration (scripts/migration_advance_and_partial_payments.sql)", async () => {
      const advSql = fs.readFileSync(path.join(projectRoot, 'scripts', 'migration_advance_and_partial_payments.sql'), 'utf-8');
      await client.query(advSql);

      const colRes = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'payments' AND column_name IN ('payment_stage', 'receipt_number')
        ORDER BY column_name;
      `);
      assert.strictEqual(colRes.rows.length, 2, "Both payment_stage and receipt_number must exist on payments");

      const idxRes = await client.query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'payments' AND indexname IN ('idx_payments_payment_stage', 'idx_payments_receipt_number');
      `);
      assert.strictEqual(idxRes.rows.length, 2, "Both indexes must exist");
    });

    // SCENARIO 5: Seed test property, receptionist, and booking
    let homestayId, partnerId, roomId, bookingId;
    await runStep("Seed test homestay, partner, room, and booking", async () => {
      const hsRes = await client.query(`
        INSERT INTO public.homestays (name, slug, location, phone, email)
        VALUES ('Wangshi Homestay', 'wangshi-homestay', 'Tawang, Arunachal Pradesh', '+91 9876543210', 'info@wangshi.test')
        RETURNING id;
      `);
      homestayId = hsRes.rows[0].id;

      const pRes = await client.query(`
        INSERT INTO public.partners (auth_user_id, homestay_id, name, email, role, is_active)
        VALUES ('00000000-0000-0000-0000-000000000001'::uuid, $1, 'Sonam Wangshi', 'test.receptionist@wangshi.test', 'admin', true)
        RETURNING id;
      `, [homestayId]);
      partnerId = pRes.rows[0].id;

      const rRes = await client.query(`
        INSERT INTO public.rooms (homestay_id, name, room_number, nightly_rate)
        VALUES ($1, 'Deluxe Mountain View', '101', 2500.00)
        RETURNING id;
      `, [homestayId]);
      roomId = rRes.rows[0].id;

      const bRes = await client.query(`
        INSERT INTO public.bookings (homestay_id, room_id, partner_id, check_in, check_out, total_amount, status)
        VALUES ($1, $2, $3, '2026-11-20', '2026-11-22', 5000.00, 'confirmed')
        RETURNING id;
      `, [homestayId, roomId, partnerId]);
      bookingId = bRes.rows[0].id;

      await client.query(`
        INSERT INTO public.guests (booking_id, name, phone, is_primary)
        VALUES ($1, 'Chaitanya Reddy', '+91 9876500000', true);
      `, [bookingId]);
    });

    // SCENARIO 6: Record Pre-Arrival Advance Payment
    let advancePaymentId;
    await runStep("Record pre-arrival advance payment with payment_stage = 'advance'", async () => {
      const advRes = await client.query(`
        INSERT INTO public.payments (
            homestay_id,
            booking_id,
            amount,
            payment_type,
            payment_method,
            transaction_ref,
            notes,
            recorded_by,
            payment_stage,
            receipt_number
        ) VALUES (
            $1, $2, 2000.00, 'payment', 'upi', 'UPI-ADV-12345', '[Advance] Token deposit paid via UPI', $3, 'advance',
            'REC-' || to_char(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') || '-ADV00001'
        ) RETURNING id, payment_stage, receipt_number, created_at;
      `, [homestayId, bookingId, partnerId]);

      advancePaymentId = advRes.rows[0].id;
      assert.strictEqual(advRes.rows[0].payment_stage, 'advance', "Payment stage must be 'advance'");
      assert(advRes.rows[0].receipt_number.startsWith('REC-'), "Receipt number must start with REC-");
    });

    // SCENARIO 7: Create Invoice & Auto-Link Unallocated Advance Payment
    let invoiceId;
    await runStep("Create invoice and auto-link unallocated advance payment", async () => {
      const invRes = await client.query(`
        SELECT public.create_invoice_with_items(
            $1::uuid,
            'INV-WNG-20261115-0001',
            'Chaitanya Reddy',
            '2026-11-20'::date,
            '2026-11-22'::date,
            5000.00,
            0.00,
            0.00,
            0.00,
            5000.00,
            jsonb_build_array(
                jsonb_build_object(
                    'category', 'room',
                    'description', 'Deluxe Mountain View (2 Nights)',
                    'quantity', 1,
                    'rate', 5000.00,
                    'amount', 5000.00,
                    'sort_order', 0
                )
            ),
            '2026-11-15'::date,
            'draft'
        ) as inv_id;
      `, [bookingId]);

      invoiceId = invRes.rows[0].inv_id;
      assert(invoiceId, "Invoice ID must be generated");

      // Auto-link unallocated advance payment
      await client.query(`
        UPDATE public.payments 
        SET invoice_id = $1 
        WHERE booking_id = $2 AND invoice_id IS NULL;
      `, [invoiceId, bookingId]);

      // Reconcile
      await client.query(`SELECT public.reconcile_invoice_summary($1);`, [invoiceId]);

      const invCheck = await client.query(`
        SELECT grand_total, amount_paid, balance_due, status 
        FROM public.invoices WHERE id = $1;
      `, [invoiceId]);

      assert.strictEqual(Number(invCheck.rows[0].grand_total), 5000, "Grand total is 5000");
      assert.strictEqual(Number(invCheck.rows[0].amount_paid), 2000, "Amount paid credited with 2000 advance");
      assert.strictEqual(Number(invCheck.rows[0].balance_due), 3000, "Balance due is 3000");
      assert.strictEqual(invCheck.rows[0].status, 'partially_paid', "Status is partially_paid");
    });

    // SCENARIO 8: In-Stay Partial Payment via record_invoice_payment RPC
    await runStep("Record in-stay partial payment via record_invoice_payment RPC", async () => {
      const payRes = await client.query(`
        SELECT public.record_invoice_payment(
            $1::uuid,
            1500.00,
            'cash',
            'CASH-PART-01',
            '[Partial] Mid-stay interim payment',
            'idemp-part-01',
            'partial',
            NULL
        ) as rpc_res;
      `, [invoiceId]);

      const rpcData = payRes.rows[0].rpc_res;
      assert.strictEqual(rpcData.success, true, "RPC call must succeed");
      assert.strictEqual(rpcData.payment_stage, 'partial', "Stage must be 'partial'");
      assert(rpcData.receipt_number.startsWith('REC-'), "Generated receipt number starts with REC-");

      const invCheck = await client.query(`
        SELECT amount_paid, balance_due, status 
        FROM public.invoices WHERE id = $1;
      `, [invoiceId]);

      assert.strictEqual(Number(invCheck.rows[0].amount_paid), 3500, "Amount paid is 3500 (2000 + 1500)");
      assert.strictEqual(Number(invCheck.rows[0].balance_due), 1500, "Balance due is 1500");
      assert.strictEqual(invCheck.rows[0].status, 'partially_paid', "Status remains partially_paid");
    });

    // SCENARIO 9: Overpayment Prevention
    await runStep("Overpayment rejection: cannot pay more than balance due", async () => {
      let overpayThrew = false;
      try {
        await client.query(`
          SELECT public.record_invoice_payment(
              $1::uuid,
              2000.00,
              'cash'
          );
        `, [invoiceId]);
      } catch (err) {
        overpayThrew = true;
        assert(err.message.includes('INVOICE_OVERPAYMENT_EXCEEDED'), `Error message must contain INVOICE_OVERPAYMENT_EXCEEDED: ${err.message}`);
      }
      assert.strictEqual(overpayThrew, true, "Overpayment attempt must throw an exception");
    });

    // SCENARIO 10: Final Payment & Checkout Settlement to 'paid'
    await runStep("Final payment clearing remaining balance exactly to 0.00 and status to 'paid'", async () => {
      const finalRes = await client.query(`
        SELECT public.record_invoice_payment(
            $1::uuid,
            1500.00,
            'card',
            'AUTH-CARD-99',
            '[Final] Checkout final settlement',
            'idemp-final-01',
            'final',
            NULL
        ) as rpc_res;
      `, [invoiceId]);

      assert.strictEqual(finalRes.rows[0].rpc_res.success, true, "Final settlement succeeds");

      const finalInv = await client.query(`
        SELECT grand_total, amount_paid, balance_due, status 
        FROM public.invoices WHERE id = $1;
      `, [invoiceId]);

      assert.strictEqual(Number(finalInv.rows[0].amount_paid), 5000, "Total paid is 5000");
      assert.strictEqual(Number(finalInv.rows[0].balance_due), 0, "Balance due is exactly 0.00");
      assert.strictEqual(finalInv.rows[0].status, 'paid', "Invoice status is 'paid'");

      // Verify all 3 immutable payments exist in public.payments
      const payRows = await client.query(`
        SELECT amount, payment_stage, receipt_number, payment_method 
        FROM public.payments 
        WHERE invoice_id = $1 
        ORDER BY created_at ASC;
      `, [invoiceId]);

      assert.strictEqual(payRows.rows.length, 3, "Exactly 3 immutable payment rows exist");
      assert.strictEqual(payRows.rows[0].payment_stage, 'advance', "Row 1 is advance");
      assert.strictEqual(payRows.rows[1].payment_stage, 'partial', "Row 2 is partial");
      assert.strictEqual(payRows.rows[2].payment_stage, 'final', "Row 3 is final");
    });

    // SCENARIO 11: Rollback script test
    await runStep("Verify rollback script (scripts/migration_advance_and_partial_payments_rollback.sql)", async () => {
      const rollbackSql = fs.readFileSync(path.join(projectRoot, 'scripts', 'migration_advance_and_partial_payments_rollback.sql'), 'utf-8');
      await client.query(rollbackSql);

      const colRes = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'payments' AND column_name IN ('payment_stage', 'receipt_number');
      `);
      assert.strictEqual(colRes.rows.length, 0, "Columns dropped cleanly by rollback");

      // Verify payment rows themselves are preserved
      const payRows = await client.query(`SELECT count(*) as cnt FROM public.payments;`);
      assert.strictEqual(Number(payRows.rows[0].cnt), 3, "All 3 payment rows preserved during rollback");
    });

    console.log("\n===============================================================================");
    console.log(`🎉 ALL ${passedTests}/${totalTests} POSTGRESQL REAL ENGINE INTEGRATION SCENARIOS PASSED!`);
    console.log("===============================================================================\n");

  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Test Suite Fatal Error:", err);
  process.exit(1);
});
