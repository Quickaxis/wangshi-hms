import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Read environment variables manually from .env.local
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

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function runAudit() {
  console.log("=================================================================");
  console.log("WANGSHI HOMESTAY - LEGACY TEST DATA CLEANUP AUDIT (READ-ONLY)");
  console.log("Supabase URL:", supabaseUrl);
  console.log("=================================================================\n");

  // 1. Audit Homestays
  const { data: homestays, error: hsErr } = await supabase
    .from("homestays")
    .select("id, name, slug, location, phone, email, is_active, created_at")
    .order("created_at", { ascending: true });

  if (hsErr) {
    console.error("Error fetching homestays:", hsErr);
    return;
  }

  console.log(`--- 1. HOMESTAYS IN DATABASE (${homestays.length}) ---`);
  console.table(homestays);

  // Find Wangshi homestay
  const wangshiCandidates = homestays.filter(
    (h) =>
      (h.name && h.name.toLowerCase().includes("wangshi")) ||
      (h.slug && h.slug.toLowerCase().includes("wangshi"))
  );

  console.log("\nWangshi candidate match(es):", wangshiCandidates);

  if (wangshiCandidates.length === 0) {
    console.error("NO HOMESTAY MATCHING 'Wangshi' FOUND!");
    return;
  }

  const wangshi = wangshiCandidates[0];
  const wangshiId = wangshi.id;
  console.log(`\nTARGET HOMESTAY VERIFIED: Name: "${wangshi.name}", ID: ${wangshiId}, Slug: "${wangshi.slug}"\n`);

  // 2. Audit Bookings for Wangshi
  const { data: bookings, error: bErr } = await supabase
    .from("bookings")
    .select("id, homestay_id, room_id, partner_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, created_at")
    .eq("homestay_id", wangshiId)
    .order("created_at", { ascending: true });

  if (bErr) {
    console.error("Error fetching bookings:", bErr);
    return;
  }

  console.log(`--- 2. BOOKINGS FOR WANGSHI HOMESTAY (${bookings.length}) ---`);
  console.log(`Expected: ~32 bookings. Found: ${bookings.length} bookings.`);

  const bookingIds = bookings.map((b) => b.id);

  // Also check if there are any bookings with NULL homestay_id or all bookings in the system
  const { count: totalAllBookings, error: totalErr } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true });
  console.log(`Total bookings across ALL homestays in database: ${totalAllBookings}\n`);

  // 3. Audit Guests linked to Wangshi bookings
  const { data: guests, error: gErr } = await supabase
    .from("guests")
    .select("id, booking_id, homestay_id, name, phone, email, is_primary, created_at")
    .in("booking_id", bookingIds.length > 0 ? bookingIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: true });

  if (gErr) {
    console.error("Error fetching guests:", gErr);
    return;
  }
  console.log(`--- 3. GUEST RECORDS LINKED TO WANGSHI BOOKINGS (${guests.length}) ---`);

  // Check if any of these guests have phone or email referenced by bookings outside Wangshi
  const guestPhones = [...new Set(guests.map((g) => g.phone).filter(Boolean))];
  const guestEmails = [...new Set(guests.map((g) => g.email).filter(Boolean))];

  console.log(`Unique phone numbers in Wangshi guests: ${guestPhones.length}`);
  console.log(`Unique email addresses in Wangshi guests: ${guestEmails.length}`);

  let sharedGuestsCount = 0;
  let sharedGuestsDetails = [];

  // Query guests outside Wangshi bookings
  const { data: outsideGuests, error: ogErr } = await supabase
    .from("guests")
    .select("id, booking_id, homestay_id, name, phone, email")
    .not("booking_id", "in", `(${bookingIds.join(",")})`);

  if (ogErr) {
    console.error("Error fetching outside guests:", ogErr);
  } else {
    console.log(`Total guest records OUTSIDE Wangshi bookings: ${outsideGuests.length}`);
    for (const og of outsideGuests) {
      const matchPhone = og.phone && guestPhones.includes(og.phone);
      const matchEmail = og.email && guestEmails.includes(og.email);
      if (matchPhone || matchEmail) {
        sharedGuestsCount++;
        sharedGuestsDetails.push({
          outside_guest_id: og.id,
          outside_booking_id: og.booking_id,
          outside_homestay_id: og.homestay_id,
          name: og.name,
          phone: og.phone,
          email: og.email,
          matchedBy: matchPhone && matchEmail ? "phone+email" : matchPhone ? "phone" : "email"
        });
      }
    }
    console.log(`Guest records outside Wangshi sharing phone/email with Wangshi guests: ${sharedGuestsCount}`);
    if (sharedGuestsCount > 0) {
      console.log("Shared guest details:", sharedGuestsDetails);
    }
  }

  // 4. Audit Invoices linked to Wangshi bookings / homestay
  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select("id, homestay_id, booking_id, invoice_number, invoice_date, status, guest_name, grand_total, amount_paid, balance_due, created_at")
    .or(`homestay_id.eq.${wangshiId},booking_id.in.(${bookingIds.join(",")})`)
    .order("created_at", { ascending: true });

  if (invErr) {
    console.error("Error fetching invoices:", invErr);
  } else {
    console.log(`\n--- 4. INVOICES LINKED TO WANGSHI / BOOKINGS (${invoices.length}) ---`);
    console.table(invoices.map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      booking_id: inv.booking_id,
      status: inv.status,
      guest_name: inv.guest_name,
      grand_total: inv.grand_total,
      amount_paid: inv.amount_paid,
      balance_due: inv.balance_due
    })));

    // Line items
    if (invoices.length > 0) {
      const invoiceIds = invoices.map((i) => i.id);
      const { data: items, error: itemsErr } = await supabase
        .from("invoice_items")
        .select("id, invoice_id, category, description, quantity, rate, amount")
        .in("invoice_id", invoiceIds);
      if (itemsErr) {
        console.error("Error fetching invoice items:", itemsErr);
      } else {
        console.log(`Total invoice line items linked: ${items.length}`);
      }
    }
  }

  // 5. Audit Payments linked to Wangshi bookings / homestay
  const { data: payments, error: pErr } = await supabase
    .from("payments")
    .select("id, homestay_id, booking_id, invoice_id, amount, payment_type, payment_method, transaction_ref, notes, created_at")
    .or(`homestay_id.eq.${wangshiId},booking_id.in.(${bookingIds.join(",")})`)
    .order("created_at", { ascending: true });

  if (pErr) {
    console.error("Error fetching payments:", pErr);
  } else {
    console.log(`\n--- 5. PAYMENTS LINKED TO WANGSHI / BOOKINGS (${payments.length}) ---`);
    console.table(payments);
  }

  // 6. Check booking_requests linked to Wangshi / bookings
  const { data: bRequests, error: brErr } = await supabase
    .from("booking_requests")
    .select("id, homestay_id, booking_id, guest_name, status, created_at")
    .or(`homestay_id.eq.${wangshiId},booking_id.in.(${bookingIds.join(",")})`);

  if (brErr) {
    console.log("booking_requests check error (may not exist or different schema):", brErr.message);
  } else {
    console.log(`\n--- 6. BOOKING REQUESTS LINKED TO WANGSHI / BOOKINGS (${bRequests.length}) ---`);
    console.table(bRequests);
  }

  // 7. Check Rooms for Wangshi
  const { data: rooms, error: rErr } = await supabase
    .from("rooms")
    .select("id, room_number, name, nightly_rate, is_active, homestay_id")
    .eq("homestay_id", wangshiId);

  if (rErr) {
    console.error("Error fetching rooms:", rErr);
  } else {
    console.log(`\n--- 7. ROOMS FOR WANGSHI HOMESTAY (${rooms.length}) ---`);
    console.table(rooms);
  }

  // 8. Breakdown of all bookings (statuses, dates, guests)
  console.log("\n--- 8. DETAILED BOOKING BREAKDOWN ---");
  const guestMap = {};
  for (const g of guests) {
    if (!guestMap[g.booking_id]) guestMap[g.booking_id] = [];
    guestMap[g.booking_id].push(g);
  }

  const breakdown = bookings.map((b) => {
    const linkedGuests = guestMap[b.id] || [];
    const primaryGuest = linkedGuests.find((g) => g.is_primary) || linkedGuests[0];
    return {
      booking_id: b.id,
      guest_name: primaryGuest ? primaryGuest.name : "(no guest record)",
      phone: primaryGuest ? primaryGuest.phone : "",
      email: primaryGuest ? primaryGuest.email : "",
      total_guests_linked: linkedGuests.length,
      check_in: b.check_in,
      check_out: b.check_out,
      status: b.status,
      total_amount: b.total_amount,
      notes: b.notes,
      created_at: b.created_at
    };
  });

  console.table(breakdown);
}

runAudit().catch(console.error);

