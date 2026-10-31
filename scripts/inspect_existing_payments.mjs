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
  console.log(JSON.stringify({ status: "MISSING_ENV" }));
  process.exit(0);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  try {
    // 1. Check if payments table exists by querying 0 rows
    const { data, error } = await supabase.from("payments").select("*").limit(1);
    
    if (error) {
      if (error.code === '42P01' || error.message.includes('relation "public.payments" does not exist') || error.message.includes('relation "payments" does not exist')) {
        console.log(JSON.stringify({ 
          exists: false, 
          message: "The payments table does NOT exist in the database yet. It will be created fresh by the migration." 
        }));
        return;
      }
      console.log(JSON.stringify({ exists: "error", error: error.message, code: error.code }));
      return;
    }

    // If data is returned (even empty array), table exists!
    console.log(JSON.stringify({ 
      exists: true, 
      rowCount: data ? data.length : 0,
      columnsFound: data && data.length > 0 ? Object.keys(data[0]) : "table_empty_schema_present"
    }));

  } catch (err) {
    console.log(JSON.stringify({ exists: "exception", error: err.message }));
  }
}

inspect();
