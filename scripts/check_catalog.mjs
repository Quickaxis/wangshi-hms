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

async function checkCatalog() {
  // Test if we can query information_schema or pg_catalog via REST
  const { data, error } = await supabase.from("pg_tables").select("*").limit(5);
  console.log("pg_tables query:", { data, error: error?.message });
}

checkCatalog().catch(console.error);

