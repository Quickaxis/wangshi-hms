import fs from "fs";

const auditData = JSON.parse(fs.readFileSync("scripts/wangshi_audit_data.json", "utf8"));
const WANGSHI_ID = "ce603bb8-c9e3-4ce1-a57e-b6c4140ea459";

function escapeSql(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return val.toString();
  return `'${val.toString().replace(/'/g, "''")}'`;
}

function generateHardenedRollbackSQL() {
  const sql = `-- ==============================================================================
-- WANGSHI HOMESTAY: CLEANUP ROLLBACK & RESTORATION SCRIPT (HARDENED)
-- Target Homestay: Wangshi Homestay ('ce603bb8-c9e3-4ce1-a57e-b6c4140ea459')
-- Project Reference: algorrnjotffcvtinbyy (Supabase Production)
--
-- Restores all 32 bookings, 41 guests, 1 invoice, 3 invoice items, and 2 payments
-- with their exact original UUIDs, timestamps, statuses, and ledger associations.
--
-- TRANSACTION LOCKING:
--   - public.payments: ACCESS EXCLUSIVE (required for ALTER TABLE ... DISABLE/ENABLE TRIGGER).
--   - public.invoice_items, public.invoices, public.guests, public.bookings: EXCLUSIVE.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. TRANSACTIONAL TABLE LOCKS
-- ------------------------------------------------------------------------------
LOCK TABLE public.payments IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.invoice_items, public.invoices, public.guests, public.bookings IN EXCLUSIVE MODE;
LOCK TABLE public.rooms, public.partners, public.homestays IN SHARE MODE;

-- ------------------------------------------------------------------------------
-- 2. Restore Bookings (32 rows)
-- ------------------------------------------------------------------------------
INSERT INTO public.bookings (
    id, homestay_id, room_id, partner_id, check_in, check_out, status, 
    number_of_guests, nightly_rate, total_amount, notes, created_at, updated_at
) VALUES
${auditData.bookingsDetailed.map(b => {
  return `(
    ${escapeSql(b.id)},
    ${escapeSql(WANGSHI_ID)},
    ${escapeSql(b.room_id || auditData.rooms.find(r => r.room_number === b.room_number)?.id)},
    ${escapeSql(b.partner_id || '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf')},
    ${escapeSql(b.check_in)},
    ${escapeSql(b.check_out)},
    ${escapeSql(b.status)},
    ${escapeSql(b.number_of_guests || 1)},
    ${escapeSql(b.nightly_rate)},
    ${escapeSql(b.total_amount)},
    ${escapeSql(b.notes)},
    ${escapeSql(b.created_at)},
    ${escapeSql(b.created_at)}
  )`;
}).join(",\n")}
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. Restore Guests (41 rows)
-- ------------------------------------------------------------------------------
INSERT INTO public.guests (
    id, booking_id, homestay_id, name, phone, email, is_primary, created_at
) VALUES
${auditData.bookingsDetailed.flatMap(b => b.guests.map(g => `(
    ${escapeSql(g.id)},
    ${escapeSql(b.id)},
    ${escapeSql(WANGSHI_ID)},
    ${escapeSql(g.name)},
    ${escapeSql(g.phone)},
    ${escapeSql(g.email)},
    ${escapeSql(g.is_primary)},
    ${escapeSql(b.created_at)}
)`)).join(",\n")}
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. Restore Invoices (1 row)
-- ------------------------------------------------------------------------------
INSERT INTO public.invoices (
    id, homestay_id, booking_id, invoice_number, invoice_date, status, 
    guest_name, grand_total, amount_paid, balance_due, created_at, updated_at
) VALUES
${auditData.invoices.map(i => `(
    ${escapeSql(i.id)},
    ${escapeSql(i.homestay_id)},
    ${escapeSql(i.booking_id)},
    ${escapeSql(i.invoice_number)},
    ${escapeSql(i.invoice_date)},
    ${escapeSql(i.status)},
    ${escapeSql(i.guest_name)},
    ${escapeSql(i.grand_total)},
    ${escapeSql(i.amount_paid)},
    ${escapeSql(i.balance_due)},
    ${escapeSql(i.created_at)},
    ${escapeSql(i.updated_at || i.created_at)}
)`).join(",\n")}
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 5. Restore Invoice Items (3 rows)
-- ------------------------------------------------------------------------------
INSERT INTO public.invoice_items (
    id, invoice_id, homestay_id, category, description, stay_period, quantity, rate, amount, sort_order, created_at
) VALUES
${auditData.invoiceItems.map(it => `(
    ${escapeSql(it.id)},
    ${escapeSql(it.invoice_id)},
    ${escapeSql(it.homestay_id)},
    ${escapeSql(it.category)},
    ${escapeSql(it.description)},
    ${escapeSql(it.stay_period)},
    ${escapeSql(it.quantity)},
    ${escapeSql(it.rate)},
    ${escapeSql(it.amount)},
    ${escapeSql(it.sort_order)},
    ${escapeSql(it.created_at)}
)`).join(",\n")}
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 6. Restore Payments (2 rows)
-- Temporarily suspend immutability & insert triggers to restore historical ledger rows.
-- ------------------------------------------------------------------------------
ALTER TABLE public.payments DISABLE TRIGGER trg_prevent_payment_ledger_mutation;
ALTER TABLE public.payments DISABLE TRIGGER trg_validate_payment_integrity;

INSERT INTO public.payments (
    id, homestay_id, booking_id, invoice_id, amount, payment_type, payment_method,
    transaction_ref, notes, recorded_by, idempotency_key, created_at
) VALUES
${auditData.payments.map(p => `(
    ${escapeSql(p.id)},
    ${escapeSql(p.homestay_id)},
    ${escapeSql(p.booking_id)},
    ${escapeSql(p.invoice_id)},
    ${escapeSql(p.amount)},
    ${escapeSql(p.payment_type)},
    ${escapeSql(p.payment_method)},
    ${escapeSql(p.transaction_ref)},
    ${escapeSql(p.notes)},
    ${escapeSql(p.recorded_by)},
    ${escapeSql(p.idempotency_key)},
    ${escapeSql(p.created_at)}
)`).join(",\n")}
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.payments ENABLE TRIGGER trg_prevent_payment_ledger_mutation;
ALTER TABLE public.payments ENABLE TRIGGER trg_validate_payment_integrity;

-- ------------------------------------------------------------------------------
-- 7. Verification Gateways
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_b_count INTEGER;
    v_g_count INTEGER;
    v_i_count INTEGER;
    v_it_count INTEGER;
    v_p_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_b_count FROM public.bookings WHERE homestay_id = '${WANGSHI_ID}';
    SELECT COUNT(*) INTO v_g_count FROM public.guests WHERE homestay_id = '${WANGSHI_ID}';
    SELECT COUNT(*) INTO v_i_count FROM public.invoices WHERE homestay_id = '${WANGSHI_ID}';
    SELECT COUNT(*) INTO v_it_count FROM public.invoice_items WHERE homestay_id = '${WANGSHI_ID}';
    SELECT COUNT(*) INTO v_p_count FROM public.payments WHERE homestay_id = '${WANGSHI_ID}';

    IF v_b_count <> 32 OR v_g_count <> 41 OR v_i_count <> 1 OR v_it_count <> 3 OR v_p_count <> 2 THEN
        RAISE EXCEPTION 'ROLLBACK RESTORATION VERIFICATION FAILED: Bookings: %, Guests: %, Invoices: %, Items: %, Payments: %',
            v_b_count, v_g_count, v_i_count, v_it_count, v_p_count;
    END IF;

    RAISE NOTICE 'Rollback restoration successful: Exactly 32 bookings, 41 guests, 1 invoice, 3 items, and 2 payments restored.';
END $$;

COMMIT;
`;
  return sql;
}

const rollbackSql = generateHardenedRollbackSQL();
fs.writeFileSync("scripts/cleanup_wangshi_test_data_rollback.sql", rollbackSql, "utf8");
console.log("Hardened rollback SQL written to scripts/cleanup_wangshi_test_data_rollback.sql");
