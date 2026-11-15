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

async function capture() {
  console.log("Capturing 100% full raw column snapshots from production...");

  // 1. Wangshi Homestay
  const { data: homestay } = await supabase
    .from("homestays")
    .select("*")
    .eq("id", WANGSHI_ID)
    .single();

  // 2. Wangshi Rooms
  const { data: rooms } = await supabase
    .from("rooms")
    .select("*")
    .eq("homestay_id", WANGSHI_ID)
    .order("room_number", { ascending: true });

  // 3. Wangshi Partners
  const { data: partners } = await supabase
    .from("partners")
    .select("*")
    .eq("homestay_id", WANGSHI_ID)
    .order("created_at", { ascending: true });

  // 4. Wangshi Bookings (32 rows)
  const { data: bookings } = await supabase
    .from("bookings")
    .select("*")
    .eq("homestay_id", WANGSHI_ID)
    .order("created_at", { ascending: true });

  const bookingIds = bookings.map(b => b.id);

  // 5. Wangshi Guests (41 rows)
  const { data: guests } = await supabase
    .from("guests")
    .select("*")
    .in("booking_id", bookingIds)
    .order("created_at", { ascending: true });

  // 6. Wangshi Invoices (1 row)
  const { data: invoices } = await supabase
    .from("invoices")
    .select("*")
    .eq("homestay_id", WANGSHI_ID);

  const invoiceIds = invoices.map(i => i.id);

  // 7. Wangshi Invoice Items (3 rows)
  const { data: invoiceItems } = await supabase
    .from("invoice_items")
    .select("*")
    .in("invoice_id", invoiceIds)
    .order("sort_order", { ascending: true });

  // 8. Wangshi Payments (2 rows)
  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("homestay_id", WANGSHI_ID)
    .order("created_at", { ascending: true });

  // 9. Booking Requests check
  const { data: wangshiRequests } = await supabase
    .from("booking_requests")
    .select("*")
    .eq("homestay_id", WANGSHI_ID);

  const { data: allRequests } = await supabase
    .from("booking_requests")
    .select("*");

  const snapshot = {
    captured_at: new Date().toISOString(),
    homestay,
    rooms,
    partners,
    bookings,
    guests,
    invoices,
    invoiceItems,
    payments,
    wangshiRequests,
    allRequests
  };

  fs.writeFileSync(
    path.resolve(process.cwd(), "scripts/production_raw_snapshot.json"),
    JSON.stringify(snapshot, null, 2),
    "utf8"
  );

  console.log("Captured successfully:");
  console.log("- Rooms:", rooms.length);
  console.log("- Partners:", partners.length);
  console.log("- Bookings:", bookings.length);
  console.log("- Guests:", guests.length);
  console.log("- Invoices:", invoices.length);
  console.log("- Invoice Items:", invoiceItems.length);
  console.log("- Payments:", payments.length);
  console.log("- Wangshi Booking Requests:", wangshiRequests.length);
  console.log("- Global Booking Requests:", allRequests.length);
}

capture().catch(console.error);

