/**
 * ==============================================================================
 * STAGING VERIFICATION SUITE: HARDENED LEGACY BOOKING COMPATIBILITY TRIGGER
 * ==============================================================================
 * STRICT DIRECTIVE:
 * - TARGETS ONLY STAGING SUPABASE (vlynqvbmzjyejxnzanrc).
 * - FAILS CLOSED UNCONDITIONALLY IF PRODUCTION (algorrnjotffcvtinbyy) IS DETECTED.
 * - USES GENUINE STAGING IDENTITIES (Partner Alpha, Partner Beta, Unregistered User).
 * - ASSERTS PERSISTED DATABASE AUDITS ON BOTH SUCCESS AND REJECTION PATHS:
 *   * TRG-01: Canonical 7-arg RPC creates booking with guest details (Persisted Audit)
 *   * TRG-02: Canonical 7-arg RPC blocks cross-tenant booking attempts (Zero Rows Persisted)
 *   * TRG-03: Canonical 7-arg RPC enforces overlap protection (Zero Rows Persisted)
 *   * TRG-04: Legacy 8-arg RPC creates booking and trigger infers homestay_id (Persisted Audit)
 *   * TRG-05: Legacy 8-arg RPC blocks cross-tenant booking attempts (Zero Rows Persisted)
 *   * TRG-06: Legacy 8-arg RPC enforces overlap protection (Zero Rows Persisted)
 *   * TRG-07: Direct insert with tenant mismatch rejected (Zero Rows Persisted)
 *   * TRG-08: Direct insert with missing/invalid room rejected (Zero Rows Persisted)
 *   * TRG-09: Authenticated caller without active partner profile rejected (Zero Rows Persisted)
 *   * TRG-10: Phase 1 payment lifecycle and ledger math on legacy booking (Ledger Audit)
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "fs";
import path from "path";

function getStagingConfig() {
  const stagingUrl = process.env.STAGING_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const stagingServiceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stagingAnonKey = process.env.STAGING_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const PROD_PROJECT_REF = "algorrnjotffcvtinbyy";

  if (!stagingUrl || !stagingServiceKey || !stagingAnonKey) {
    return {
      configured: false,
      reason: "Missing required staging environment variables: STAGING_SUPABASE_URL, STAGING_SUPABASE_SERVICE_ROLE_KEY, STAGING_SUPABASE_ANON_KEY"
    };
  }

  if (stagingUrl.includes(PROD_PROJECT_REF)) {
    throw new Error("⛔ HARD SAFETY HALT: Configuration points to PRODUCTION Supabase project (algorrnjotffcvtinbyy)! Execution aborted.");
  }

  if (!stagingUrl.includes("vlynqvbmzjyejxnzanrc")) {
    throw new Error(`⛔ HARD SAFETY HALT: Expected staging reference 'vlynqvbmzjyejxnzanrc', got: ${stagingUrl}`);
  }

  return {
    configured: true,
    stagingUrl,
    stagingServiceKey,
    stagingAnonKey
  };
}

function saveManifest(runId, stack) {
  const scratchDir = path.resolve(process.cwd(), "scratch");
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }
  const manifestPath = path.join(scratchDir, `staging_manifest_compat_${runId}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(stack, null, 2), "utf8");
  return manifestPath;
}

async function safeDeleteFixture(adminClient, table, id) {
  try {
    const { error } = await adminClient.from(table).delete().eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

const PROTECTED_REAL_EMAILS = new Set([
  'ugmarketing01@gmail.com',
  'riyasharma2003121@gmail.com',
  'devchuchi1234@gmail.com',
  'bbidyut834@gmail.com',
  'ashokneog85@gmail.com',
  'ramyajyotisonowal1991@gmail.com',
  'jackie123@gmail.com',
  'octavium@4gmail.com',
  'octavium4@gmail.com'
]);

async function safeDeleteAuthUser(adminClient, uid) {
  try {
    const { data: { user }, error: fetchErr } = await adminClient.auth.admin.getUserById(uid);
    if (fetchErr || !user) return { success: true };

    if (user.email && PROTECTED_REAL_EMAILS.has(user.email.toLowerCase().trim())) {
      console.warn(`🛡️ SAFETY SHIELD: Refusing to delete protected real account ${user.email} (${uid})`);
      return { success: false, error: "Deletion of protected real account blocked" };
    }

    const email = (user.email || "").toLowerCase();
    const isSynthetic = email.includes("@staging.test") || email.includes("@test-staging.com") || email.includes(".test");
    if (!isSynthetic) {
      console.warn(`🛡️ SAFETY SHIELD: Refusing to delete non-synthetic account ${email} (${uid})`);
      return { success: false, error: "Deletion of non-synthetic account blocked" };
    }

    const { error } = await adminClient.auth.admin.deleteUser(uid);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function runCompatibilitySuite() {
  console.log("=================================================================");
  console.log("  STAGING VERIFICATION: HARDENED BOOKING COMPATIBILITY TRIGGER   ");
  console.log("=================================================================\n");

  const config = getStagingConfig();

  if (!config.configured) {
    console.warn(`🛡️  EXECUTION BLOCKED: ${config.reason}\n`);
    const blockedSummary = [
      { id: "TRG-01", name: "Canonical 7-arg Booking with Guests (Persisted Audit)", status: "BLOCKED", discrepancy: config.reason },
      { id: "TRG-02", name: "Canonical 7-arg Cross-Tenant Block (Zero Rows Persisted)", status: "BLOCKED", discrepancy: config.reason },
      { id: "TRG-03", name: "Canonical 7-arg Overlap Protection (Zero Rows Persisted)", status: "BLOCKED", discrepancy: config.reason },
      { id: "TRG-04", name: "Legacy 8-arg Booking Homestay Inference (Persisted Audit)", status: "BLOCKED", discrepancy: config.reason },
      { id: "TRG-05", name: "Legacy 8-arg Cross-Tenant Block (Zero Rows Persisted)", status: "BLOCKED", discrepancy: config.reason },
      { id: "TRG-06", name: "Legacy 8-arg Overlap Protection (Zero Rows Persisted)", status: "BLOCKED", discrepancy: config.reason },
      { id: "TRG-07", name: "Direct Insert Tenant Mismatch Rejection (Zero Rows Persisted)", status: "BLOCKED", discrepancy: config.reason },
      { id: "TRG-08", name: "Direct Insert Missing Room Rejection (Zero Rows Persisted)", status: "BLOCKED", discrepancy: config.reason },
      { id: "TRG-09", name: "Unregistered Authenticated Caller Rejection (Zero Rows Persisted)", status: "BLOCKED", discrepancy: config.reason },
      { id: "TRG-10", name: "Phase 1 Payment Flow & Ledger Math on Legacy Booking", status: "BLOCKED", discrepancy: config.reason },
    ];
    console.table(blockedSummary);
    console.log("\n⚠️ Production remained completely untouched.\n");
    return { status: "BLOCKED", results: blockedSummary };
  }

  console.log("🚀 Staging credentials verified (vlynqvbmzjyejxnzanrc).");
  console.log("Initializing hardened compatibility verification suite...\n");

  const adminClient = createClient(config.stagingUrl, config.stagingServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const testRunId = crypto.randomUUID().slice(0, 8);
  const testPassword = `Compat_${testRunId}!_${crypto.randomUUID().slice(0, 6)}`;

  const cleanupStack = {
    runId: testRunId,
    timestamp: new Date().toISOString(),
    targetUrl: config.stagingUrl,
    payments: [],
    bookings: [],
    rooms: [],
    partners: [],
    homestays: [],
    authUsers: []
  };

  const manifestPath = saveManifest(testRunId, cleanupStack);
  console.log(`[MANIFEST] Recovery manifest initialized: ${manifestPath}\n`);

  const results = [];
  let suiteError = null;

  try {
    // -----------------------------------------------------------------
    // SETUP: Provision genuine synthetic tenants, partners, and users
    // -----------------------------------------------------------------
    console.log(`[SETUP] Provisioning synthetic test fixtures (Run ID: ${testRunId})...`);

    // 1. Homestays
    const { data: hsAlpha, error: hsAlphaErr } = await adminClient
      .from("homestays")
      .insert({ name: `Compat Alpha ${testRunId}`, slug: `c-alpha-${testRunId}`, is_active: true })
      .select("id, name").single();
    if (hsAlphaErr || !hsAlpha) throw new Error(`Setup failed (HS Alpha): ${hsAlphaErr?.message}`);
    cleanupStack.homestays.push(hsAlpha.id);

    const { data: hsBeta, error: hsBetaErr } = await adminClient
      .from("homestays")
      .insert({ name: `Compat Beta ${testRunId}`, slug: `c-beta-${testRunId}`, is_active: true })
      .select("id, name").single();
    if (hsBetaErr || !hsBeta) throw new Error(`Setup failed (HS Beta): ${hsBetaErr?.message}`);
    cleanupStack.homestays.push(hsBeta.id);

    // 2. Auth Users (Genuine Supabase Auth accounts)
    const emailAlpha = `c.partner.alpha.${testRunId}@staging.test`;
    const { data: authAlpha, error: authAlphaErr } = await adminClient.auth.admin.createUser({
      email: emailAlpha,
      password: testPassword,
      email_confirm: true
    });
    if (authAlphaErr || !authAlpha?.user) throw new Error(`Setup failed (Auth Alpha): ${authAlphaErr?.message}`);
    cleanupStack.authUsers.push(authAlpha.user.id);

    const emailBeta = `c.partner.beta.${testRunId}@staging.test`;
    const { data: authBeta, error: authBetaErr } = await adminClient.auth.admin.createUser({
      email: emailBeta,
      password: testPassword,
      email_confirm: true
    });
    if (authBetaErr || !authBeta?.user) throw new Error(`Setup failed (Auth Beta): ${authBetaErr?.message}`);
    cleanupStack.authUsers.push(authBeta.user.id);

    // Unregistered Authenticated User: has valid Supabase Auth session but zero partner profile
    const emailUnregistered = `c.user.unregistered.${testRunId}@staging.test`;
    const { data: authUnreg, error: authUnregErr } = await adminClient.auth.admin.createUser({
      email: emailUnregistered,
      password: testPassword,
      email_confirm: true
    });
    if (authUnregErr || !authUnreg?.user) throw new Error(`Setup failed (Auth Unreg): ${authUnregErr?.message}`);
    cleanupStack.authUsers.push(authUnreg.user.id);

    // 3. Partners
    const { data: partnerAlpha, error: partnerAlphaErr } = await adminClient
      .from("partners")
      .insert({
        name: `Partner Alpha ${testRunId}`,
        email: emailAlpha,
        homestay_id: hsAlpha.id,
        auth_user_id: authAlpha.user.id,
        role: "partner",
        is_active: true
      })
      .select("id, name, homestay_id").single();
    if (partnerAlphaErr || !partnerAlpha) throw new Error(`Setup failed (Partner Alpha): ${partnerAlphaErr?.message}`);
    cleanupStack.partners.push(partnerAlpha.id);

    const { data: partnerBeta, error: partnerBetaErr } = await adminClient
      .from("partners")
      .insert({
        name: `Partner Beta ${testRunId}`,
        email: emailBeta,
        homestay_id: hsBeta.id,
        auth_user_id: authBeta.user.id,
        role: "partner",
        is_active: true
      })
      .select("id, name, homestay_id").single();
    if (partnerBetaErr || !partnerBeta) throw new Error(`Setup failed (Partner Beta): ${partnerBetaErr?.message}`);
    cleanupStack.partners.push(partnerBeta.id);

    // 4. Rooms
    const { data: roomAlpha, error: roomAlphaErr } = await adminClient
      .from("rooms")
      .insert({
        room_number: `TRG-A-${testRunId}`,
        name: `Room Alpha ${testRunId}`,
        homestay_id: hsAlpha.id,
        nightly_rate: 4000,
        max_guests: 4,
        is_active: true
      })
      .select("id, name, nightly_rate, homestay_id").single();
    if (roomAlphaErr || !roomAlpha) throw new Error(`Setup failed (Room Alpha): ${roomAlphaErr?.message}`);
    cleanupStack.rooms.push(roomAlpha.id);

    const { data: roomBeta, error: roomBetaErr } = await adminClient
      .from("rooms")
      .insert({
        room_number: `TRG-B-${testRunId}`,
        name: `Room Beta ${testRunId}`,
        homestay_id: hsBeta.id,
        nightly_rate: 3500,
        max_guests: 3,
        is_active: true
      })
      .select("id, name, nightly_rate, homestay_id").single();
    if (roomBetaErr || !roomBeta) throw new Error(`Setup failed (Room Beta): ${roomBetaErr?.message}`);
    cleanupStack.rooms.push(roomBeta.id);
    saveManifest(testRunId, cleanupStack);

    // 5. Authenticate Genuine Client Sessions
    const clientAlpha = createClient(config.stagingUrl, config.stagingAnonKey);
    const { error: loginAlphaErr } = await clientAlpha.auth.signInWithPassword({
      email: emailAlpha,
      password: testPassword
    });
    if (loginAlphaErr) throw new Error(`Login Alpha failed: ${loginAlphaErr.message}`);

    const clientBeta = createClient(config.stagingUrl, config.stagingAnonKey);
    const { error: loginBetaErr } = await clientBeta.auth.signInWithPassword({
      email: emailBeta,
      password: testPassword
    });
    if (loginBetaErr) throw new Error(`Login Beta failed: ${loginBetaErr.message}`);

    const clientUnregistered = createClient(config.stagingUrl, config.stagingAnonKey);
    const { error: loginUnregErr } = await clientUnregistered.auth.signInWithPassword({
      email: emailUnregistered,
      password: testPassword
    });
    if (loginUnregErr) throw new Error(`Login Unregistered failed: ${loginUnregErr.message}`);

    console.log("✅ Authenticated genuine partner sessions for Alpha, Beta, and Unregistered.\n");

    // -----------------------------------------------------------------
    // TEST TRG-01: Canonical 7-arg RPC Creates Booking with Guests
    // -----------------------------------------------------------------
    let canonicalBookingId = null;
    try {
      const { data: b7Id, error: b7Err } = await clientAlpha.rpc("create_booking_atomic", {
        p_room_id: roomAlpha.id,
        p_partner_id: partnerAlpha.id,
        p_check_in: "2027-08-01",
        p_check_out: "2027-08-04",
        p_number_of_guests: 2,
        p_notes: "Canonical 7-arg test",
        p_guests: [
          { name: "Primary Guest 7", is_primary: true, phone: "9876500001" },
          { name: "Secondary Guest 7", is_primary: false, phone: "9876500002" }
        ]
      });

      if (b7Err || !b7Id) {
        throw new Error(`Canonical RPC failed: ${b7Err?.message} (code ${b7Err?.code})`);
      }
      canonicalBookingId = b7Id;
      cleanupStack.bookings.push(b7Id);
      saveManifest(testRunId, cleanupStack);

      // Persisted Audit: Query database to confirm row exists with matching homestay_id and rate
      const { data: b7Row, error: b7RowErr } = await adminClient
        .from("bookings")
        .select("id, homestay_id, total_amount, nightly_rate")
        .eq("id", b7Id).single();
      if (b7RowErr || !b7Row) throw new Error(`Failed to fetch created booking: ${b7RowErr?.message}`);
      if (b7Row.homestay_id !== hsAlpha.id) {
        throw new Error(`Homestay ID mismatch: expected ${hsAlpha.id}, got ${b7Row.homestay_id}`);
      }
      if (Number(b7Row.total_amount) !== 12000) { // 4000 * 3
        throw new Error(`Total amount mismatch: expected 12000, got ${b7Row.total_amount}`);
      }

      // Audit guests table
      const { data: guestsRow, error: guestsErr } = await adminClient
        .from("guests")
        .select("id, homestay_id")
        .eq("booking_id", b7Id);
      if (guestsErr || !guestsRow || guestsRow.length !== 2) {
        throw new Error(`Guests audit mismatch: expected 2 rows, found ${guestsRow?.length}`);
      }
      if (guestsRow[0].homestay_id !== hsAlpha.id || guestsRow[1].homestay_id !== hsAlpha.id) {
        throw new Error("Guest rows did not inherit room homestay_id!");
      }

      results.push({ id: "TRG-01", name: "Canonical 7-arg Booking with Guests (Persisted Audit)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "TRG-01", name: "Canonical 7-arg Booking with Guests (Persisted Audit)", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST TRG-02: Canonical 7-arg RPC Rejects Cross-Tenant Booking
    // -----------------------------------------------------------------
    try {
      // Partner Beta attempts to book Room Alpha (which belongs to Homestay Alpha)
      const crossNotes = `Cross tenant attempt 7-arg ${testRunId}`;
      const { data: leakB7, error: leakB7Err } = await clientBeta.rpc("create_booking_atomic", {
        p_room_id: roomAlpha.id, // Room Alpha belongs to HS Alpha
        p_partner_id: partnerBeta.id,
        p_check_in: "2027-08-10",
        p_check_out: "2027-08-12",
        p_number_of_guests: 1,
        p_notes: crossNotes,
        p_guests: []
      });

      if (!leakB7Err) {
        if (leakB7) cleanupStack.bookings.push(leakB7);
        throw new Error("SECURITY BREACH: Partner Beta successfully booked Room Alpha via canonical RPC!");
      }

      if (!leakB7Err.message.includes("UNAUTHORIZED")) {
        throw new Error(`Expected UNAUTHORIZED rejection, got: ${leakB7Err.message}`);
      }

      // Persisted Audit: Verify zero rows were saved in database
      const { data: leakAudit } = await adminClient
        .from("bookings")
        .select("id")
        .eq("notes", crossNotes);
      if (leakAudit && leakAudit.length > 0) {
        for (const b of leakAudit) cleanupStack.bookings.push(b.id);
        throw new Error("PERSISTENCE VULNERABILITY: Cross-tenant booking row exists despite error!");
      }

      results.push({ id: "TRG-02", name: "Canonical 7-arg Cross-Tenant Block (Zero Rows Persisted)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "TRG-02", name: "Canonical 7-arg Cross-Tenant Block (Zero Rows Persisted)", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST TRG-03: Canonical 7-arg RPC Enforces Overlap Protection
    // -----------------------------------------------------------------
    try {
      const overlapNotes = `Overlap attempt 7-arg ${testRunId}`;
      const { data: overlapB7, error: overlapB7Err } = await clientAlpha.rpc("create_booking_atomic", {
        p_room_id: roomAlpha.id,
        p_partner_id: partnerAlpha.id,
        p_check_in: "2027-08-02", // Overlaps TRG-01 booking (08-01 to 08-04)
        p_check_out: "2027-08-05",
        p_number_of_guests: 2,
        p_notes: overlapNotes,
        p_guests: []
      });

      if (!overlapB7Err) {
        if (overlapB7) cleanupStack.bookings.push(overlapB7);
        throw new Error("INTEGRITY BREACH: Overlapping booking was accepted by canonical RPC!");
      }

      if (!overlapB7Err.message.includes("ROOM_UNAVAILABLE")) {
        throw new Error(`Expected ROOM_UNAVAILABLE, got: ${overlapB7Err.message}`);
      }

      // Persisted Audit: Verify zero overlapping rows were saved
      const { data: overlapAudit } = await adminClient
        .from("bookings")
        .select("id")
        .eq("notes", overlapNotes);
      if (overlapAudit && overlapAudit.length > 0) {
        for (const b of overlapAudit) cleanupStack.bookings.push(b.id);
        throw new Error("PERSISTENCE VULNERABILITY: Overlapping booking row exists despite error!");
      }

      results.push({ id: "TRG-03", name: "Canonical 7-arg Overlap Protection (Zero Rows Persisted)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "TRG-03", name: "Canonical 7-arg Overlap Protection (Zero Rows Persisted)", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST TRG-04: Legacy 8-arg RPC & Trigger Inferences (Persisted Audit)
    // -----------------------------------------------------------------
    let legacyBookingId = null;
    try {
      const legacyNotes = `Legacy 8-arg test ${testRunId}`;
      const { data: b8Id, error: b8Err } = await clientAlpha.rpc("create_booking_atomic", {
        p_room_id: roomAlpha.id,
        p_partner_id: partnerAlpha.id,
        p_check_in: "2027-09-01",
        p_check_in_time: "14:00:00",
        p_check_out: "2027-09-03",
        p_check_out_time: "11:00:00",
        p_number_of_guests: 2,
        p_notes: legacyNotes
      });

      if (b8Err || !b8Id) {
        throw new Error(`Legacy 8-arg RPC failed: ${b8Err?.message} (code ${b8Err?.code})`);
      }
      legacyBookingId = b8Id;
      cleanupStack.bookings.push(b8Id);
      saveManifest(testRunId, cleanupStack);

      // Persisted Audit: Verify that homestay_id was populated and NOT NULL constraint was met
      const { data: b8Row, error: b8RowErr } = await adminClient
        .from("bookings")
        .select("id, homestay_id, nightly_rate, total_amount, check_in_time, check_out_time, status")
        .eq("id", b8Id).single();

      if (b8RowErr || !b8Row) throw new Error(`Failed to fetch legacy-created booking: ${b8RowErr?.message}`);
      if (!b8Row.homestay_id) {
        throw new Error("Trigger failed: homestay_id was not populated on legacy booking!");
      }
      if (b8Row.homestay_id !== hsAlpha.id) {
        throw new Error(`Trigger assigned wrong homestay_id: expected ${hsAlpha.id}, got ${b8Row.homestay_id}`);
      }
      if (Number(b8Row.total_amount) !== 8000) { // 4000 * 2 nights
        throw new Error(`Total amount mismatch: expected 8000, got ${b8Row.total_amount}`);
      }
      if (b8Row.status !== "confirmed") {
        throw new Error(`Status mismatch: expected confirmed, got ${b8Row.status}`);
      }

      results.push({ id: "TRG-04", name: "Legacy 8-arg Booking Homestay Inference (Persisted Audit)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "TRG-04", name: "Legacy 8-arg Booking Homestay Inference (Persisted Audit)", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST TRG-05: Legacy 8-arg RPC Rejects Cross-Tenant Attempt
    // -----------------------------------------------------------------
    try {
      // Partner Beta attempts to create booking on Room Alpha via legacy 8-arg RPC
      const crossLegacyNotes = `Cross tenant attempt 8-arg ${testRunId}`;
      const { data: leakB8, error: leakB8Err } = await clientBeta.rpc("create_booking_atomic", {
        p_room_id: roomAlpha.id, // Room Alpha belongs to HS Alpha
        p_partner_id: partnerBeta.id,
        p_check_in: "2027-09-10",
        p_check_in_time: "14:00:00",
        p_check_out: "2027-09-12",
        p_check_out_time: "11:00:00",
        p_number_of_guests: 1,
        p_notes: crossLegacyNotes
      });

      if (!leakB8Err) {
        if (leakB8) cleanupStack.bookings.push(leakB8);
        throw new Error("SECURITY BREACH: Partner Beta successfully booked Room Alpha via legacy 8-arg RPC!");
      }

      const isCrossTenantBlocked =
        leakB8Err.message?.includes("UNAUTHORIZED_CROSS_TENANT_BOOKING") ||
        leakB8Err.message?.includes("UNAUTHORIZED") ||
        leakB8Err.code === "42501";

      if (!isCrossTenantBlocked) {
        throw new Error(`Unexpected error type on cross-tenant 8-arg attempt: ${leakB8Err.message}`);
      }

      // Persisted Audit: Verify zero rows were saved in database
      const { data: leakAudit8 } = await adminClient
        .from("bookings")
        .select("id")
        .eq("notes", crossLegacyNotes);
      if (leakAudit8 && leakAudit8.length > 0) {
        for (const b of leakAudit8) cleanupStack.bookings.push(b.id);
        throw new Error("PERSISTENCE VULNERABILITY: Cross-tenant legacy booking row exists despite error!");
      }

      results.push({ id: "TRG-05", name: "Legacy 8-arg Cross-Tenant Block (Zero Rows Persisted)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "TRG-05", name: "Legacy 8-arg Cross-Tenant Block (Zero Rows Persisted)", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST TRG-06: Legacy 8-arg RPC Enforces Overlap Protection
    // -----------------------------------------------------------------
    try {
      const overlapLegacyNotes = `Overlap attempt 8-arg ${testRunId}`;
      const { data: overlapB8, error: overlapB8Err } = await clientAlpha.rpc("create_booking_atomic", {
        p_room_id: roomAlpha.id,
        p_partner_id: partnerAlpha.id,
        p_check_in: "2027-09-02", // Overlaps TRG-04 booking (09-01 to 09-03)
        p_check_in_time: "14:00:00",
        p_check_out: "2027-09-04",
        p_check_out_time: "11:00:00",
        p_number_of_guests: 2,
        p_notes: overlapLegacyNotes
      });

      if (!overlapB8Err) {
        if (overlapB8) cleanupStack.bookings.push(overlapB8);
        throw new Error("INTEGRITY BREACH: Overlapping booking was accepted by legacy 8-arg RPC!");
      }

      if (!overlapB8Err.message.includes("ROOM_UNAVAILABLE")) {
        throw new Error(`Expected ROOM_UNAVAILABLE, got: ${overlapB8Err.message}`);
      }

      // Persisted Audit: Verify zero rows were saved
      const { data: overlapAudit8 } = await adminClient
        .from("bookings")
        .select("id")
        .eq("notes", overlapLegacyNotes);
      if (overlapAudit8 && overlapAudit8.length > 0) {
        for (const b of overlapAudit8) cleanupStack.bookings.push(b.id);
        throw new Error("PERSISTENCE VULNERABILITY: Overlapping legacy booking row exists despite error!");
      }

      results.push({ id: "TRG-06", name: "Legacy 8-arg Overlap Protection (Zero Rows Persisted)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "TRG-06", name: "Legacy 8-arg Overlap Protection (Zero Rows Persisted)", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST TRG-07: Direct Insert Tenant Mismatch Rejection
    // -----------------------------------------------------------------
    try {
      // Inserting with homestay_id = hsBeta on Room Alpha (which belongs to hsAlpha)
      const mismatchNotes = `Direct mismatch attempt ${testRunId}`;
      const { data: mismatchData, error: mismatchErr } = await adminClient
        .from("bookings")
        .insert({
          room_id: roomAlpha.id,
          partner_id: partnerAlpha.id,
          homestay_id: hsBeta.id, // Mismatched tenant
          check_in: "2027-10-01",
          check_out: "2027-10-03",
          nightly_rate: 4000,
          total_amount: 8000,
          status: "confirmed",
          notes: mismatchNotes
        })
        .select("id").single();

      if (!mismatchErr) {
        if (mismatchData?.id) cleanupStack.bookings.push(mismatchData.id);
        throw new Error("TRIGGER BREACH: Booking with mismatched homestay_id was accepted!");
      }

      if (!mismatchErr.message.includes("BOOKING_TENANT_MISMATCH")) {
        throw new Error(`Expected BOOKING_TENANT_MISMATCH, got: ${mismatchErr.message}`);
      }

      // Persisted Audit: Verify zero rows saved
      const { data: mismatchAudit } = await adminClient
        .from("bookings")
        .select("id")
        .eq("notes", mismatchNotes);
      if (mismatchAudit && mismatchAudit.length > 0) {
        for (const b of mismatchAudit) cleanupStack.bookings.push(b.id);
        throw new Error("PERSISTENCE VULNERABILITY: Mismatched booking row exists despite error!");
      }

      results.push({ id: "TRG-07", name: "Direct Insert Tenant Mismatch Rejection (Zero Rows Persisted)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "TRG-07", name: "Direct Insert Tenant Mismatch Rejection (Zero Rows Persisted)", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST TRG-08: Direct Insert Missing / Invalid Room Rejection
    // -----------------------------------------------------------------
    try {
      const nonExistentRoomId = crypto.randomUUID();
      const missingNotes = `Missing room attempt ${testRunId}`;
      const { data: missingData, error: missingErr } = await adminClient
        .from("bookings")
        .insert({
          room_id: nonExistentRoomId,
          partner_id: partnerAlpha.id,
          check_in: "2027-10-10",
          check_out: "2027-10-12",
          nightly_rate: 4000,
          total_amount: 8000,
          status: "confirmed",
          notes: missingNotes
        })
        .select("id").single();

      if (!missingErr) {
        if (missingData?.id) cleanupStack.bookings.push(missingData.id);
        throw new Error("TRIGGER BREACH: Booking with missing room was accepted!");
      }

      const isMissingBlocked =
        missingErr.message?.includes("ROOM_NOT_FOUND") ||
        missingErr.message?.includes("violates foreign key constraint");

      if (!isMissingBlocked) {
        throw new Error(`Expected ROOM_NOT_FOUND or foreign key failure, got: ${missingErr.message}`);
      }

      // Persisted Audit: Verify zero rows saved
      const { data: missingAudit } = await adminClient
        .from("bookings")
        .select("id")
        .eq("notes", missingNotes);
      if (missingAudit && missingAudit.length > 0) {
        for (const b of missingAudit) cleanupStack.bookings.push(b.id);
        throw new Error("PERSISTENCE VULNERABILITY: Missing room booking row exists despite error!");
      }

      results.push({ id: "TRG-08", name: "Direct Insert Missing Room Rejection (Zero Rows Persisted)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "TRG-08", name: "Direct Insert Missing Room Rejection (Zero Rows Persisted)", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST TRG-09: Unregistered Authenticated Caller Rejection
    // -----------------------------------------------------------------
    try {
      // Step A: Legacy 8-arg RPC attempt by authenticated user with no partner record.
      // Since create_booking_atomic is SECURITY DEFINER, this directly exercises
      // the trigger's authorization check to halt unauthorized authenticated sessions.
      const unregRpcNotes = `Unreg RPC attempt ${testRunId}`;
      const { data: unregRpcData, error: unregRpcErr } = await clientUnregistered.rpc("create_booking_atomic", {
        p_room_id: roomAlpha.id,
        p_partner_id: partnerAlpha.id,
        p_check_in: "2027-11-01",
        p_check_in_time: "14:00:00",
        p_check_out: "2027-11-03",
        p_check_out_time: "11:00:00",
        p_number_of_guests: 1,
        p_notes: unregRpcNotes
      });

      if (!unregRpcErr) {
        if (unregRpcData) cleanupStack.bookings.push(unregRpcData);
        throw new Error("SECURITY BREACH: Authenticated caller without partner profile created a booking via legacy RPC!");
      }

      if (!unregRpcErr.message.includes("UNAUTHORIZED")) {
        throw new Error(`Expected UNAUTHORIZED rejection from legacy RPC, got: ${unregRpcErr.message}`);
      }

      // Step B: Direct insert attempt by authenticated user with no partner record
      const unregDirectNotes = `Unreg direct attempt ${testRunId}`;
      const { data: unregDirectData, error: unregDirectErr } = await clientUnregistered
        .from("bookings")
        .insert({
          room_id: roomAlpha.id,
          partner_id: partnerAlpha.id,
          check_in: "2027-11-05",
          check_out: "2027-11-07",
          nightly_rate: 4000,
          total_amount: 8000,
          status: "confirmed",
          notes: unregDirectNotes
        })
        .select("id").single();

      if (!unregDirectErr) {
        if (unregDirectData?.id) cleanupStack.bookings.push(unregDirectData.id);
        throw new Error("SECURITY BREACH: Authenticated caller without partner profile created a booking via direct insert!");
      }

      const isUnregBlocked =
        unregDirectErr.message?.includes("UNAUTHORIZED") ||
        unregDirectErr.code === "42501";

      if (!isUnregBlocked) {
        throw new Error(`Expected UNAUTHORIZED or 42501 rejection on direct insert, got: ${unregDirectErr.message} (code ${unregDirectErr.code})`);
      }

      // Persisted Audit: Verify zero rows saved for either attempt
      const { data: unregAudit } = await adminClient
        .from("bookings")
        .select("id")
        .in("notes", [unregRpcNotes, unregDirectNotes]);
      if (unregAudit && unregAudit.length > 0) {
        for (const b of unregAudit) cleanupStack.bookings.push(b.id);
        throw new Error("PERSISTENCE VULNERABILITY: Unregistered user booking row exists despite error!");
      }

      results.push({ id: "TRG-09", name: "Unregistered Authenticated Caller Rejection (Zero Rows Persisted)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "TRG-09", name: "Unregistered Authenticated Caller Rejection (Zero Rows Persisted)", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST TRG-10: Phase 1 Payment Flow & Ledger Math on Legacy Booking
    // -----------------------------------------------------------------
    try {
      if (!legacyBookingId) {
        throw new Error("Skipped: legacyBookingId missing due to TRG-04 failure");
      }

      // 1. Advance payment: ₹3,000 cash
      const { data: advPayment, error: advErr } = await clientAlpha
        .from("payments")
        .insert({
          homestay_id: hsAlpha.id,
          booking_id: legacyBookingId,
          amount: 3000.00,
          payment_type: "payment",
          payment_method: "cash",
          recorded_by: partnerAlpha.id,
          notes: "Advance on legacy booking"
        })
        .select("id, amount").single();

      if (advErr || !advPayment) throw new Error(`Advance payment failed: ${advErr?.message}`);
      cleanupStack.payments.push(advPayment.id);
      saveManifest(testRunId, cleanupStack);

      // 2. Settlement payment: ₹5,000 bank transfer
      const { data: setPayment, error: setErr } = await clientAlpha
        .from("payments")
        .insert({
          homestay_id: hsAlpha.id,
          booking_id: legacyBookingId,
          amount: 5000.00,
          payment_type: "payment",
          payment_method: "bank_transfer",
          recorded_by: partnerAlpha.id,
          notes: "Settlement on legacy booking"
        })
        .select("id, amount").single();

      if (setErr || !setPayment) throw new Error(`Settlement payment failed: ${setErr?.message}`);
      cleanupStack.payments.push(setPayment.id);
      saveManifest(testRunId, cleanupStack);

      // 3. Partial refund: ₹1,000 cash
      const { data: refPayment, error: refErr } = await clientAlpha
        .from("payments")
        .insert({
          homestay_id: hsAlpha.id,
          booking_id: legacyBookingId,
          amount: 1000.00,
          payment_type: "refund",
          payment_method: "cash",
          parent_payment_id: advPayment.id,
          recorded_by: partnerAlpha.id,
          notes: "Refund on legacy booking"
        })
        .select("id, amount").single();

      if (refErr || !refPayment) throw new Error(`Partial refund failed: ${refErr?.message}`);
      cleanupStack.payments.push(refPayment.id);
      saveManifest(testRunId, cleanupStack);

      // 4. Ledger Math Audit: Total Paid = 8000, Total Refunded = 1000, Net Cash = 7000, Balance = 1000
      const { data: ledger, error: ledgerErr } = await clientAlpha
        .from("payments")
        .select("amount, payment_type")
        .eq("booking_id", legacyBookingId);

      if (ledgerErr || !ledger) throw new Error(`Failed to fetch ledger: ${ledgerErr?.message}`);

      let paid = 0;
      let refunded = 0;
      for (const p of ledger) {
        if (p.payment_type === "payment") paid += Number(p.amount);
        if (p.payment_type === "refund") refunded += Number(p.amount);
      }
      const net = paid - refunded;
      const balance = 8000 - net;

      if (paid !== 8000 || refunded !== 1000 || net !== 7000 || balance !== 1000) {
        throw new Error(`Ledger math mismatch: paid=${paid}, refunded=${refunded}, net=${net}, balance=${balance}`);
      }

      // 5. Immutability Audit: verify UPDATE is blocked
      const { error: mutErr } = await clientAlpha
        .from("payments")
        .update({ amount: 99999 })
        .eq("id", advPayment.id);

      if (!mutErr) {
        throw new Error("IMMUTABILITY VULNERABILITY: Payment update on legacy booking succeeded!");
      }

      results.push({ id: "TRG-10", name: "Phase 1 Payment Flow & Ledger Math on Legacy Booking", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "TRG-10", name: "Phase 1 Payment Flow & Ledger Math on Legacy Booking", status: "FAIL", discrepancy: err.message });
    }

  } catch (err) {
    suiteError = err;
    console.error(`\n❌ [COMPATIBILITY SUITE HALTED]: ${err.message}`);
  } finally {
    console.log("\n[CLEANUP] Cleaning up exact test fixtures...");
    for (const pid of cleanupStack.payments) await safeDeleteFixture(adminClient, "payments", pid);
    for (const bid of cleanupStack.bookings) await safeDeleteFixture(adminClient, "bookings", bid);
    for (const rid of cleanupStack.rooms) await safeDeleteFixture(adminClient, "rooms", rid);
    for (const pid of cleanupStack.partners) await safeDeleteFixture(adminClient, "partners", pid);
    for (const hid of cleanupStack.homestays) await safeDeleteFixture(adminClient, "homestays", hid);

    // Auth Users cleanly deleted from Supabase Auth
    for (const uid of cleanupStack.authUsers) await safeDeleteAuthUser(adminClient, uid);

    console.log(`✅ Cleanup complete. Recovery manifest preserved at:\n   ${manifestPath}\n`);
  }

  console.table(results);
  if (suiteError) {
    console.error(`\n⚠️  Compatibility suite encountered an error: ${suiteError.message}`);
  }
  return { status: suiteError ? "ERROR" : "COMPLETED", results };
}

if (process.argv[1]?.endsWith("test_legacy_booking_compatibility.mjs")) {
  runCompatibilitySuite().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
