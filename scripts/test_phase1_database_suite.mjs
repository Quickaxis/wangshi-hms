/**
 * ==============================================================================
 * PHASE 1 DATABASE VERIFICATION TEST SUITE (STAGING HARNESS)
 * ==============================================================================
 * STRICT DIRECTIVE:
 * - NEVER TARGETS PRODUCTION SUPABASE.
 * - FAILS CLOSED UNLESS EXPLICIT STAGING CREDENTIALS ARE PROVIDED.
 * - NEVER PRINTS TOKENS, PASSWORDS, OR SECRETS.
 * - TRACKS EXACT UUIDs FOR ALL FIXTURES; CLEANUP IS STRICTLY FIXTURE-SCOPED.
 * - WRITES A RECOVERY MANIFEST FILE SO TERMINATED RUNS CAN BE CLEANED UP SAFELY.
 * - ZERO FALSE PASSES: ASSERTS EXACT ERROR CODES AND INVARIANTS.
 *
 * TESTS EXECUTED:
 * - DB-01: Migration Schema & Catalog Integrity
 * - DB-02: RLS Tenant Read Isolation (Authenticated Partner B cannot read Homestay A)
 * - DB-03: RLS Identity Spoofing Rejection (WITH CHECK validates auth.uid() mapping)
 * - DB-04: Tenant Mismatch Rejection (homestay_id != booking.homestay_id rejected)
 * - DB-05: Ledger Immutability (UPDATE & DELETE blocked for authenticated & service_role)
 * - DB-06: Genuine Concurrency Test (Promise.all concurrent refunds, row lock validation)
 * - DB-07: Reversal-After-Refund Invariant (Capped at unrefunded parent amount)
 * - DB-08: Multiple Partial Refunds (Capped at remaining parent balance)
 * - DB-09: Unlinked Refund Enforcement (Capped at global booking net cash)
 * - DB-10: Cross-Invariant Protection (Reversals blocked if unlinked refund depleted cash)
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import assert from "node:assert";
import crypto from "node:crypto";
import fs from "fs";
import path from "path";

// 1. Resolve environment credentials
function getStagingConfig() {
  const stagingUrl = process.env.STAGING_SUPABASE_URL;
  const stagingServiceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const stagingAnonKey = process.env.STAGING_SUPABASE_ANON_KEY;

  // HARD FAIL-CLOSED SAFETY CHECK: Reject if production URL detected or missing
  const PROD_PROJECT_REF = "algorrnjotffcvtinbyy";

  if (!stagingUrl || !stagingServiceKey || !stagingAnonKey) {
    return {
      configured: false,
      reason: "Missing one or more required environment variables: STAGING_SUPABASE_URL, STAGING_SUPABASE_SERVICE_ROLE_KEY, STAGING_SUPABASE_ANON_KEY"
    };
  }

  if (stagingUrl.includes(PROD_PROJECT_REF)) {
    throw new Error("⛔ HARD SAFETY HALT: Staging configuration points to PRODUCTION Supabase project! Execution aborted.");
  }

  return {
    configured: true,
    stagingUrl,
    stagingServiceKey,
    stagingAnonKey
  };
}

// 2. Recovery Manifest Management
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function saveManifest(runId, stack) {
  const scratchDir = path.resolve(process.cwd(), "scratch");
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }
  const manifestPath = path.join(scratchDir, `staging_manifest_${runId}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(stack, null, 2), "utf8");
  return manifestPath;
}

// 3. Safe Fixture Deletion Helpers (replaces invalid .catch chaining on PostgREST builder)
async function safeDeleteFixture(adminClient, table, id) {
  try {
    const { error } = await adminClient.from(table).delete().eq("id", id);
    if (error) {
      return { success: false, error: error.message };
    }
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
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function runStagingVerificationSuite() {
  console.log("=================================================================");
  console.log("  PHASE 1 DATABASE TEST HARNESS (ISOLATED STAGING SUITE)         ");
  console.log("=================================================================\n");

  const config = getStagingConfig();

  if (!config.configured) {
    console.warn(`🛡️  STAGING EXECUTION BLOCKED: ${config.reason}`);
    console.warn("🛡️  Tests DB-01 through DB-10 remain marked as PENDING STAGING EXECUTION.\n");

    const pendingSummary = [
      { id: "DB-01", name: "Migration Structure & Catalog Integrity", status: "PENDING_EXECUTION" },
      { id: "DB-02", name: "RLS Tenant Read Isolation (Authenticated Partner)", status: "PENDING_EXECUTION" },
      { id: "DB-03", name: "RLS Identity Spoofing Rejection (WITH CHECK)", status: "PENDING_EXECUTION" },
      { id: "DB-04", name: "Tenant Mismatch Rejection (Trigger Enforcement)", status: "PENDING_EXECUTION" },
      { id: "DB-05", name: "Ledger Immutability (UPDATE & DELETE Blocked)", status: "PENDING_EXECUTION" },
      { id: "DB-06", name: "Genuine Concurrency Test (Parallel Promise.all)", status: "PENDING_EXECUTION" },
      { id: "DB-07", name: "Reversal-After-Refund Invariant (Capped at Parent)", status: "PENDING_EXECUTION" },
      { id: "DB-08", name: "Multiple Partial Refunds (Capped at Parent Remainder)", status: "PENDING_EXECUTION" },
      { id: "DB-09", name: "Unlinked Refund Enforcement (Capped at Net Cash)", status: "PENDING_EXECUTION" },
      { id: "DB-10", name: "Cross-Invariant Protection (Reversals Blocked)", status: "PENDING_EXECUTION" }
    ];

    console.table(pendingSummary);
    console.log("\n⚠️ Zero SQL was executed against production Supabase.\n");
    return;
  }

  console.log("🚀 Staging credentials verified. Initializing isolated staging test suite...\n");

  // Admin Client (Used exclusively for fixture setup & teardown)
  const adminClient = createClient(config.stagingUrl, config.stagingServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const testRunId = crypto.randomUUID().slice(0, 8);
  const testPassword = `TestPass_${testRunId}!_${crypto.randomUUID().slice(0, 6)}`;

  // Fixture tracking for strictly fixture-scoped teardown
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
  console.log(`[MANIFEST] Recovery manifest initialized at: ${manifestPath}`);

  const results = [];
  let suiteError = null;

  try {
    // -----------------------------------------------------------------
    // SETUP: Provision Two Staging Homestays and Two Authenticated Users
    // -----------------------------------------------------------------
    console.log(`[SETUP] Provisioning isolated staging fixtures (Run ID: ${testRunId})...`);

    // 1. Homestay Alpha & Beta
    const { data: hsAlpha, error: hsAlphaErr } = await adminClient
      .from("homestays")
      .insert({ name: `Staging HS Alpha ${testRunId}`, slug: `hs-alpha-${testRunId}` })
      .select("id")
      .single();
    if (hsAlphaErr || !hsAlpha) throw new Error(`Setup failed (Homestay Alpha): ${hsAlphaErr?.message}`);
    cleanupStack.homestays.push(hsAlpha.id);
    saveManifest(testRunId, cleanupStack);

    const { data: hsBeta, error: hsBetaErr } = await adminClient
      .from("homestays")
      .insert({ name: `Staging HS Beta ${testRunId}`, slug: `hs-beta-${testRunId}` })
      .select("id")
      .single();
    if (hsBetaErr || !hsBeta) throw new Error(`Setup failed (Homestay Beta): ${hsBetaErr?.message}`);
    cleanupStack.homestays.push(hsBeta.id);
    saveManifest(testRunId, cleanupStack);

    // 2. Auth User Alpha & Beta
    const emailAlpha = `partner.alpha.${testRunId}@staging.test`;
    const { data: authUserAlpha, error: authUserAlphaErr } = await adminClient.auth.admin.createUser({
      email: emailAlpha,
      password: testPassword,
      email_confirm: true
    });
    if (authUserAlphaErr || !authUserAlpha?.user) throw new Error(`Setup failed (Auth User Alpha): ${authUserAlphaErr?.message}`);
    cleanupStack.authUsers.push(authUserAlpha.user.id);
    saveManifest(testRunId, cleanupStack);

    const emailBeta = `partner.beta.${testRunId}@staging.test`;
    const { data: authUserBeta, error: authUserBetaErr } = await adminClient.auth.admin.createUser({
      email: emailBeta,
      password: testPassword,
      email_confirm: true
    });
    if (authUserBetaErr || !authUserBeta?.user) throw new Error(`Setup failed (Auth User Beta): ${authUserBetaErr?.message}`);
    cleanupStack.authUsers.push(authUserBeta.user.id);
    saveManifest(testRunId, cleanupStack);

    // 3. Partner Records
    const { data: partnerAlpha, error: partnerAlphaErr } = await adminClient
      .from("partners")
      .insert({
        homestay_id: hsAlpha.id,
        auth_user_id: authUserAlpha.user.id,
        name: `Partner Alpha ${testRunId}`,
        email: emailAlpha,
        role: "partner",
        is_active: true
      })
      .select("id")
      .single();
    if (partnerAlphaErr || !partnerAlpha) throw new Error(`Setup failed (Partner Alpha): ${partnerAlphaErr?.message}`);
    cleanupStack.partners.push(partnerAlpha.id);
    saveManifest(testRunId, cleanupStack);

    const { data: partnerBeta, error: partnerBetaErr } = await adminClient
      .from("partners")
      .insert({
        homestay_id: hsBeta.id,
        auth_user_id: authUserBeta.user.id,
        name: `Partner Beta ${testRunId}`,
        email: emailBeta,
        role: "partner",
        is_active: true
      })
      .select("id")
      .single();
    if (partnerBetaErr || !partnerBeta) throw new Error(`Setup failed (Partner Beta): ${partnerBetaErr?.message}`);
    cleanupStack.partners.push(partnerBeta.id);
    saveManifest(testRunId, cleanupStack);

    // 4. Staging Rooms
    const { data: roomAlpha, error: roomAlphaErr } = await adminClient
      .from("rooms")
      .insert({
        homestay_id: hsAlpha.id,
        room_number: `A-${testRunId.slice(0, 4)}`,
        name: "Suite Alpha",
        nightly_rate: 5000,
        max_guests: 4
      })
      .select("id")
      .single();
    if (roomAlphaErr || !roomAlpha) throw new Error(`Setup failed (Room Alpha): ${roomAlphaErr?.message}`);
    cleanupStack.rooms.push(roomAlpha.id);
    saveManifest(testRunId, cleanupStack);

    const { data: roomBeta, error: roomBetaErr } = await adminClient
      .from("rooms")
      .insert({
        homestay_id: hsBeta.id,
        room_number: `B-${testRunId.slice(0, 4)}`,
        name: "Suite Beta",
        nightly_rate: 5000,
        max_guests: 4
      })
      .select("id")
      .single();
    if (roomBetaErr || !roomBeta) throw new Error(`Setup failed (Room Beta): ${roomBetaErr?.message}`);
    cleanupStack.rooms.push(roomBeta.id);
    saveManifest(testRunId, cleanupStack);

    // 5. Staging Bookings
    const { data: bookingAlpha, error: bookingAlphaErr } = await adminClient
      .from("bookings")
      .insert({
        room_id: roomAlpha.id,
        partner_id: partnerAlpha.id,
        homestay_id: hsAlpha.id,
        check_in: "2027-01-01",
        check_out: "2027-01-03",
        nightly_rate: 5000,
        total_amount: 10000,
        status: "confirmed"
      })
      .select("id")
      .single();
    if (bookingAlphaErr || !bookingAlpha) throw new Error(`Setup failed (Booking Alpha): ${bookingAlphaErr?.message}`);
    cleanupStack.bookings.push(bookingAlpha.id);
    saveManifest(testRunId, cleanupStack);

    const { data: bookingBeta, error: bookingBetaErr } = await adminClient
      .from("bookings")
      .insert({
        room_id: roomBeta.id,
        partner_id: partnerBeta.id,
        homestay_id: hsBeta.id,
        check_in: "2027-01-01",
        check_out: "2027-01-03",
        nightly_rate: 5000,
        total_amount: 10000,
        status: "confirmed"
      })
      .select("id")
      .single();
    if (bookingBetaErr || !bookingBeta) throw new Error(`Setup failed (Booking Beta): ${bookingBetaErr?.message}`);
    cleanupStack.bookings.push(bookingBeta.id);
    saveManifest(testRunId, cleanupStack);

    // 6. Authenticate Genuine Partner Clients (Using anon key + JWT sessions)
    const clientAlpha = createClient(config.stagingUrl, config.stagingAnonKey);
    const { error: loginAlphaErr } = await clientAlpha.auth.signInWithPassword({
      email: emailAlpha,
      password: testPassword
    });
    if (loginAlphaErr) throw new Error(`Setup failed (Login Alpha): ${loginAlphaErr.message}`);

    const clientBeta = createClient(config.stagingUrl, config.stagingAnonKey);
    const { error: loginBetaErr } = await clientBeta.auth.signInWithPassword({
      email: emailBeta,
      password: testPassword
    });
    if (loginBetaErr) throw new Error(`Setup failed (Login Beta): ${loginBetaErr.message}`);

    console.log("✅ Authenticated genuine partner sessions for Partner Alpha and Partner Beta.\n");

    // -----------------------------------------------------------------
    // TEST DB-01: Schema Structure & Catalog Validation
    // -----------------------------------------------------------------
    try {
      const { data, error } = await adminClient.from("payments").select("id, amount, payment_type, homestay_id").limit(1);
      if (error) throw new Error(`Schema query failed: ${error.message} (code ${error.code})`);
      results.push({ id: "DB-01", name: "Migration Structure & Schema Presence", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "DB-01", name: "Migration Structure & Schema Presence", status: "FAIL", discrepancy: err.message });
    }

    // Base Payment for DB-02 and DB-03
    const { data: basePayment, error: basePaymentErr } = await clientAlpha
      .from("payments")
      .insert({
        homestay_id: hsAlpha.id,
        booking_id: bookingAlpha.id,
        amount: 5000.00,
        payment_type: "payment",
        payment_method: "cash",
        recorded_by: partnerAlpha.id,
        notes: "Advance payment"
      })
      .select("id")
      .single();
    if (basePaymentErr || !basePayment) throw new Error(`Setup failed (Base Payment): ${basePaymentErr?.message}`);
    cleanupStack.payments.push(basePayment.id);
    saveManifest(testRunId, cleanupStack);

    // -----------------------------------------------------------------
    // TEST DB-02: Genuine RLS Tenant Read Isolation
    // -----------------------------------------------------------------
    try {
      // 1. Partner Beta attempts to read payments belonging to Homestay Alpha
      const { data: crossTenantRows, error: readErr } = await clientBeta
        .from("payments")
        .select("*")
        .eq("homestay_id", hsAlpha.id);

      if (readErr) throw new Error(`Unexpected query error: ${readErr.message}`);
      if (crossTenantRows.length > 0) throw new Error(`RLS BREACH: Partner Beta saw ${crossTenantRows.length} payment(s) from Homestay Alpha!`);

      // 2. Partner Beta queries all payments without filter -> must not contain Homestay Alpha payments
      const { data: allBetaRows } = await clientBeta.from("payments").select("*");
      const leaked = (allBetaRows || []).some(row => row.homestay_id === hsAlpha.id);
      if (leaked) throw new Error("RLS BREACH: Unfiltered select returned Homestay Alpha payments to Partner Beta!");

      // 3. Partner Alpha queries own homestay -> Must see the payment
      const { data: ownRows } = await clientAlpha
        .from("payments")
        .select("*")
        .eq("homestay_id", hsAlpha.id);

      if (!ownRows || ownRows.length === 0) throw new Error("Owner read failed: Partner Alpha could not read own payments under RLS");

      results.push({ id: "DB-02", name: "RLS Tenant Read Isolation (Genuine JWT)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "DB-02", name: "RLS Tenant Read Isolation (Genuine JWT)", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST DB-03: RLS Identity Spoofing Rejection (WITH CHECK)
    // -----------------------------------------------------------------
    try {
      // Partner Alpha attempts to insert payment using Partner Beta's recorded_by
      const { data: spoofData, error: spoofErr } = await clientAlpha
        .from("payments")
        .insert({
          homestay_id: hsAlpha.id,
          booking_id: bookingAlpha.id,
          amount: 1000.00,
          payment_type: "payment",
          payment_method: "cash",
          recorded_by: partnerBeta.id, // Forged identity
          notes: "Spoofed insert attempt"
        })
        .select("id")
        .single();

      if (!spoofErr) {
        if (spoofData?.id) cleanupStack.payments.push(spoofData.id);
        throw new Error("RLS VULNERABILITY: Identity spoofing succeeded! Partner Alpha inserted payment with Partner Beta's recorded_by!");
      }

      // Assert error is an expected defense-in-depth rejection:
      // 1. RLS policy violation (SQLSTATE 42501 or 'row-level security policy' message)
      // 2. Trigger tenant authorization violation ('PAYMENT_RECORDER_UNAUTHORIZED' / SQLSTATE P0001)
      const isExpectedRejection =
        (spoofErr.code === "42501" && (spoofErr.message?.includes("row-level security policy") || spoofErr.message?.includes("permission denied"))) ||
        spoofErr.message?.includes("row-level security policy") ||
        spoofErr.message?.includes("PAYMENT_RECORDER_UNAUTHORIZED") ||
        (spoofErr.code === "P0001" && spoofErr.message?.includes("not authorized for homestay"));

      if (!isExpectedRejection) {
        throw new Error(`Unexpected error type on spoof attempt: ${spoofErr.message} (code ${spoofErr.code})`);
      }

      // Post-assertion audit: Verify no spoofed row was persisted in database
      const { data: spoofAudit, error: auditErr } = await adminClient
        .from("payments")
        .select("id")
        .eq("notes", "Spoofed insert attempt");
      if (auditErr) {
        throw new Error(`Audit verification query failed: ${auditErr.message}`);
      }
      if (spoofAudit && spoofAudit.length > 0) {
        for (const s of spoofAudit) cleanupStack.payments.push(s.id);
        throw new Error("RLS VULNERABILITY: Spoofed payment row exists in database despite error!");
      }

      results.push({ id: "DB-03", name: "RLS Identity Spoofing Rejection (WITH CHECK)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "DB-03", name: "RLS Identity Spoofing Rejection (WITH CHECK)", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST DB-04: Tenant Mismatch Rejection (Trigger)
    // -----------------------------------------------------------------
    try {
      // Inserting payment with homestay_id = hsBeta on Booking Alpha (which belongs to hsAlpha)
      const { data: mismatchData, error: mismatchErr } = await clientAlpha
        .from("payments")
        .insert({
          homestay_id: hsBeta.id, // Mismatched tenant
          booking_id: bookingAlpha.id,
          amount: 1000.00,
          payment_type: "payment",
          payment_method: "cash",
          recorded_by: partnerAlpha.id,
          notes: "Mismatched tenant insert"
        })
        .select("id")
        .single();

      if (!mismatchErr) {
        if (mismatchData?.id) cleanupStack.payments.push(mismatchData.id);
        throw new Error("TRIGGER VULNERABILITY: Payment with mismatched homestay_id was accepted!");
      }

      if (!mismatchErr.message.includes("PAYMENT_TENANT_MISMATCH")) {
        throw new Error(`Expected PAYMENT_TENANT_MISMATCH, got: ${mismatchErr.message}`);
      }

      results.push({ id: "DB-04", name: "Tenant Mismatch Rejection (homestay_id != booking)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "DB-04", name: "Tenant Mismatch Rejection (homestay_id != booking)", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST DB-05: Ledger Immutability (UPDATE & DELETE Blocked)
    // -----------------------------------------------------------------
    try {
      // 1. Authenticated UPDATE attempt
      const { data: authUpdateData, error: authUpdateErr } = await clientAlpha
        .from("payments")
        .update({ amount: 9999.00 })
        .eq("id", basePayment.id)
        .select("id");
      if (!authUpdateErr) {
        throw new Error("IMMUTABILITY BREACH: Authenticated client updated payment; operation succeeded without error!");
      }
      const isExpectedAuthUpdateBlock =
        authUpdateErr.message?.includes("PAYMENT_LEDGER_IMMUTABLE") ||
        authUpdateErr.message?.includes("permission denied for table payments") ||
        (authUpdateErr.code === "42501" && authUpdateErr.message?.includes("permission denied"));

      if (!isExpectedAuthUpdateBlock) {
        throw new Error(`Expected PAYMENT_LEDGER_IMMUTABLE or permission denied on authenticated update, got: ${authUpdateErr.message} (code ${authUpdateErr.code})`);
      }

      // 2. Authenticated DELETE attempt
      const { data: authDeleteData, error: authDeleteErr } = await clientAlpha
        .from("payments")
        .delete()
        .eq("id", basePayment.id)
        .select("id");
      if (!authDeleteErr) {
        throw new Error("IMMUTABILITY BREACH: Authenticated client deleted payment; operation succeeded without error!");
      }
      const isExpectedAuthDeleteBlock =
        authDeleteErr.message?.includes("PAYMENT_LEDGER_IMMUTABLE") ||
        authDeleteErr.message?.includes("permission denied for table payments") ||
        (authDeleteErr.code === "42501" && authDeleteErr.message?.includes("permission denied"));

      if (!isExpectedAuthDeleteBlock) {
        throw new Error(`Expected PAYMENT_LEDGER_IMMUTABLE or permission denied on authenticated delete, got: ${authDeleteErr.message} (code ${authDeleteErr.code})`);
      }

      // 3. Privileged Admin UPDATE attempt (Trigger must block even service_role)
      const { data: adminUpdateData, error: adminUpdateErr } = await adminClient
        .from("payments")
        .update({ amount: 9999.00 })
        .eq("id", basePayment.id)
        .select("id");
      if (!adminUpdateErr) {
        throw new Error("IMMUTABILITY BREACH: Admin client updated payment; operation succeeded without error!");
      }
      const isExpectedAdminUpdateBlock =
        adminUpdateErr.message?.includes("PAYMENT_LEDGER_IMMUTABLE") ||
        adminUpdateErr.message?.includes("permission denied for table payments") ||
        (adminUpdateErr.code === "42501" && adminUpdateErr.message?.includes("permission denied"));

      if (!isExpectedAdminUpdateBlock) {
        throw new Error(`Expected PAYMENT_LEDGER_IMMUTABLE or permission denied on admin update, got: ${adminUpdateErr.message} (code ${adminUpdateErr.code})`);
      }

      // 4. Privileged Admin DELETE attempt (Trigger or SQL grant revocation must block even service_role)
      const { data: adminDeleteData, error: adminDeleteErr } = await adminClient
        .from("payments")
        .delete()
        .eq("id", basePayment.id)
        .select("id");
      if (!adminDeleteErr) {
        throw new Error("IMMUTABILITY BREACH: Admin client deleted payment; operation succeeded without error!");
      }
      const isExpectedAdminDeleteBlock =
        adminDeleteErr.message?.includes("PAYMENT_LEDGER_IMMUTABLE") ||
        adminDeleteErr.message?.includes("permission denied for table payments") ||
        (adminDeleteErr.code === "42501" && adminDeleteErr.message?.includes("permission denied"));

      if (!isExpectedAdminDeleteBlock) {
        throw new Error(`Expected PAYMENT_LEDGER_IMMUTABLE or permission denied on admin delete, got: ${adminDeleteErr.message} (code ${adminDeleteErr.code})`);
      }

      // 5. Verify base payment still exists with original amount
      const { data: verifiedPayment, error: verifyErr } = await adminClient
        .from("payments")
        .select("amount")
        .eq("id", basePayment.id)
        .single();
      if (verifyErr || !verifiedPayment || Number(verifiedPayment.amount) !== 5000.00) {
        throw new Error(`Integrity check failed: Base payment row was modified during immutability tests (${verifyErr?.message || 'amount mismatch or missing'})`);
      }

      results.push({ id: "DB-05", name: "Ledger Immutability (Authenticated & Privileged)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "DB-05", name: "Ledger Immutability (Authenticated & Privileged)", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST DB-06: Genuine Concurrency Test (Parallel Promise.all)
    // -----------------------------------------------------------------
    try {
      // 1. Create dedicated isolated booking with 5000.00 collected
      const { data: concBooking, error: concBookingErr } = await adminClient
        .from("bookings")
        .insert({
          room_id: roomAlpha.id,
          partner_id: partnerAlpha.id,
          homestay_id: hsAlpha.id,
          check_in: "2027-02-01",
          check_out: "2027-02-03",
          nightly_rate: 5000,
          total_amount: 10000,
          status: "confirmed"
        })
        .select("id")
        .single();
      if (concBookingErr || !concBooking) throw new Error(`Setup failed (Conc Booking): ${concBookingErr?.message}`);
      cleanupStack.bookings.push(concBooking.id);
      saveManifest(testRunId, cleanupStack);

      const { data: concPayment, error: concPaymentErr } = await clientAlpha
        .from("payments")
        .insert({
          homestay_id: hsAlpha.id,
          booking_id: concBooking.id,
          amount: 5000.00,
          payment_type: "payment",
          payment_method: "cash",
          recorded_by: partnerAlpha.id,
          notes: "Concurrency base payment"
        })
        .select("id")
        .single();
      if (concPaymentErr || !concPayment) throw new Error(`Setup failed (Conc Payment): ${concPaymentErr?.message}`);
      cleanupStack.payments.push(concPayment.id);
      saveManifest(testRunId, cleanupStack);

      // 2. Dispatch TWO concurrent refund requests of 4000.00 each
      console.log("[DB-06] Dispatching 2 simultaneous refund requests of ₹4,000 against ₹5,000 collected cash...");
      const [res1, res2] = await Promise.all([
        clientAlpha.from("payments").insert({
          homestay_id: hsAlpha.id,
          booking_id: concBooking.id,
          amount: 4000.00,
          payment_type: "refund",
          payment_method: "cash",
          recorded_by: partnerAlpha.id,
          notes: "Concurrent refund attempt #1"
        }).select("id").single(),
        clientAlpha.from("payments").insert({
          homestay_id: hsAlpha.id,
          booking_id: concBooking.id,
          amount: 4000.00,
          payment_type: "refund",
          payment_method: "cash",
          recorded_by: partnerAlpha.id,
          notes: "Concurrent refund attempt #2"
        }).select("id").single()
      ]);

      // 3. Strict Concurrency Validation: Exactly one must succeed, exactly one must fail
      const req1Success = res1.error === null && res1.data?.id;
      const req2Success = res2.error === null && res2.data?.id;

      if (req1Success && req2Success) {
        // Track both for cleanup if disaster occurred
        cleanupStack.payments.push(res1.data.id, res2.data.id);
        saveManifest(testRunId, cleanupStack);
        throw new Error("RACE CONDITION BREACH: Both concurrent refunds succeeded! Over-refund of ₹8,000 on ₹5,000 collected occurred!");
      }

      if (!req1Success && !req2Success) {
        throw new Error(`CONCURRENCY ABORT: Both requests failed! Req1: ${res1.error?.message}; Req2: ${res2.error?.message}`);
      }

      // Track winning refund for cleanup
      const winningId = req1Success ? res1.data.id : res2.data.id;
      cleanupStack.payments.push(winningId);
      saveManifest(testRunId, cleanupStack);

      // Verify losing error message
      const failedResult = req1Success ? res2 : res1;
      if (!failedResult.error.message.includes("OVER_REFUND_EXCEEDED")) {
        throw new Error(`Losing request failed with unexpected error: ${failedResult.error.message}`);
      }

      // 4. Read back full ledger from database and calculate actual net cash
      const { data: finalPayments, error: ledgerErr } = await adminClient
        .from("payments")
        .select("id, amount, payment_type")
        .eq("booking_id", concBooking.id);

      if (ledgerErr) throw new Error(`Failed to read back final ledger: ${ledgerErr.message}`);
      if (finalPayments.length !== 2) {
        throw new Error(`Expected exactly 2 rows (1 payment, 1 refund) in ledger, found ${finalPayments.length}`);
      }

      const netCash = finalPayments.reduce((acc, p) => p.payment_type === "payment" ? acc + Number(p.amount) : acc - Number(p.amount), 0);
      if (netCash !== 1000.00) {
        throw new Error(`Net cash reconciliation failed: Expected 1000.00, got ${netCash}`);
      }

      results.push({ id: "DB-06", name: "Genuine Concurrency Test (Promise.all row lock)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "DB-06", name: "Genuine Concurrency Test (Promise.all row lock)", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST DB-07: Reversal-After-Refund Invariant
    // -----------------------------------------------------------------
    try {
      const { data: b7, error: b7Err } = await adminClient
        .from("bookings")
        .insert({ room_id: roomAlpha.id, partner_id: partnerAlpha.id, homestay_id: hsAlpha.id, check_in: "2027-03-01", check_out: "2027-03-03", nightly_rate: 5000, total_amount: 10000, status: "confirmed" })
        .select("id").single();
      if (b7Err || !b7) throw new Error(`Setup failed (b7): ${b7Err?.message}`);
      cleanupStack.bookings.push(b7.id);
      saveManifest(testRunId, cleanupStack);

      const { data: p7, error: p7Err } = await clientAlpha
        .from("payments")
        .insert({ homestay_id: hsAlpha.id, booking_id: b7.id, amount: 5000.00, payment_type: "payment", payment_method: "cash", recorded_by: partnerAlpha.id, notes: "Base" })
        .select("id").single();
      if (p7Err || !p7) throw new Error(`Setup failed (p7): ${p7Err?.message}`);
      cleanupStack.payments.push(p7.id);
      saveManifest(testRunId, cleanupStack);

      const { data: ref7, error: ref7Err } = await clientAlpha
        .from("payments")
        .insert({ homestay_id: hsAlpha.id, booking_id: b7.id, amount: 3000.00, payment_type: "refund", payment_method: "cash", parent_payment_id: p7.id, recorded_by: partnerAlpha.id, notes: "Partial refund" })
        .select("id").single();
      if (ref7Err || !ref7) throw new Error(`Setup failed (ref7): ${ref7Err?.message}`);
      cleanupStack.payments.push(ref7.id);
      saveManifest(testRunId, cleanupStack);

      // Attempt reversal of full 5000.00 -> MUST FAIL
      const { data: revOverData, error: revOverErr } = await clientAlpha
        .from("payments")
        .insert({ homestay_id: hsAlpha.id, booking_id: b7.id, amount: 5000.00, payment_type: "reversal", payment_method: "cash", parent_payment_id: p7.id, recorded_by: partnerAlpha.id, notes: "Attempted full reversal" })
        .select("id").single();

      if (!revOverErr) {
        if (revOverData?.id) cleanupStack.payments.push(revOverData.id);
        throw new Error("INVARIANT BREACH: Reversal of 5000 on parent with 3000 refund succeeded!");
      }
      if (!revOverErr.message.includes("PARENT_BALANCE_EXCEEDED")) {
        throw new Error(`Expected PARENT_BALANCE_EXCEEDED, got: ${revOverErr.message}`);
      }

      // Reversal of remaining 2000.00 -> MUST SUCCEED
      const { data: revOkData, error: revOkErr } = await clientAlpha
        .from("payments")
        .insert({ homestay_id: hsAlpha.id, booking_id: b7.id, amount: 2000.00, payment_type: "reversal", payment_method: "cash", parent_payment_id: p7.id, recorded_by: partnerAlpha.id, notes: "Valid reversal" })
        .select("id").single();

      if (revOkErr || !revOkData) throw new Error(`Valid reversal of remaining 2000 failed: ${revOkErr?.message}`);
      cleanupStack.payments.push(revOkData.id);
      saveManifest(testRunId, cleanupStack);

      // Further reversal of 1.00 -> MUST FAIL
      const { error: revExtraErr } = await clientAlpha
        .from("payments")
        .insert({ homestay_id: hsAlpha.id, booking_id: b7.id, amount: 1.00, payment_type: "reversal", payment_method: "cash", parent_payment_id: p7.id, recorded_by: partnerAlpha.id, notes: "Extra reversal" });

      if (!revExtraErr) throw new Error("INVARIANT BREACH: Further reversal succeeded after parent fully depleted!");
      if (!revExtraErr.message.includes("PARENT_BALANCE_EXCEEDED")) {
        throw new Error(`Expected PARENT_BALANCE_EXCEEDED, got: ${revExtraErr.message}`);
      }

      results.push({ id: "DB-07", name: "Reversal-After-Refund Invariant (Capped at Parent)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "DB-07", name: "Reversal-After-Refund Invariant (Capped at Parent)", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST DB-08: Multiple Partial Refunds Capped at Parent Balance
    // -----------------------------------------------------------------
    try {
      const { data: b8, error: b8Err } = await adminClient
        .from("bookings")
        .insert({ room_id: roomAlpha.id, partner_id: partnerAlpha.id, homestay_id: hsAlpha.id, check_in: "2027-04-01", check_out: "2027-04-03", nightly_rate: 5000, total_amount: 10000, status: "confirmed" })
        .select("id").single();
      if (b8Err || !b8) throw new Error(`Setup failed (b8): ${b8Err?.message}`);
      cleanupStack.bookings.push(b8.id);
      saveManifest(testRunId, cleanupStack);

      const { data: p8, error: p8Err } = await clientAlpha
        .from("payments")
        .insert({ homestay_id: hsAlpha.id, booking_id: b8.id, amount: 4000.00, payment_type: "payment", payment_method: "upi", recorded_by: partnerAlpha.id, notes: "Base" })
        .select("id").single();
      if (p8Err || !p8) throw new Error(`Setup failed (p8): ${p8Err?.message}`);
      cleanupStack.payments.push(p8.id);
      saveManifest(testRunId, cleanupStack);

      const { data: r1, error: r1Err } = await clientAlpha.from("payments").insert({ homestay_id: hsAlpha.id, booking_id: b8.id, amount: 2000.00, payment_type: "refund", payment_method: "upi", parent_payment_id: p8.id, recorded_by: partnerAlpha.id, notes: "Ref 1" }).select("id").single();
      if (r1Err || !r1) throw new Error(`Setup failed (r1): ${r1Err?.message}`);
      cleanupStack.payments.push(r1.id);

      const { data: r2, error: r2Err } = await clientAlpha.from("payments").insert({ homestay_id: hsAlpha.id, booking_id: b8.id, amount: 1500.00, payment_type: "refund", payment_method: "upi", parent_payment_id: p8.id, recorded_by: partnerAlpha.id, notes: "Ref 2" }).select("id").single();
      if (r2Err || !r2) throw new Error(`Setup failed (r2): ${r2Err?.message}`);
      cleanupStack.payments.push(r2.id);
      saveManifest(testRunId, cleanupStack);

      // Third refund of 1000.00 (2000 + 1500 + 1000 = 4500 > 4000) -> MUST FAIL
      const { data: r3Data, error: refOverErr } = await clientAlpha
        .from("payments")
        .insert({ homestay_id: hsAlpha.id, booking_id: b8.id, amount: 1000.00, payment_type: "refund", payment_method: "upi", parent_payment_id: p8.id, recorded_by: partnerAlpha.id, notes: "Ref 3 excessive" })
        .select("id").single();

      if (!refOverErr) {
        if (r3Data?.id) cleanupStack.payments.push(r3Data.id);
        throw new Error("INVARIANT BREACH: Third partial refund exceeding parent balance was accepted!");
      }
      if (!refOverErr.message.includes("PARENT_BALANCE_EXCEEDED")) {
        throw new Error(`Expected PARENT_BALANCE_EXCEEDED, got: ${refOverErr.message}`);
      }

      // Exact remaining refund of 500.00 -> MUST SUCCEED
      const { data: r4, error: r4Err } = await clientAlpha
        .from("payments")
        .insert({ homestay_id: hsAlpha.id, booking_id: b8.id, amount: 500.00, payment_type: "refund", payment_method: "upi", parent_payment_id: p8.id, recorded_by: partnerAlpha.id, notes: "Exact remainder" })
        .select("id").single();
      if (r4Err || !r4) throw new Error(`Valid refund of exact remainder 500 failed: ${r4Err?.message}`);
      cleanupStack.payments.push(r4.id);
      saveManifest(testRunId, cleanupStack);

      results.push({ id: "DB-08", name: "Multiple Partial Refunds (Capped at Remainder)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "DB-08", name: "Multiple Partial Refunds (Capped at Remainder)", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST DB-09 & DB-10: Unlinked Refunds & Cross-Invariant Reversal Protection
    // -----------------------------------------------------------------
    try {
      const { data: b9, error: b9Err } = await adminClient
        .from("bookings")
        .insert({ room_id: roomAlpha.id, partner_id: partnerAlpha.id, homestay_id: hsAlpha.id, check_in: "2027-05-01", check_out: "2027-05-03", nightly_rate: 5000, total_amount: 10000, status: "confirmed" })
        .select("id").single();
      if (b9Err || !b9) throw new Error(`Setup failed (b9): ${b9Err?.message}`);
      cleanupStack.bookings.push(b9.id);
      saveManifest(testRunId, cleanupStack);

      // Payment #1 of 2000.00 and Payment #2 of 1500.00 (Total Net Cash: 3500.00)
      const { data: p9_1, error: p9_1Err } = await clientAlpha
        .from("payments")
        .insert({ homestay_id: hsAlpha.id, booking_id: b9.id, amount: 2000.00, payment_type: "payment", payment_method: "cash", recorded_by: partnerAlpha.id, notes: "P1" })
        .select("id").single();
      if (p9_1Err || !p9_1) throw new Error(`Setup failed (p9_1): ${p9_1Err?.message}`);
      cleanupStack.payments.push(p9_1.id);

      const { data: p9_2, error: p9_2Err } = await clientAlpha
        .from("payments")
        .insert({ homestay_id: hsAlpha.id, booking_id: b9.id, amount: 1500.00, payment_type: "payment", payment_method: "bank_transfer", recorded_by: partnerAlpha.id, notes: "P2" })
        .select("id").single();
      if (p9_2Err || !p9_2) throw new Error(`Setup failed (p9_2): ${p9_2Err?.message}`);
      cleanupStack.payments.push(p9_2.id);
      saveManifest(testRunId, cleanupStack);

      // Unlinked refund of 3000.00 -> MUST SUCCEED (DB-09), leaves 500.00 net cash
      const { data: unlinkedRef, error: unlinkedErr } = await clientAlpha
        .from("payments")
        .insert({ homestay_id: hsAlpha.id, booking_id: b9.id, amount: 3000.00, payment_type: "refund", payment_method: "cash", recorded_by: partnerAlpha.id, notes: "Unlinked refund" })
        .select("id").single();
      if (unlinkedErr || !unlinkedRef) throw new Error(`Unlinked refund of 3000 failed unexpectedly: ${unlinkedErr?.message}`);
      cleanupStack.payments.push(unlinkedRef.id);
      saveManifest(testRunId, cleanupStack);

      // Second unlinked refund of 600.00 (exceeds remaining 500.00 net cash) -> MUST FAIL
      const { error: unlinkedOverErr } = await clientAlpha
        .from("payments")
        .insert({ homestay_id: hsAlpha.id, booking_id: b9.id, amount: 600.00, payment_type: "refund", payment_method: "cash", recorded_by: partnerAlpha.id, notes: "Unlinked over-refund" });
      if (!unlinkedOverErr) throw new Error("INVARIANT BREACH: Unlinked refund exceeding net collected cash succeeded!");
      if (!unlinkedOverErr.message.includes("OVER_REFUND_EXCEEDED")) {
        throw new Error(`Expected OVER_REFUND_EXCEEDED, got: ${unlinkedOverErr.message}`);
      }
      results.push({ id: "DB-09", name: "Unlinked Refund Enforcement (Capped at Net Cash)", status: "PASS", discrepancy: "None" });

      // DB-10: Attempting to reverse Payment #1 (2000.00) when global net cash is 500.00 -> MUST FAIL
      const { data: revCrossData, error: revCrossErr } = await clientAlpha
        .from("payments")
        .insert({ homestay_id: hsAlpha.id, booking_id: b9.id, amount: 2000.00, payment_type: "reversal", payment_method: "cash", parent_payment_id: p9_1.id, recorded_by: partnerAlpha.id, notes: "Reversal blocked" })
        .select("id").single();

      if (!revCrossErr) {
        if (revCrossData?.id) cleanupStack.payments.push(revCrossData.id);
        throw new Error("CROSS-INVARIANT BREACH: Reversal of 2000 allowed even though unlinked refund depleted global cash to 500!");
      }
      if (!revCrossErr.message.includes("REVERSAL_EXCEEDS_GLOBAL_CASH")) {
        throw new Error(`Expected REVERSAL_EXCEEDS_GLOBAL_CASH, got: ${revCrossErr.message}`);
      }

      // Valid reversal of exact remaining 500.00 -> MUST SUCCEED
      const { data: revCrossOk, error: revCrossOkErr } = await clientAlpha
        .from("payments")
        .insert({ homestay_id: hsAlpha.id, booking_id: b9.id, amount: 500.00, payment_type: "reversal", payment_method: "cash", parent_payment_id: p9_1.id, recorded_by: partnerAlpha.id, notes: "Reversal of remaining 500" })
        .select("id").single();
      if (revCrossOkErr || !revCrossOk) throw new Error(`Reversal of remaining 500 failed: ${revCrossOkErr?.message}`);
      cleanupStack.payments.push(revCrossOk.id);
      saveManifest(testRunId, cleanupStack);

      results.push({ id: "DB-10", name: "Cross-Invariant Protection (Reversals Blocked)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      if (!results.some(r => r.id === "DB-09")) {
        results.push({ id: "DB-09", name: "Unlinked Refund Enforcement (Capped at Net Cash)", status: "FAIL", discrepancy: err.message });
      }
      results.push({ id: "DB-10", name: "Cross-Invariant Protection (Reversals Blocked)", status: "FAIL", discrepancy: err.message });
    }

    } catch (err) {
      suiteError = err;
      console.error(`\n❌ [TEST HARNESS HALTED]: ${err.message}`);
    } finally {
      // -----------------------------------------------------------------
      // CLEANUP: Strictly Fixture-Scoped Teardown with Integrity Protections Enabled
      // -----------------------------------------------------------------
      console.log("\n[CLEANUP] Tearing down exact staging fixtures in foreign-key dependency order...");

      // 1. Attempt exact payments deletion (integrity protections remain strictly enabled)
      let immutableProtectedCount = 0;
      for (const pid of cleanupStack.payments) {
        const res = await safeDeleteFixture(adminClient, "payments", pid);
        if (!res.success && res.error?.includes("PAYMENT_LEDGER_IMMUTABLE")) {
          immutableProtectedCount++;
        } else if (!res.success) {
          console.warn(`  ⚠️ Could not delete test payment ${pid}: ${res.error}`);
        }
      }
      if (immutableProtectedCount > 0) {
        console.log(`ℹ️  Ledger immutability active: ${immutableProtectedCount} test payment(s) protected from deletion.`);
      }

      // 2. Exact Bookings (protected if referenced by ON DELETE RESTRICT payments)
      for (const bid of cleanupStack.bookings) {
        const res = await safeDeleteFixture(adminClient, "bookings", bid);
        if (!res.success && !res.error?.includes("violates foreign key constraint")) {
          console.warn(`  ⚠️ Could not delete test booking ${bid}: ${res.error}`);
        }
      }

      // 3. Exact Rooms
      for (const rid of cleanupStack.rooms) {
        const res = await safeDeleteFixture(adminClient, "rooms", rid);
        if (!res.success && !res.error?.includes("violates foreign key constraint")) {
          console.warn(`  ⚠️ Could not delete test room ${rid}: ${res.error}`);
        }
      }

      // 4. Exact Partners
      for (const pid of cleanupStack.partners) {
        const res = await safeDeleteFixture(adminClient, "partners", pid);
        if (!res.success && !res.error?.includes("violates foreign key constraint")) {
          console.warn(`  ⚠️ Could not delete test partner ${pid}: ${res.error}`);
        }
      }

      // 5. Exact Homestays
      for (const hid of cleanupStack.homestays) {
        const res = await safeDeleteFixture(adminClient, "homestays", hid);
        if (!res.success && !res.error?.includes("violates foreign key constraint")) {
          console.warn(`  ⚠️ Could not delete test homestay ${hid}: ${res.error}`);
        }
      }

      // 6. Exact Auth Users (always cleanly removable from Supabase Auth)
      for (const uid of cleanupStack.authUsers) {
        const res = await safeDeleteAuthUser(adminClient, uid);
        if (!res.success) {
          console.warn(`  ⚠️ Could not delete test auth user ${uid}: ${res.error}`);
        }
      }

      console.log("✅ Fixture teardown complete. Recovery manifest preserved at:");
      console.log(`   ${manifestPath}`);
      console.log("ℹ️  NOTE: In a disposable staging database, immutable financial ledger rows and associated");
      console.log("    restricted parent records remain append-only by design. Reset or destroy the disposable");
      console.log("    staging database/branch when verification testing is concluded.\n");
    }

    if (results.length > 0) {
      console.table(results);
    }
    if (suiteError) {
      console.error(`\n⚠️  Test suite did not complete all tests due to error: ${suiteError.message}`);
    }
  }

// Standalone manifest cleanup command runner
export async function runManifestCleanup(manifestFilePath) {
  const config = getStagingConfig();
  if (!config.configured) {
    console.error(`Cleanup aborted: ${config.reason}`);
    return;
  }

  if (!fs.existsSync(manifestFilePath)) {
    console.error(`Manifest file not found: ${manifestFilePath}`);
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFilePath, "utf8"));
  } catch (parseErr) {
    console.error(`Failed to parse manifest JSON: ${parseErr.message}`);
    return;
  }

  // VALIDATION 1: Target URL must strictly match current STAGING_SUPABASE_URL
  if (!manifest.targetUrl || manifest.targetUrl !== config.stagingUrl) {
    console.error("⛔ RECOVERY SAFETY HALT: Staging URL mismatch!");
    console.error(`   Manifest target: ${manifest.targetUrl}`);
    console.error(`   Current staging: ${config.stagingUrl}`);
    console.error("   Refusing to run cleanup against an unexpected project URL.");
    return;
  }

  // VALIDATION 2: Verify all IDs in manifest strictly match UUID format
  const allIds = [
    ...(manifest.payments || []),
    ...(manifest.bookings || []),
    ...(manifest.rooms || []),
    ...(manifest.partners || []),
    ...(manifest.homestays || []),
    ...(manifest.authUsers || [])
  ];

  for (const id of allIds) {
    if (!UUID_REGEX.test(id)) {
      console.error(`⛔ RECOVERY SAFETY HALT: Invalid UUID format detected in manifest (${id}). Aborting.`);
      return;
    }
  }

  console.log(`[RECOVERY CLEANUP] Recovering exact fixtures from run ${manifest.runId}...`);
  console.log(`[TARGET PROJECT] ${manifest.targetUrl}`);

  const adminClient = createClient(config.stagingUrl, config.stagingServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Attempt payment cleanup with triggers enabled in exact FK order
  let immCount = 0;
  for (const pid of (manifest.payments || [])) {
    const res = await safeDeleteFixture(adminClient, "payments", pid);
    if (!res.success && res.error?.includes("PAYMENT_LEDGER_IMMUTABLE")) {
      immCount++;
    } else if (!res.success) {
      console.warn(`  ⚠️ Could not delete manifest payment ${pid}: ${res.error}`);
    }
  }
  if (immCount > 0) {
    console.log(`ℹ️  Ledger immutability active: ${immCount} manifest payment(s) protected.`);
  }

  for (const bid of (manifest.bookings || [])) {
    const res = await safeDeleteFixture(adminClient, "bookings", bid);
    if (!res.success && !res.error?.includes("violates foreign key constraint")) {
      console.warn(`  ⚠️ Could not delete manifest booking ${bid}: ${res.error}`);
    }
  }
  for (const rid of (manifest.rooms || [])) {
    const res = await safeDeleteFixture(adminClient, "rooms", rid);
    if (!res.success && !res.error?.includes("violates foreign key constraint")) {
      console.warn(`  ⚠️ Could not delete manifest room ${rid}: ${res.error}`);
    }
  }
  for (const pid of (manifest.partners || [])) {
    const res = await safeDeleteFixture(adminClient, "partners", pid);
    if (!res.success && !res.error?.includes("violates foreign key constraint")) {
      console.warn(`  ⚠️ Could not delete manifest partner ${pid}: ${res.error}`);
    }
  }
  for (const hid of (manifest.homestays || [])) {
    const res = await safeDeleteFixture(adminClient, "homestays", hid);
    if (!res.success && !res.error?.includes("violates foreign key constraint")) {
      console.warn(`  ⚠️ Could not delete manifest homestay ${hid}: ${res.error}`);
    }
  }
  for (const uid of (manifest.authUsers || [])) {
    const res = await safeDeleteAuthUser(adminClient, uid);
    if (!res.success) {
      console.warn(`  ⚠️ Could not delete manifest auth user ${uid}: ${res.error}`);
    }
  }

  console.log("✅ Recovery cleanup complete: Auth users and non-restricted fixtures removed.");
  console.log("ℹ️  Any remaining immutable payments/bookings should be cleared by resetting the disposable staging branch.\n");
}

const args = process.argv.slice(2);
if (args[0] === "--cleanup-manifest" && args[1]) {
  runManifestCleanup(path.resolve(process.cwd(), args[1]));
} else if (process.argv[1]?.endsWith("test_phase1_database_suite.mjs")) {
  runStagingVerificationSuite();
}
