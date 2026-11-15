import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
let supabaseUrl = "";
let supabaseKey = "";

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^['"]|['"]$/g, "");
      if (key === "NEXT_PUBLIC_SUPABASE_URL") supabaseUrl = val;
      if (key === "SUPABASE_SERVICE_ROLE_KEY" || key === "SUPABASE_SECRET_KEY") {
        if (!supabaseKey) supabaseKey = val;
      }
    }
  }
}

const supabase = createClient(supabaseUrl, supabaseKey);
const WANGSHI_ID = "ce603bb8-c9e3-4ce1-a57e-b6c4140ea459";

async function deepAudit() {
  // 1. Fetch Wangshi homestay details
  const { data: homestay } = await supabase
    .from("homestays")
    .select("*")
    .eq("id", WANGSHI_ID)
    .single();

  // 2. Fetch all rooms
  const { data: rooms } = await supabase
    .from("rooms")
    .select("*")
    .eq("homestay_id", WANGSHI_ID);
  const roomMap = Object.fromEntries(rooms.map(r => [r.id, r]));

  // 3. Fetch partners
  const { data: partners } = await supabase
    .from("partners")
    .select("*");
  const partnerMap = Object.fromEntries(partners.map(p => [p.id, p]));

  // 4. Fetch all bookings for Wangshi
  const { data: bookings } = await supabase
    .from("bookings")
    .select("*")
    .eq("homestay_id", WANGSHI_ID)
    .order("created_at", { ascending: true });

  const bookingIds = bookings.map(b => b.id);

  // 5. Fetch all guests linked to these bookings
  const { data: guests } = await supabase
    .from("guests")
    .select("*")
    .in("booking_id", bookingIds)
    .order("created_at", { ascending: true });

  // 6. Check if any guests in guests table have homestay_id = WANGSHI_ID but booking_id NOT in bookingIds
  const { data: orphanedWangshiGuests } = await supabase
    .from("guests")
    .select("*")
    .eq("homestay_id", WANGSHI_ID)
    .not("booking_id", "in", `(${bookingIds.join(",")})`);

  // 7. Fetch all invoices for Wangshi / bookings
  const { data: invoices } = await supabase
    .from("invoices")
    .select("*")
    .or(`homestay_id.eq.${WANGSHI_ID},booking_id.in.(${bookingIds.join(",")})`);

  const invoiceIds = invoices.map(i => i.id);

  // 8. Fetch invoice items
  let invoiceItems = [];
  if (invoiceIds.length > 0) {
    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .in("invoice_id", invoiceIds);
    invoiceItems = items || [];
  }

  // 9. Fetch payments
  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .or(`homestay_id.eq.${WANGSHI_ID},booking_id.in.(${bookingIds.join(",")})`);

  // 10. Fetch booking_requests
  const { data: bookingRequests } = await supabase
    .from("booking_requests")
    .select("*");

  // Output structured report data
  const result = {
    homestay,
    roomsCount: rooms.length,
    rooms,
    bookingsCount: bookings.length,
    bookingsByStatus: bookings.reduce((acc, b) => {
      acc[b.status] = (acc[b.status] || 0) + 1;
      return acc;
    }, {}),
    guestsCount: guests.length,
    orphanedGuestsCount: orphanedWangshiGuests ? orphanedWangshiGuests.length : 0,
    invoicesCount: invoices.length,
    invoices,
    invoiceItemsCount: invoiceItems.length,
    invoiceItems,
    paymentsCount: payments.length,
    payments,
    bookingRequestsAll: bookingRequests,
    bookingRequestsLinkedToWangshi: bookingRequests.filter(br => br.homestay_id === WANGSHI_ID || bookingIds.includes(br.booking_id)),
    bookingsDetailed: bookings.map(b => {
      const bGuests = guests.filter(g => g.booking_id === b.id);
      const bInvoices = invoices.filter(i => i.booking_id === b.id);
      const bPayments = payments.filter(p => p.booking_id === b.id);
      const room = roomMap[b.room_id] || { room_number: "Unknown", name: "Unknown" };
      const partner = partnerMap[b.partner_id] || { name: "Unknown", email: "Unknown" };
      return {
        id: b.id,
        status: b.status,
        check_in: b.check_in,
        check_out: b.check_out,
        nights: Math.round((new Date(b.check_out) - new Date(b.check_in)) / (1000 * 60 * 60 * 24)),
        room_number: room.room_number,
        room_name: room.name,
        nightly_rate: b.nightly_rate,
        total_amount: b.total_amount,
        partner_name: partner.name,
        notes: b.notes,
        created_at: b.created_at,
        guests: bGuests.map(g => ({
          id: g.id,
          name: g.name,
          phone: g.phone,
          email: g.email,
          is_primary: g.is_primary
        })),
        invoices: bInvoices.map(i => ({
          id: i.id,
          invoice_number: i.invoice_number,
          status: i.status,
          grand_total: i.grand_total,
          amount_paid: i.amount_paid,
          balance_due: i.balance_due
        })),
        payments: bPayments.map(p => ({
          id: p.id,
          amount: p.amount,
          payment_type: p.payment_type,
          payment_method: p.payment_method,
          transaction_ref: p.transaction_ref,
          notes: p.notes,
          created_at: p.created_at
        }))
      };
    })
  };

  fs.writeFileSync(
    path.resolve(process.cwd(), "scripts/wangshi_audit_data.json"),
    JSON.stringify(result, null, 2),
    "utf8"
  );
  console.log("Audit complete. Data written to scripts/wangshi_audit_data.json");
}

deepAudit().catch(console.error);

