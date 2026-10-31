/**
 * SAFE STAGING-ONLY AUTH & PARTNER RESTORATION SCRIPT
 * 
 * TARGET: STAGING ONLY (vlynqvbmzjyejxnzanrc)
 * NEVER EXECUTES AGAINST PRODUCTION (algorrnjotffcvtinbyy)
 * 
 * Recreates the 8 production Auth users in staging using the official
 * Supabase Auth Admin API (createUser/updateUserById), preserving:
 * - Production Auth UUIDs (supported by GoTrue Admin API) with fallback to generated UUIDs
 * - Existing passwords where known (unmesh, riya, octavium)
 * - Safe initial passwords for other partners
 * - Existing staging partner records (retains partner IDs, rooms, bookings, payments)
 * - Correct multi-tenant homestay assignments
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const PROD_REF = "algorrnjotffcvtinbyy";
const STAGING_REF = "vlynqvbmzjyejxnzanrc";

// 1. Resolve Staging Credentials with Strict Multi-Layer Safety Halts
function getStagingCredentials() {
  let stagingUrl = process.env.STAGING_SUPABASE_URL;
  let serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;

  if (!stagingUrl || !serviceKey) {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const val = match[2].trim().replace(/^['"]|['"]$/g, '');
          if (key === 'STAGING_SUPABASE_URL') stagingUrl = val;
          if (key === 'STAGING_SUPABASE_SERVICE_ROLE_KEY') serviceKey = val;
          if (key === 'NEXT_PUBLIC_SUPABASE_URL' && val.includes(STAGING_REF)) stagingUrl = val;
          // Only pick SUPABASE_SERVICE_ROLE_KEY if it's not the known production key
          if (key === 'SUPABASE_SERVICE_ROLE_KEY' && !val.startsWith('sb_secret_Mpsl')) {
            serviceKey = val;
          }
        }
      }
    }
  }

  // HARD SAFETY HALTS
  if (!stagingUrl) {
    throw new Error("⛔ SAFETY HALT: Staging URL is not configured.");
  }
  if (stagingUrl.includes(PROD_REF)) {
    throw new Error(`⛔ HARD SAFETY HALT: Targeted URL contains PRODUCTION project reference (${PROD_REF})! Aborting immediately.`);
  }
  if (!stagingUrl.includes(STAGING_REF)) {
    throw new Error(`⛔ HARD SAFETY HALT: URL does not match staging reference (${STAGING_REF}). Got: ${stagingUrl}`);
  }
  if (!serviceKey) {
    throw new Error("⛔ SAFETY HALT: Missing staging SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local as STAGING_SUPABASE_SERVICE_ROLE_KEY.");
  }

  // Validate Service Key target project if it's a JWT
  if (serviceKey.includes('.')) {
    try {
      const parts = serviceKey.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload.ref && payload.ref !== STAGING_REF) {
          throw new Error(`⛔ HARD SAFETY HALT: Service key token ref (${payload.ref}) does NOT match staging reference (${STAGING_REF})! Aborting.`);
        }
      }
    } catch (jwtErr) {
      if (jwtErr.message.includes("HARD SAFETY HALT")) throw jwtErr;
      // If parsing fails for non-critical reason, proceed
    }
  }

  return { stagingUrl, serviceKey };
}

// 2. The 8 Accounts to Restore (Extracted from backups/prod_backup_auth_data.sql & prod_backup_public_data.sql)
const ACCOUNTS_TO_RESTORE = [
  {
    id: "d6e78839-c04e-4e58-b4c5-568e1f36cfe6",
    email: "ugmarketing01@gmail.com",
    name: "UG Marketing",
    password: "unmesh", // Known from scripts/set_partner_passwords.ts
    role: "super_admin",
    homestayName: "Wangshi Homestay",
    isPrimaryAdmin: true,
  },
  {
    id: "defa3b69-7698-41bf-80df-2e2b03128659",
    email: "riyasharma2003121@gmail.com",
    name: "Riya Sharma",
    password: "riya", // Known from scripts/set_partner_passwords.ts
    role: "partner",
    homestayName: "Wangshi Homestay",
  },
  {
    id: "df0346d4-74c6-4f2f-8086-cab6ffc92c4e",
    email: "devchuchi1234@gmail.com",
    name: "DEV chuchi",
    password: "Staging@Wangshi2026!",
    role: "partner",
    homestayName: "Wangshi Homestay",
  },
  {
    id: "d620720a-b8ca-4fe2-8cc8-c7f6bc800192",
    email: "bbidyut834@gmail.com",
    name: "BIDYUT BORAH",
    password: "Staging@Wangshi2026!",
    role: "partner",
    homestayName: "THE CONCLAVE — LODGING AND HOMESTAY",
  },
  {
    id: "7661c34a-462d-4f5a-926d-26b01a7bb2dc",
    email: "ashokneog85@gmail.com",
    name: "ASHOK KUMAR NEOG ",
    password: "Staging@Wangshi2026!",
    role: "partner",
    homestayName: "Junu Tora Homestay",
  },
  {
    id: "bc4df4ad-8a5e-46a2-9366-3a3393c99e0b",
    email: "ramyajyotisonowal1991@gmail.com",
    name: "Ramya Jyoti Sonowal ",
    password: "Staging@Wangshi2026!",
    role: "partner",
    homestayName: "Junu Tora Homestay",
  },
  {
    id: "1ae93fc5-e369-4af9-8ade-ccaf63a42de9",
    email: "jackie123@gmail.com",
    name: "jackie",
    password: "Staging@Wangshi2026!",
    role: "partner",
    homestayName: "OPEN DOOR HOMESTAY",
  },
  {
    id: "b3b11589-8e16-4f6f-be03-423662433daa",
    email: "octavium@4gmail.com", // Exact production auth email from prod_backup_auth_data.sql
    name: "OCTAVIUM ",
    password: "octavium", // Known from scripts/set_partner_passwords.ts
    role: "partner",
    homestayName: "White house homestay",
  },
];

// Homestays to Ensure in Staging
const REQUIRED_HOMESTAYS = [
  { name: "Wangshi Homestay", slug: "wangshi-homestay", location: "Shergaon, Arunachal Pradesh", is_active: true },
  { name: "THE CONCLAVE — LODGING AND HOMESTAY", slug: "the-conclave", location: "Khanikar, Dibrugarh, Assam", is_active: true },
  { name: "Junu Tora Homestay", slug: "junu-tora-homestay", location: "Dibrugarh Thakurthan", is_active: true },
  { name: "OPEN DOOR HOMESTAY", slug: "open-door-homestay", location: "Naliapool", is_active: true },
  { name: "White house homestay", slug: "white-house-homestay", location: "Dibrugarh", is_active: false },
];

export async function executeStagingRestoration() {
  console.log("=================================================================");
  console.log("  STAGING AUTH & PARTNER RESTORATION (vlynqvbmzjyejxnzanrc)       ");
  console.log("=================================================================\n");

  const { stagingUrl, serviceKey } = getStagingCredentials();
  console.log(`[TARGET PROJECT] ${stagingUrl} (Verified Staging)`);
  console.log(`[SAFETY CHECK]   Production (${PROD_REF}) completely isolated.\n`);

  const adminClient = createClient(stagingUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const summary = {
    homestaysCreated: 0,
    homestaysExisting: 0,
    authUsersCreated: 0,
    authUsersUpdated: 0,
    partnersCreated: 0,
    partnersUpdated: 0,
    errors: [],
  };

  // STEP 1: Verify / Insert Required Homestays
  console.log("--- STEP 1: Aligning Homestays ---");
  const homestayMap = new Map(); // name -> id

  for (const hs of REQUIRED_HOMESTAYS) {
    try {
      const { data: existing } = await adminClient
        .from("homestays")
        .select("id, name")
        .eq("name", hs.name)
        .maybeSingle();

      if (existing) {
        homestayMap.set(hs.name, existing.id);
        summary.homestaysExisting++;
        console.log(`  ✓ Homestay exists: "${hs.name}" (${existing.id})`);
      } else {
        const { data: inserted, error: insertErr } = await adminClient
          .from("homestays")
          .insert(hs)
          .select("id, name")
          .single();

        if (insertErr || !inserted) {
          throw new Error(`Failed to insert homestay "${hs.name}": ${insertErr?.message}`);
        }
        homestayMap.set(hs.name, inserted.id);
        summary.homestaysCreated++;
        console.log(`  + Created missing homestay: "${hs.name}" (${inserted.id})`);
      }
    } catch (hsErr) {
      summary.errors.push(`Homestay "${hs.name}": ${hsErr.message}`);
      console.error(`  ❌ Homestay Error ("${hs.name}"): ${hsErr.message}`);
    }
  }

  // STEP 2: Restore Auth Users via Supabase Auth Admin API
  console.log("\n--- STEP 2: Restoring Auth Accounts via GoTrue Admin API ---");
  const { data: { users: existingUsers }, error: listUsersErr } = await adminClient.auth.admin.listUsers();
  if (listUsersErr) throw new Error(`Failed to list existing auth users: ${listUsersErr.message}`);

  const userMap = new Map(); // email -> actual auth_user_id assigned by GoTrue

  for (const acc of ACCOUNTS_TO_RESTORE) {
    try {
      const existing = existingUsers.find(u => u.email?.toLowerCase() === acc.email.toLowerCase());

      if (existing) {
        // Update password & confirm email
        const { error: updateErr } = await adminClient.auth.admin.updateUserById(existing.id, {
          password: acc.password,
          email_confirm: true,
          user_metadata: { name: acc.name, email_verified: true },
        });

        if (updateErr) {
          summary.errors.push(`Auth User ${acc.email} update: ${updateErr.message}`);
          console.warn(`  ⚠️ Failed to update existing user ${acc.email}: ${updateErr.message}`);
        } else {
          summary.authUsersUpdated++;
          console.log(`  ✓ Updated existing Auth user: ${acc.email} (ID: ${existing.id})`);
        }
        userMap.set(acc.email, existing.id);
      } else {
        // Create user with explicit ID (GoTrue Admin API supports 'id' in AdminUserAttributes)
        const attributes = {
          id: acc.id,
          email: acc.email,
          password: acc.password,
          email_confirm: true,
          user_metadata: { name: acc.name, email_verified: true },
        };

        const { data: created, error: createErr } = await adminClient.auth.admin.createUser(attributes);

        if (createErr || !created?.user) {
          summary.errors.push(`Auth User ${acc.email} creation: ${createErr?.message}`);
          console.error(`  ❌ Failed to create Auth user ${acc.email}: ${createErr?.message}`);
        } else {
          summary.authUsersCreated++;
          const uuidPreserved = created.user.id === acc.id;
          console.log(`  + Created Auth user: ${acc.email} (ID: ${created.user.id}) [UUID Preserved: ${uuidPreserved ? 'YES' : 'NO'}]`);
          userMap.set(acc.email, created.user.id);
        }
      }
    } catch (accErr) {
      summary.errors.push(`Auth User ${acc.email}: ${accErr.message}`);
      console.error(`  ❌ Auth User Error (${acc.email}): ${accErr.message}`);
    }
  }

  // STEP 3: Non-Destructive Reconciliation of public.partners
  console.log("\n--- STEP 3: Reconciling public.partners (Preserving Business Records) ---");
  for (const acc of ACCOUNTS_TO_RESTORE) {
    try {
      const authUserId = userMap.get(acc.email);
      if (!authUserId) {
        console.warn(`  ⚠️ Skipping partner update for ${acc.email}: no active Auth user ID.`);
        continue;
      }

      const homestayId = homestayMap.get(acc.homestayName);

      const { data: existingPartner } = await adminClient
        .from("partners")
        .select("id, email, name, role, is_active, homestay_id, auth_user_id")
        .eq("email", acc.email)
        .maybeSingle();

      if (existingPartner) {
        // Non-destructive update: preserves existingPartner.id so foreign keys in bookings/payments are unaffected
        const { error: updateErr } = await adminClient
          .from("partners")
          .update({
            auth_user_id: authUserId,
            role: acc.role,
            is_active: true,
            homestay_id: homestayId || existingPartner.homestay_id,
          })
          .eq("id", existingPartner.id);

        if (updateErr) {
          summary.errors.push(`Partner ${acc.email} update: ${updateErr.message}`);
          console.warn(`  ⚠️ Could not update partner ${acc.email}: ${updateErr.message}`);
        } else {
          summary.partnersUpdated++;
          console.log(`  ✓ Reconciled partner ${acc.email}: linked to Auth UUID ${authUserId} (Partner PK preserved: ${existingPartner.id})`);
        }
      } else {
        // Insert new partner
        const { data: insertedPartner, error: insertErr } = await adminClient
          .from("partners")
          .insert({
            name: acc.name,
            email: acc.email,
            role: acc.role,
            is_active: true,
            homestay_id: homestayId,
            auth_user_id: authUserId,
          })
          .select("id")
          .single();

        if (insertErr) {
          summary.errors.push(`Partner ${acc.email} insertion: ${insertErr.message}`);
          console.warn(`  ⚠️ Could not insert partner ${acc.email}: ${insertErr.message}`);
        } else {
          summary.partnersCreated++;
          console.log(`  + Inserted missing partner: ${acc.email} (Partner PK: ${insertedPartner?.id})`);
        }
      }
    } catch (partErr) {
      summary.errors.push(`Partner ${acc.email}: ${partErr.message}`);
      console.error(`  ❌ Partner Error (${acc.email}): ${partErr.message}`);
    }
  }

  console.log("\n=================================================================");
  console.log("  RESTORATION EXECUTION SUMMARY                                  ");
  console.log("=================================================================");
  console.log(`  Homestays Existing:   ${summary.homestaysExisting}`);
  console.log(`  Homestays Created:    ${summary.homestaysCreated}`);
  console.log(`  Auth Users Existing:  ${summary.authUsersUpdated}`);
  console.log(`  Auth Users Created:   ${summary.authUsersCreated}`);
  console.log(`  Partners Reconciled:  ${summary.partnersUpdated}`);
  console.log(`  Partners Created:     ${summary.partnersCreated}`);
  console.log(`  Errors Encountered:   ${summary.errors.length}`);
  if (summary.errors.length > 0) {
    console.log("  Error Details:");
    summary.errors.forEach(e => console.log(`    - ${e}`));
  }
  console.log("=================================================================\n");
}

if (process.argv[1]?.endsWith("restore_staging_auth_partners.mjs")) {
  executeStagingRestoration().catch(err => {
    console.error("Restoration failed with uncaught exception:", err.message);
    process.exit(1);
  });
}
