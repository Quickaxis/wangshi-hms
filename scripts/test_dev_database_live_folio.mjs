/**
 * Real PostgreSQL 18 Engine Integration Test: Live Guest Folio Workflow
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

const connectionString = process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:54335/disposable_folio_test';

console.log("===============================================================================");
console.log("🏨 DISPOSABLE POSTGRESQL 18 ENGINE TEST: LIVE GUEST FOLIO WORKFLOW");
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
    // SCENARIO 1: Setup Core Schema
    await runStep("Setup core tables (homestays, rooms, partners, bookings, guests, payments)", async () => {
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
            RETURN 'receptionist@wangshi.test';
        END;
        $$ LANGUAGE plpgsql;
      `);
    });

    // SCENARIO 2: Apply Invoices & Group Bookings & Advance Payments Migrations
    await runStep("Apply Invoices, Group Bookings & Advance Payments Migrations", async () => {
      const phase2Sql = fs.readFileSync(path.join(projectRoot, 'scripts', 'migration_phase2_invoices.sql'), 'utf-8');
      await client.query(phase2Sql);

      const groupSql = fs.readFileSync(path.join(projectRoot, 'scripts', 'migration_group_bookings.sql'), 'utf-8');
      await client.query(groupSql);

      const advSql = fs.readFileSync(path.join(projectRoot, 'scripts', 'migration_advance_and_partial_payments.sql'), 'utf-8');
      await client.query(advSql);

      const compSql = fs.readFileSync(path.join(projectRoot, 'scripts', 'migration_add_is_complimentary_to_invoice_items.sql'), 'utf-8');
      await client.query(compSql);

      // Verify schema prerequisites
      const checkRes = await client.query(`
        SELECT 
          (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices')) as has_invoices,
          (SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'group_id')) as has_group_id,
          (SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'payment_stage')) as has_payment_stage,
          (SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_items' AND column_name = 'is_complimentary')) as has_is_complimentary;
      `);
      assert.strictEqual(checkRes.rows[0].has_invoices, true, "invoices table must exist");
      assert.strictEqual(checkRes.rows[0].has_group_id, true, "bookings.group_id must exist");
      assert.strictEqual(checkRes.rows[0].has_payment_stage, true, "payments.payment_stage must exist");
      assert.strictEqual(checkRes.rows[0].has_is_complimentary, true, "invoice_items.is_complimentary must exist");
    });

    // SCENARIO 3: Seed Homestay, Rooms, Partners
    let homestayId, partnerId, room1Id, room2Id, room3Id;
    await runStep("Seed Wangshi Homestay with 3 rooms and receptionist partner", async () => {
      const hsRes = await client.query(`
        INSERT INTO public.homestays (name, slug, location, phone, email)
        VALUES ('Wangshi Homestay', 'wangshi-homestay', 'Tawang, Arunachal Pradesh', '+91 9876543210', 'info@wangshi.test')
        RETURNING id;
      `);
      homestayId = hsRes.rows[0].id;

      const pRes = await client.query(`
        INSERT INTO public.partners (auth_user_id, homestay_id, name, email, role, is_active)
        VALUES ('00000000-0000-0000-0000-000000000001'::uuid, $1, 'Dorjee Wangshi', 'receptionist@wangshi.test', 'admin', true)
        RETURNING id;
      `, [homestayId]);
      partnerId = pRes.rows[0].id;

      const r1Res = await client.query(`
        INSERT INTO public.rooms (homestay_id, name, room_number, nightly_rate)
        VALUES ($1, 'Deluxe Room 101', '101', 2500.00) RETURNING id;
      `, [homestayId]);
      room1Id = r1Res.rows[0].id;

      const r2Res = await client.query(`
        INSERT INTO public.rooms (homestay_id, name, room_number, nightly_rate)
        VALUES ($1, 'Deluxe Room 102', '102', 2500.00) RETURNING id;
      `, [homestayId]);
      room2Id = r2Res.rows[0].id;

      const r3Res = await client.query(`
        INSERT INTO public.rooms (homestay_id, name, room_number, nightly_rate)
        VALUES ($1, 'Super Deluxe Room 201', '201', 3000.00) RETURNING id;
      `, [homestayId]);
      room3Id = r3Res.rows[0].id;
    });

    // SCENARIO 4: Single-Room Booking & Automatic Live Folio Creation
    let singleBookingId, singleFolioId;
    await runStep("Create single booking and auto-initialize Live Folio (draft status with room charge)", async () => {
      // 1. Create booking
      const bRes = await client.query(`
        INSERT INTO public.bookings (homestay_id, room_id, partner_id, check_in, check_out, nightly_rate, total_amount, status)
        VALUES ($1, $2, $3, '2026-11-20', '2026-11-22', 2500.00, 5000.00, 'confirmed')
        RETURNING id;
      `, [homestayId, room1Id, partnerId]);
      singleBookingId = bRes.rows[0].id;

      await client.query(`
        INSERT INTO public.guests (booking_id, name, phone, email, is_primary)
        VALUES ($1, 'Tenzing Norbu', '+91 9876511111', 'tenzing@example.com', true);
      `, [singleBookingId]);

      // 2. Initialize Live Folio (Status: 'draft', 1 line item for room charge)
      const invRes = await client.query(`
        SELECT public.create_invoice_with_items(
            $1::uuid,
            'INV-WNG-20261120-1001',
            'Tenzing Norbu',
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
                    'description', 'Deluxe Room 101 (2026-11-20 to 2026-11-22)',
                    'stay_period', '[2026-11-20, 2026-11-22)',
                    'quantity', 2,
                    'rate', 2500.00,
                    'amount', 5000.00,
                    'sort_order', 0
                )
            ),
            '2026-11-15'::date,
            'draft'
        ) as inv_id;
      `, [singleBookingId]);

      singleFolioId = invRes.rows[0].inv_id;
      assert(singleFolioId, "Live folio must be generated");

      const folioCheck = await client.query(`
        SELECT status, grand_total, amount_paid, balance_due FROM public.invoices WHERE id = $1;
      `, [singleFolioId]);

      assert.strictEqual(folioCheck.rows[0].status, 'draft', "Live Folio initial status must be 'draft'");
      assert.strictEqual(Number(folioCheck.rows[0].grand_total), 5000, "Grand total must be ₹5,000.00");
      assert.strictEqual(Number(folioCheck.rows[0].amount_paid), 0, "Initial amount paid must be ₹0.00");
      assert.strictEqual(Number(folioCheck.rows[0].balance_due), 5000, "Initial balance due must be ₹5,000.00");
    });

    // SCENARIO 5: Quick Add Folio Charges (Food & Beverages + Laundry)
    let foodItemId, laundryItemId;
    await runStep("Add extra folio charges (Dinner ₹800, Laundry ₹300) directly and recalculate totals", async () => {
      // Add F&B charge
      const fbRes = await client.query(`
        INSERT INTO public.invoice_items (invoice_id, homestay_id, category, description, quantity, rate, amount, sort_order)
        VALUES ($1, $2, 'food_beverage', 'Traditional Tibetan Dinner (2 Persons)', 1, 800.00, 800.00, 1)
        RETURNING id;
      `, [singleFolioId, homestayId]);
      foodItemId = fbRes.rows[0].id;

      // Add Laundry charge
      const lRes = await client.query(`
        INSERT INTO public.invoice_items (invoice_id, homestay_id, category, description, quantity, rate, amount, sort_order)
        VALUES ($1, $2, 'laundry', 'Expedited Laundry Service', 1, 300.00, 300.00, 2)
        RETURNING id;
      `, [singleFolioId, homestayId]);
      laundryItemId = lRes.rows[0].id;

      // Update invoice header totals (matching addFolioChargeAction logic)
      const itemsSumRes = await client.query(`
        SELECT COALESCE(SUM(amount), 0) as new_subtotal FROM public.invoice_items WHERE invoice_id = $1;
      `, [singleFolioId]);
      const newSubtotal = Number(itemsSumRes.rows[0].new_subtotal);

      await client.query(`
        UPDATE public.invoices 
        SET subtotal = $1, grand_total = $1, updated_at = NOW() 
        WHERE id = $2;
      `, [newSubtotal, singleFolioId]);

      // Reconcile invoice summary
      await client.query(`SELECT public.reconcile_invoice_summary($1);`, [singleFolioId]);

      const folioCheck = await client.query(`
        SELECT subtotal, grand_total, amount_paid, balance_due, status 
        FROM public.invoices WHERE id = $1;
      `, [singleFolioId]);

      assert.strictEqual(Number(folioCheck.rows[0].subtotal), 6100, "Subtotal must be ₹6,100 (5000 + 800 + 300)");
      assert.strictEqual(Number(folioCheck.rows[0].grand_total), 6100, "Grand total must be ₹6,100");
      assert.strictEqual(Number(folioCheck.rows[0].balance_due), 6100, "Balance due must update to ₹6,100");
      assert.strictEqual(folioCheck.rows[0].status, 'draft', "Status remains draft");
    });

    // SCENARIO 6: Record Advance Payment on Live Folio
    await runStep("Record advance payment (₹2,000 UPI) directly on the live folio", async () => {
      const payRes = await client.query(`
        SELECT public.record_invoice_payment(
            $1::uuid,
            2000.00,
            'upi',
            'UPI-ADV-998877',
            '[Advance] Reservation advance deposit',
            'idemp-adv-tenzing-01',
            'advance',
            NULL
        ) as rpc_res;
      `, [singleFolioId]);

      assert.strictEqual(payRes.rows[0].rpc_res.success, true, "Advance payment must succeed");
      assert.strictEqual(payRes.rows[0].rpc_res.payment_stage, 'advance', "Stage is 'advance'");

      const folioCheck = await client.query(`
        SELECT amount_paid, balance_due, status FROM public.invoices WHERE id = $1;
      `, [singleFolioId]);

      assert.strictEqual(Number(folioCheck.rows[0].amount_paid), 2000, "Amount paid is ₹2,000");
      assert.strictEqual(Number(folioCheck.rows[0].balance_due), 4100, "Balance due is ₹4,100 (6100 - 2000)");
      assert.strictEqual(folioCheck.rows[0].status, 'partially_paid', "Status transitioned to 'partially_paid'");
    });

    // SCENARIO 7: Safe Removal of a Folio Charge
    await runStep("Safely remove Laundry charge (₹300) and verify dynamic recalculation", async () => {
      await client.query(`DELETE FROM public.invoice_items WHERE id = $1;`, [laundryItemId]);

      const itemsSumRes = await client.query(`
        SELECT COALESCE(SUM(amount), 0) as new_subtotal FROM public.invoice_items WHERE invoice_id = $1;
      `, [singleFolioId]);
      const newSubtotal = Number(itemsSumRes.rows[0].new_subtotal);

      await client.query(`
        UPDATE public.invoices 
        SET subtotal = $1, grand_total = $1, updated_at = NOW() 
        WHERE id = $2;
      `, [newSubtotal, singleFolioId]);

      await client.query(`SELECT public.reconcile_invoice_summary($1);`, [singleFolioId]);

      const folioCheck = await client.query(`
        SELECT subtotal, grand_total, amount_paid, balance_due, status 
        FROM public.invoices WHERE id = $1;
      `, [singleFolioId]);

      assert.strictEqual(Number(folioCheck.rows[0].grand_total), 5800, "Grand total adjusted to ₹5,800 (6100 - 300)");
      assert.strictEqual(Number(folioCheck.rows[0].amount_paid), 2000, "Amount paid remains ₹2,000");
      assert.strictEqual(Number(folioCheck.rows[0].balance_due), 3800, "Balance due adjusted to ₹3,800 (5800 - 2000)");
      assert.strictEqual(folioCheck.rows[0].status, 'partially_paid', "Status remains partially_paid");
    });

    // SCENARIO 8: Edit Additional Service Charge & Add Complimentary Item (is_complimentary test)
    await runStep("Edit additional service charge and add complimentary service (is_complimentary = true)", async () => {
      // Update quantity to 2, rate 800 -> amount = 1600
      await client.query(`
        UPDATE public.invoice_items 
        SET quantity = 2, rate = 800.00, amount = 1600.00 
        WHERE id = $1;
      `, [foodItemId]);

      // Add complimentary breakfast item
      const compItemRes = await client.query(`
        INSERT INTO public.invoice_items (invoice_id, homestay_id, category, description, quantity, rate, amount, sort_order, is_complimentary)
        VALUES ($1, $2, 'food_beverage', 'Complimentary Herbal Tea & Breakfast', 2, 0.00, 0.00, 3, true)
        RETURNING id, is_complimentary;
      `, [singleFolioId, homestayId]);
      assert.strictEqual(compItemRes.rows[0].is_complimentary, true, "is_complimentary stored as true on invoice_items");

      const itemsSumRes = await client.query(`
        SELECT COALESCE(SUM(amount), 0) as new_subtotal FROM public.invoice_items WHERE invoice_id = $1;
      `, [singleFolioId]);
      const newSubtotal = Number(itemsSumRes.rows[0].new_subtotal);

      await client.query(`
        UPDATE public.invoices 
        SET subtotal = $1, grand_total = $1, updated_at = NOW() 
        WHERE id = $2;
      `, [newSubtotal, singleFolioId]);

      await client.query(`SELECT public.reconcile_invoice_summary($1);`, [singleFolioId]);

      const folioCheck = await client.query(`
        SELECT subtotal, grand_total, amount_paid, balance_due, status 
        FROM public.invoices WHERE id = $1;
      `, [singleFolioId]);

      assert.strictEqual(Number(folioCheck.rows[0].grand_total), 6600, "Grand total updated to ₹6,600 (5000 + 1600 + 0 comp)");
      assert.strictEqual(Number(folioCheck.rows[0].amount_paid), 2000, "Amount paid remains ₹2,000");
      assert.strictEqual(Number(folioCheck.rows[0].balance_due), 4600, "Balance due recalculated to ₹4,600 (6600 - 2000)");
      assert.strictEqual(folioCheck.rows[0].status, 'partially_paid', "Status remains partially_paid");
    });

    // SCENARIO 9: Authorized Room Rate Adjustment with Audit Trail & Booking Contract Preservation
    await runStep("Authorized staff adjusts room charge rate on folio with audit trail; original booking contract preserved", async () => {
      const roomItemRes = await client.query(`
        SELECT id, category, description, quantity, rate, amount, is_complimentary FROM public.invoice_items WHERE invoice_id = $1 AND category = 'room' LIMIT 1;
      `, [singleFolioId]);
      assert(roomItemRes.rows.length > 0, "Room item must exist");
      const roomItem = roomItemRes.rows[0];

      // Verify room category cannot be deleted from folio and is_complimentary is false
      const cannotDeleteRoom = roomItem.category === 'room';
      assert.strictEqual(cannotDeleteRoom, true, "Room category is contractual and protected from deletion on folio");
      assert.strictEqual(roomItem.is_complimentary, false, "Room charge has is_complimentary = false");

      // Check original booking rate before adjustment
      const origBooking = await client.query(`SELECT nightly_rate, total_amount FROM public.bookings WHERE id = $1;`, [singleBookingId]);
      assert.strictEqual(Number(origBooking.rows[0].nightly_rate), 2500, "Original booking nightly rate is ₹2,500");

      // 1. Test rate INCREASE: from ₹2,500 to ₹2,800 (2 nights => ₹5,600)
      const oldRate = Number(roomItem.rate);
      const oldQty = Number(roomItem.quantity);
      const oldAmt = Number(roomItem.amount);
      const incRate = 2800;
      const incQty = oldQty;
      const incAmt = incRate * incQty; // 5600

      const otherItemsRes = await client.query(`SELECT SUM(amount) as sum FROM public.invoice_items WHERE invoice_id = $1 AND id <> $2;`, [singleFolioId, roomItem.id]);
      const otherSum = Number(otherItemsRes.rows[0].sum) || 0;
      const incSubtotal = otherSum + incAmt;

      const incTimestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      const incAudit = `[Room Charge Adjustment - ${incTimestamp} by Dorjee Wangshi (admin)]: "${roomItem.description}" adjusted from ₹${oldRate} × ${oldQty} (₹${oldAmt}) to ₹${incRate} × ${incQty} (₹${incAmt}) • Reason: Corporate Booking Agreement`;

      await client.query(`
        UPDATE public.invoice_items
        SET rate = $1, amount = $2
        WHERE id = $3;
      `, [incRate, incAmt, roomItem.id]);

      await client.query(`
        UPDATE public.invoices
        SET subtotal = $1,
            grand_total = $1,
            notes = COALESCE(notes || E'\n\n', '') || $2,
            updated_at = NOW()
        WHERE id = $3;
      `, [incSubtotal, incAudit, singleFolioId]);

      await client.query(`SELECT public.reconcile_invoice_summary($1);`, [singleFolioId]);

      const incFolio = await client.query(`SELECT subtotal, grand_total, amount_paid, balance_due, notes FROM public.invoices WHERE id = $1;`, [singleFolioId]);
      assert.strictEqual(Number(incFolio.rows[0].grand_total), 7200, "Grand total increased to ₹7,200 (5600 + 1600)");
      assert(incFolio.rows[0].notes.includes("Corporate Booking Agreement"), "Audit notes contains increase reason");

      // 2. Test rate DECREASE: from ₹2,800 to ₹2,200 (2 nights => ₹4,400)
      const decRate = 2200;
      const decAmt = decRate * oldQty; // 4400
      const decSubtotal = otherSum + decAmt; // 4400 + 1600 = 6000

      const curPaidRes = await client.query(`SELECT amount_paid FROM public.invoices WHERE id = $1;`, [singleFolioId]);
      const curPaid = Number(curPaidRes.rows[0].amount_paid); // 2000
      assert(decSubtotal >= curPaid, "New subtotal must be >= payments collected");

      const decTimestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      const decAudit = `[Room Charge Adjustment - ${decTimestamp} by Dorjee Wangshi (admin)]: "${roomItem.description}" adjusted from ₹${incRate} × ${incQty} (₹${incAmt}) to ₹${decRate} × ${oldQty} (₹${decAmt}) • Reason: Seasonal Promotional Offer`;

      await client.query(`
        UPDATE public.invoice_items
        SET rate = $1, amount = $2
        WHERE id = $3;
      `, [decRate, decAmt, roomItem.id]);

      await client.query(`
        UPDATE public.invoices
        SET subtotal = $1,
            grand_total = $1,
            notes = COALESCE(notes || E'\n\n', '') || $2,
            updated_at = NOW()
        WHERE id = $3;
      `, [decSubtotal, decAudit, singleFolioId]);

      await client.query(`SELECT public.reconcile_invoice_summary($1);`, [singleFolioId]);

      // Verify updated folio
      const updatedFolio = await client.query(`SELECT subtotal, grand_total, amount_paid, balance_due, notes FROM public.invoices WHERE id = $1;`, [singleFolioId]);
      assert.strictEqual(Number(updatedFolio.rows[0].subtotal), 6000, "Subtotal updated to ₹6,000 (4400 + 1600)");
      assert.strictEqual(Number(updatedFolio.rows[0].grand_total), 6000, "Grand total updated to ₹6,000");
      assert.strictEqual(Number(updatedFolio.rows[0].amount_paid), 2000, "Amount paid remains ₹2,000");
      assert.strictEqual(Number(updatedFolio.rows[0].balance_due), 4000, "Balance due recalculated to ₹4,000 (6000 - 2000)");
      assert(updatedFolio.rows[0].notes.includes("[Room Charge Adjustment - "), "Audit notes recorded structured log");
      assert(updatedFolio.rows[0].notes.includes("Seasonal Promotional Offer"), "Audit notes includes adjustment reason");

      // Verify is_complimentary is still false for room
      const roomItemAfter = await client.query(`SELECT is_complimentary FROM public.invoice_items WHERE id = $1;`, [roomItem.id]);
      assert.strictEqual(roomItemAfter.rows[0].is_complimentary, false, "Room is_complimentary remains false");

      // Verify original booking contract remains UNCHANGED
      const checkBookingAfter = await client.query(`SELECT nightly_rate, total_amount FROM public.bookings WHERE id = $1;`, [singleBookingId]);
      assert.strictEqual(Number(checkBookingAfter.rows[0].nightly_rate), 2500, "Original booking contract nightly rate remains ₹2,500");
      assert.strictEqual(Number(checkBookingAfter.rows[0].total_amount), 5000, "Original booking contract total amount remains ₹5,000");
    });

    // SCENARIO 10: Immutability Constraint: Cannot Adjust or Remove Charges Below Paid Amount
    await runStep("Prevent adjusting charges if new grand total would drop below amount already collected (₹2,000)", async () => {
      // Current paid: 2000. Current dinner: 1600.
      // If we attempt to reduce room rate to ₹100 (total = ₹200), grand total becomes 200 + 1600 = 1800, which is < 2000 (illegal)
      const proposedRoomAmount = 200;
      const otherItemsRes = await client.query(`SELECT SUM(amount) as sum FROM public.invoice_items WHERE invoice_id = $1 AND category <> 'room';`, [singleFolioId]);
      const otherSum = Number(otherItemsRes.rows[0].sum) || 0; // 1600
      const hypotheticalGrandTotal = otherSum + proposedRoomAmount; // 1800

      const curPaidRes = await client.query(`SELECT amount_paid FROM public.invoices WHERE id = $1;`, [singleFolioId]);
      const currentPaid = Number(curPaidRes.rows[0].amount_paid); // 2000

      assert(hypotheticalGrandTotal < currentPaid, "Hypothetical total (1800) is below collected amount (2000)");
      const wouldBeRejected = hypotheticalGrandTotal < currentPaid;
      assert.strictEqual(wouldBeRejected, true, "Application validation must reject dropping total below collected amount");
    });

    // SCENARIO 11: Final Settlement Payment & Finalizing Tax Invoice
    await runStep("Record final settlement payment (₹4,000 Cash) and finalize tax invoice at checkout", async () => {
      const finalPay = await client.query(`
        SELECT public.record_invoice_payment(
            $1::uuid,
            4000.00,
            'cash',
            'CASH-CHECKOUT-01',
            '[Final] Checkout settlement',
            'idemp-final-tenzing-01',
            'final',
            NULL
        ) as rpc_res;
      `, [singleFolioId]);

      assert.strictEqual(finalPay.rows[0].rpc_res.success, true, "Final payment must succeed");

      const settledFolio = await client.query(`
        SELECT grand_total, amount_paid, balance_due, status FROM public.invoices WHERE id = $1;
      `, [singleFolioId]);

      assert.strictEqual(Number(settledFolio.rows[0].amount_paid), 6000, "Total collected is ₹6,000");
      assert.strictEqual(Number(settledFolio.rows[0].balance_due), 0, "Balance due is exactly ₹0.00");
      assert.strictEqual(settledFolio.rows[0].status, 'paid', "Status transitions to 'paid'");

      // Verify all ledger payments exist with exact receipt numbers
      const pRows = await client.query(`
        SELECT amount, payment_stage, receipt_number, payment_method FROM public.payments WHERE invoice_id = $1 ORDER BY created_at;
      `, [singleFolioId]);
      assert.strictEqual(pRows.rows.length, 2, "Exactly 2 ledger payments recorded");
      assert.strictEqual(pRows.rows[0].payment_stage, 'advance');
      assert.strictEqual(pRows.rows[1].payment_stage, 'final');
      assert(pRows.rows[0].receipt_number.startsWith('REC-'));
      assert(pRows.rows[1].receipt_number.startsWith('REC-'));
    });

    // SCENARIO 10: Multi-Room Group Booking Consolidated Folio Lifecycle
    let groupId, groupBooking1Id, groupBooking2Id, groupFolioId;
    await runStep("Create 2-room group booking and verify ONE consolidated Live Folio with all rooms", async () => {
      groupId = '11111111-2222-3333-4444-555555555555';

      // Room 201 (₹3,000 x 2 = ₹6,000) - Lead
      const b1 = await client.query(`
        INSERT INTO public.bookings (homestay_id, room_id, partner_id, group_id, is_group_lead, check_in, check_out, nightly_rate, total_amount, status)
        VALUES ($1, $2, $3, $4, true, '2026-11-25', '2026-11-27', 3000.00, 6000.00, 'confirmed')
        RETURNING id;
      `, [homestayId, room3Id, partnerId, groupId]);
      groupBooking1Id = b1.rows[0].id;

      // Room 102 (₹2,500 x 2 = ₹5,000)
      const b2 = await client.query(`
        INSERT INTO public.bookings (homestay_id, room_id, partner_id, group_id, is_group_lead, check_in, check_out, nightly_rate, total_amount, status)
        VALUES ($1, $2, $3, $4, false, '2026-11-25', '2026-11-27', 2500.00, 5000.00, 'confirmed')
        RETURNING id;
      `, [homestayId, room2Id, partnerId, groupId]);
      groupBooking2Id = b2.rows[0].id;

      // Primary Guest
      await client.query(`
        INSERT INTO public.guests (booking_id, name, phone, email, is_primary)
        VALUES ($1, 'Karmapa Family', '+91 9876522222', 'karmapa@example.com', true);
      `, [groupBooking1Id]);

      // Initialize Consolidated Group Folio
      const gInvRes = await client.query(`
        SELECT public.create_invoice_with_items(
            $1::uuid,
            'INV-WNG-20261125-GRP01',
            'Karmapa Family',
            '2026-11-25'::date,
            '2026-11-27'::date,
            11000.00,
            0.00,
            0.00,
            0.00,
            11000.00,
            jsonb_build_array(
                jsonb_build_object(
                    'category', 'room',
                    'description', 'Super Deluxe Room 201 (2026-11-25 to 2026-11-27)',
                    'quantity', 2,
                    'rate', 3000.00,
                    'amount', 6000.00,
                    'sort_order', 0
                ),
                jsonb_build_object(
                    'category', 'room',
                    'description', 'Deluxe Room 102 (2026-11-25 to 2026-11-27)',
                    'quantity', 2,
                    'rate', 2500.00,
                    'amount', 5000.00,
                    'sort_order', 1
                )
            ),
            '2026-11-15'::date,
            'draft'
        ) as inv_id;
      `, [groupBooking1Id]);

      groupFolioId = gInvRes.rows[0].inv_id;
      assert(groupFolioId, "Group folio must be generated");

      const gFolioCheck = await client.query(`
        SELECT group_id, grand_total, amount_paid, balance_due, status 
        FROM public.invoices WHERE id = $1;
      `, [groupFolioId]);

      assert.strictEqual(gFolioCheck.rows[0].group_id, groupId, "Group ID must be attached to the consolidated folio");
      assert.strictEqual(Number(gFolioCheck.rows[0].grand_total), 11000, "Combined grand total is ₹11,000 (6000 + 5000)");
      assert.strictEqual(Number(gFolioCheck.rows[0].balance_due), 11000, "Group balance due is ₹11,000");

      // Verify line items count
      const itemsRes = await client.query(`
        SELECT category, description, amount FROM public.invoice_items WHERE invoice_id = $1 ORDER BY sort_order;
      `, [groupFolioId]);
      assert.strictEqual(itemsRes.rows.length, 2, "Consolidated folio contains exactly 2 room line items");
    });

    // SCENARIO 11: Prevent Duplicate Group Invoices
    await runStep("Verify database-level constraint prevents duplicate group invoices", async () => {
      let threwDuplicate = false;
      try {
        await client.query(`
          SELECT public.create_invoice_with_items(
              $1::uuid,
              'INV-WNG-20261125-GRP02',
              'Karmapa Family',
              '2026-11-25'::date,
              '2026-11-27'::date,
              11000.00,
              0.00,
              0.00,
              0.00,
              11000.00,
              jsonb_build_array(
                  jsonb_build_object('category', 'room', 'description', 'Duplicate Test', 'quantity', 1, 'rate', 11000, 'amount', 11000, 'sort_order', 0)
              ),
              '2026-11-15'::date,
              'draft'
          );
        `, [groupBooking2Id]);
      } catch (err) {
        threwDuplicate = true;
        assert(
          err.message.includes('DUPLICATE_GROUP_INVOICE') || 
          err.message.includes('unique_active_group_invoice') || 
          err.message.includes('duplicate key') || 
          err.message.includes('unique'), 
          `Error must indicate duplicate group invoice rejection: ${err.message}`
        );
      }
      assert.strictEqual(threwDuplicate, true, "Second invoice for same group must be rejected");
    });

    // SCENARIO 12: Group Folio Advance Payment
    await runStep("Record advance payment (₹4,000 via Bank Transfer) on consolidated group folio", async () => {
      const advRes = await client.query(`
        SELECT public.record_invoice_payment(
            $1::uuid,
            4000.00,
            'bank_transfer',
            'IMPS-GRP-900',
            '[Advance] Group token deposit',
            'idemp-grp-adv',
            'advance',
            NULL
        ) as rpc_res;
      `, [groupFolioId]);
      assert.strictEqual(advRes.rows[0].rpc_res.success, true);

      const folioCheck = await client.query(`SELECT amount_paid, balance_due, status FROM public.invoices WHERE id = $1;`, [groupFolioId]);
      assert.strictEqual(Number(folioCheck.rows[0].amount_paid), 4000, "Advance paid is ₹4,000");
      assert.strictEqual(Number(folioCheck.rows[0].balance_due), 7000, "Balance due is ₹7,000 (11000 - 4000)");
      assert.strictEqual(folioCheck.rows[0].status, 'partially_paid');
    });

    // SCENARIO 13: Group Folio Room Rate Adjustment Isolation
    await runStep("Adjust room charge on multi-room group folio: verify room isolation and booking contract preservation", async () => {
      // Find Room 102 line item on group folio
      const r102Res = await client.query(`
        SELECT id, description, quantity, rate, amount 
        FROM public.invoice_items 
        WHERE invoice_id = $1 AND description LIKE '%102%'
        LIMIT 1;
      `, [groupFolioId]);
      assert(r102Res.rows.length > 0, "Room 102 item exists on group folio");
      const r102Item = r102Res.rows[0];

      // Staff adjusts Room 102 rate from ₹2,500 to ₹2,800 (2 nights => ₹5,600)
      const oldR102Rate = Number(r102Item.rate);
      const newR102Rate = 2800;
      const newR102Amt = newR102Rate * Number(r102Item.quantity); // 5600

      const grpTimestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      const grpAudit = `[Room Charge Adjustment - ${grpTimestamp} by Dorjee Wangshi (admin)]: "${r102Item.description}" adjusted from ₹${oldR102Rate} × ${r102Item.quantity} (₹${r102Item.amount}) to ₹${newR102Rate} × ${r102Item.quantity} (₹${newR102Amt}) • Reason: Manager Approved Rate`;

      await client.query(`
        UPDATE public.invoice_items
        SET rate = $1, amount = $2
        WHERE id = $3;
      `, [newR102Rate, newR102Amt, r102Item.id]);

      // Calculate new group folio subtotal
      const sumRes = await client.query(`SELECT SUM(amount) as sum FROM public.invoice_items WHERE invoice_id = $1;`, [groupFolioId]);
      const newGrpSubtotal = Number(sumRes.rows[0].sum); // 6000 (Room 201) + 5600 (Room 102) = 11600

      await client.query(`
        UPDATE public.invoices
        SET subtotal = $1,
            grand_total = $1,
            notes = COALESCE(notes || E'\n\n', '') || $2,
            updated_at = NOW()
        WHERE id = $3;
      `, [newGrpSubtotal, grpAudit, groupFolioId]);

      await client.query(`SELECT public.reconcile_invoice_summary($1);`, [groupFolioId]);

      // Verify group folio
      const updatedGrp = await client.query(`
        SELECT grand_total, amount_paid, balance_due, status, notes FROM public.invoices WHERE id = $1;
      `, [groupFolioId]);
      assert.strictEqual(Number(updatedGrp.rows[0].grand_total), 11600, "Group grand total is now ₹11,600 (6000 + 5600)");
      assert.strictEqual(Number(updatedGrp.rows[0].amount_paid), 4000, "Advance paid remains ₹4,000");
      assert.strictEqual(Number(updatedGrp.rows[0].balance_due), 7600, "Balance due dynamically adjusted to ₹7,600 (11600 - 4000)");
      assert(updatedGrp.rows[0].notes.includes("Manager Approved Rate"), "Audit trail logged on group folio");

      // Verify Room 201 line item on folio remains completely untouched
      const r201Item = await client.query(`
        SELECT rate, amount FROM public.invoice_items WHERE invoice_id = $1 AND description LIKE '%201%' LIMIT 1;
      `, [groupFolioId]);
      assert.strictEqual(Number(r201Item.rows[0].rate), 3000, "Room 201 rate remains ₹3,000");
      assert.strictEqual(Number(r201Item.rows[0].amount), 6000, "Room 201 amount remains ₹6,000");

      // Verify original bookings in public.bookings remain strictly untouched
      const b1Check = await client.query(`SELECT nightly_rate, total_amount FROM public.bookings WHERE id = $1;`, [groupBooking1Id]);
      assert.strictEqual(Number(b1Check.rows[0].nightly_rate), 3000, "Room 201 booking nightly rate untouched");
      assert.strictEqual(Number(b1Check.rows[0].total_amount), 6000, "Room 201 booking total amount untouched");

      const b2Check = await client.query(`SELECT nightly_rate, total_amount FROM public.bookings WHERE id = $1;`, [groupBooking2Id]);
      assert.strictEqual(Number(b2Check.rows[0].nightly_rate), 2500, "Room 102 booking nightly rate untouched");
      assert.strictEqual(Number(b2Check.rows[0].total_amount), 5000, "Room 102 booking total amount untouched");
    });

    // SCENARIO 14: Final Settlement on Group Folio
    await runStep("Record final settlement payment (₹7,600 Card) on group folio to settle balance to ₹0.00", async () => {
      const finRes = await client.query(`
        SELECT public.record_invoice_payment(
            $1::uuid,
            7600.00,
            'card',
            'CARD-GRP-777',
            '[Final] Group final checkout',
            'idemp-grp-fin',
            'final',
            NULL
        ) as rpc_res;
      `, [groupFolioId]);
      assert.strictEqual(finRes.rows[0].rpc_res.success, true);

      const settledGroup = await client.query(`
        SELECT grand_total, amount_paid, balance_due, status FROM public.invoices WHERE id = $1;
      `, [groupFolioId]);

      assert.strictEqual(Number(settledGroup.rows[0].amount_paid), 11600, "Combined ₹11,600 collected");
      assert.strictEqual(Number(settledGroup.rows[0].balance_due), 0, "Group balance due is exactly ₹0.00");
      assert.strictEqual(settledGroup.rows[0].status, 'paid', "Group folio status updated to 'paid'");
    });

    // SCENARIO 15: Safe Rollback & Reapplication of is_complimentary Migration
    await runStep("Verify safe rollback and re-application of migration_add_is_complimentary_to_invoice_items", async () => {
      // 1. Execute rollback script
      const rollbackSql = fs.readFileSync(path.join(projectRoot, 'scripts', 'migration_add_is_complimentary_to_invoice_items_rollback.sql'), 'utf-8');
      await client.query(rollbackSql);

      const checkDrop = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'invoice_items' AND column_name = 'is_complimentary'
        ) as has_col;
      `);
      assert.strictEqual(checkDrop.rows[0].has_col, false, "Column is_complimentary successfully dropped by rollback");

      // 2. Re-apply migration script (verifying idempotency)
      const reapplySql = fs.readFileSync(path.join(projectRoot, 'scripts', 'migration_add_is_complimentary_to_invoice_items.sql'), 'utf-8');
      await client.query(reapplySql);

      const checkRestore = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'invoice_items' AND column_name = 'is_complimentary'
        ) as has_col;
      `);
      assert.strictEqual(checkRestore.rows[0].has_col, true, "Column is_complimentary successfully restored by additive migration");
    });

    console.log("\n===============================================================================");
    console.log(`🎉 ALL ${passedTests}/${totalTests} LIVE GUEST FOLIO POSTGRESQL INTEGRATION SCENARIOS PASSED!`);
    console.log("===============================================================================\n");

  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Test Suite Fatal Error:", err);
  process.exit(1);
});
