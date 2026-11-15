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

const candidateTables = [
  "homestays",
  "rooms",
  "partners",
  "bookings",
  "guests",
  "invoices",
  "invoice_items",
  "payments",
  "booking_requests",
  "settings",
  "homestay_settings",
  "maintenance",
  "room_maintenance",
  "audit_logs",
  "activity_logs",
  "logs",
  "profiles",
  "guest_documents",
  "kyc_documents",
  "notifications",
  "expenses",
  "bills"
];

async function scanTables() {
  console.log("Scanning potential tables in public schema...\n");
  for (const tbl of candidateTables) {
    const { data, count, error } = await supabase
      .from(tbl)
      .select("*", { count: "exact" })
      .limit(1);

    if (error) {
      if (error.code === "42P01" || error.message.includes("does not exist") || error.message.includes("Could not find the table")) {
        // Does not exist
      } else {
        console.log(`Table '${tbl}': Error (${error.code}) - ${error.message}`);
      }
    } else {
      console.log(`Table '${tbl}': EXISTS, total rows = ${count}, columns = ${data.length > 0 ? Object.keys(data[0]).join(", ") : "(empty table)"}`);
    }
  }
}

scanTables().catch(console.error);

