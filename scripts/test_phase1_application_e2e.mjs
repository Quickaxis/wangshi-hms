/**
 * ==============================================================================
 * PHASE 1 APPLICATION-LEVEL E2E VERIFICATION SUITE (STAGING HARNESS)
 * ==============================================================================
 * STRICT DIRECTIVE:
 * - TARGETS ONLY STAGING SUPABASE (vlynqvbmzjyejxnzanrc).
 * - FAILS CLOSED UNCONDITIONALLY IF PRODUCTION (algorrnjotffcvtinbyy) IS DETECTED.
 * - NEVER PRINTS TOKENS, PASSWORDS, OR CREDENTIALS.
 * - TESTS EXACT APPLICATION ACTIONS & CLIENT-SIDE INVARIANTS:
 *   * APP-01: Unauthenticated Route & Data Protection (Access Denied without Session)
 *   * APP-02: Partner Authentication & Tenant-Isolated Data Visibility (Partner Alpha vs Beta)
 *   * APP-03: Atomic Booking Creation with Guests (7-argument RPC Signature C)
 *   * APP-04: Phase 1 Payment Flow & Financial Summary (Advance, Settlement, Refund, Math)
 *   * APP-05: Storage Bucket Upload & Public Read Policy (homestay-logos HTTP 200)
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import assert from "node:assert";
import crypto from "node:crypto";
import fs from "fs";
import path from "path";

// 1. Resolve environment credentials
function getStagingConfig() {
  const stagingUrl = process.env.STAGING_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const stagingServiceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stagingAnonKey = process.env.STAGING_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // HARD FAIL-CLOSED SAFETY CHECK: Reject if production URL detected or missing
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

// 2. Recovery Manifest Management
function saveManifest(runId, stack) {
  const scratchDir = path.resolve(process.cwd(), "scratch");
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }
  const manifestPath = path.join(scratchDir, `staging_manifest_app_${runId}.json`);
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

export async function runApplicationE2ESuite() {
  console.log("=================================================================");
  console.log("  PHASE 1 APPLICATION E2E SUITE (STAGING HARNESS)                ");
  console.log("=================================================================\n");

  const config = getStagingConfig();

  if (!config.configured) {
    console.warn(`🛡️  APPLICATION E2E EXECUTION BLOCKED: ${config.reason}\n`);
    const blockedSummary = [
      { id: "APP-01", name: "Unauthenticated Route & Data Protection", status: "BLOCKED", discrepancy: config.reason },
      { id: "APP-02", name: "Partner Authentication & Tenant Data Isolation", status: "BLOCKED", discrepancy: config.reason },
      { id: "APP-03", name: "Atomic Booking Creation with Guests (7-arg RPC)", status: "BLOCKED", discrepancy: config.reason },
      { id: "APP-04", name: "Payment Lifecycle & Financial Summary Invariants", status: "BLOCKED", discrepancy: config.reason },
      { id: "APP-05", name: "Storage Logo Upload & Public Policy Verification", status: "BLOCKED", discrepancy: config.reason },
    ];
    console.table(blockedSummary);
    console.log("\n⚠️ Production remained completely untouched.\n");
    return { status: "BLOCKED", results: blockedSummary };
  }

  console.log("🚀 Staging credentials verified (vlynqvbmzjyejxnzanrc).");
  console.log("Initializing synthetic application E2E verification...\n");

  const adminClient = createClient(config.stagingUrl, config.stagingServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const testRunId = crypto.randomUUID().slice(0, 8);
  const testPassword = `E2EPass_${testRunId}!_${crypto.randomUUID().slice(0, 6)}`;

  const cleanupStack = {
    runId: testRunId,
    timestamp: new Date().toISOString(),
    targetUrl: config.stagingUrl,
    payments: [],
    bookings: [],
    rooms: [],
    partners: [],
    homestays: [],
    authUsers: [],
    storageFiles: []
  };

  const manifestPath = saveManifest(testRunId, cleanupStack);
  console.log(`[MANIFEST] Recovery manifest initialized: ${manifestPath}\n`);

  const results = [];
  let suiteError = null;

  try {
    // -----------------------------------------------------------------
    // SETUP: Provision isolated synthetic tenants for application tests
    // -----------------------------------------------------------------
    console.log(`[SETUP] Provisioning synthetic E2E tenants (Run ID: ${testRunId})...`);

    // 1. Homestays
    const { data: hsAlpha, error: hsAlphaErr } = await adminClient
      .from("homestays")
      .insert({ name: `App E2E Alpha ${testRunId}`, slug: `app-alpha-${testRunId}`, is_active: true })
      .select("id, name").single();
    if (hsAlphaErr || !hsAlpha) throw new Error(`Setup failed (HS Alpha): ${hsAlphaErr?.message}`);
    cleanupStack.homestays.push(hsAlpha.id);

    const { data: hsBeta, error: hsBetaErr } = await adminClient
      .from("homestays")
      .insert({ name: `App E2E Beta ${testRunId}`, slug: `app-beta-${testRunId}`, is_active: true })
      .select("id, name").single();
    if (hsBetaErr || !hsBeta) throw new Error(`Setup failed (HS Beta): ${hsBetaErr?.message}`);
    cleanupStack.homestays.push(hsBeta.id);

    // 2. Auth Users
    const emailAlpha = `app.partner.alpha.${testRunId}@test-staging.com`;
    const { data: authAlpha, error: authAlphaErr } = await adminClient.auth.admin.createUser({
      email: emailAlpha,
      password: testPassword,
      email_confirm: true
    });
    if (authAlphaErr || !authAlpha?.user) throw new Error(`Setup failed (Auth Alpha): ${authAlphaErr?.message}`);
    cleanupStack.authUsers.push(authAlpha.user.id);

    const emailBeta = `app.partner.beta.${testRunId}@test-staging.com`;
    const { data: authBeta, error: authBetaErr } = await adminClient.auth.admin.createUser({
      email: emailBeta,
      password: testPassword,
      email_confirm: true
    });
    if (authBetaErr || !authBeta?.user) throw new Error(`Setup failed (Auth Beta): ${authBetaErr?.message}`);
    cleanupStack.authUsers.push(authBeta.user.id);

    // 3. Partner Profiles
    const { data: partnerAlpha, error: partnerAlphaErr } = await adminClient
      .from("partners")
      .insert({
        name: `App Partner Alpha ${testRunId}`,
        email: emailAlpha,
        homestay_id: hsAlpha.id,
        auth_user_id: authAlpha.user.id,
        role: "partner",
        is_active: true
      })
      .select("id, name").single();
    if (partnerAlphaErr || !partnerAlpha) throw new Error(`Setup failed (Partner Alpha): ${partnerAlphaErr?.message}`);
    cleanupStack.partners.push(partnerAlpha.id);

    const { data: partnerBeta, error: partnerBetaErr } = await adminClient
      .from("partners")
      .insert({
        name: `App Partner Beta ${testRunId}`,
        email: emailBeta,
        homestay_id: hsBeta.id,
        auth_user_id: authBeta.user.id,
        role: "partner",
        is_active: true
      })
      .select("id, name").single();
    if (partnerBetaErr || !partnerBeta) throw new Error(`Setup failed (Partner Beta): ${partnerBetaErr?.message}`);
    cleanupStack.partners.push(partnerBeta.id);

    // 4. Room Fixture
    const { data: roomAlpha, error: roomAlphaErr } = await adminClient
      .from("rooms")
      .insert({
        room_number: `APP-A-${testRunId}`,
        name: `Deluxe Suite ${testRunId}`,
        homestay_id: hsAlpha.id,
        nightly_rate: 4500,
        max_guests: 4,
        is_active: true
      })
      .select("id, name, nightly_rate").single();
    if (roomAlphaErr || !roomAlpha) throw new Error(`Setup failed (Room Alpha): ${roomAlphaErr?.message}`);
    cleanupStack.rooms.push(roomAlpha.id);

    const { data: roomBeta, error: roomBetaErr } = await adminClient
      .from("rooms")
      .insert({
        room_number: `APP-B-${testRunId}`,
        name: `Standard Room ${testRunId}`,
        homestay_id: hsBeta.id,
        nightly_rate: 3000,
        max_guests: 2,
        is_active: true
      })
      .select("id, name, nightly_rate").single();
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

    console.log("✅ Genuine client sessions authenticated for Partner Alpha & Beta.\n");

    // -----------------------------------------------------------------
    // TEST APP-01: Unauthenticated Route & Data Protection
    // -----------------------------------------------------------------
    try {
      const anonClient = createClient(config.stagingUrl, config.stagingAnonKey);
      
      // Attempt to read bookings anonymously
      const { data: anonBookings, error: anonBookingsErr } = await anonClient
        .from("bookings")
        .select("*");
      
      // In Supabase with RLS enabled, anon select returns empty array or error
      if (anonBookings && anonBookings.length > 0) {
        throw new Error("SECURITY LEAK: Unauthenticated client read booking records!");
      }

      // Attempt to read payments anonymously
      const { data: anonPayments, error: anonPaymentsErr } = await anonClient
        .from("payments")
        .select("*");

      if (anonPayments && anonPayments.length > 0) {
        throw new Error("SECURITY LEAK: Unauthenticated client read payment records!");
      }

      results.push({ id: "APP-01", name: "Unauthenticated Route & Data Protection", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "APP-01", name: "Unauthenticated Route & Data Protection", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST APP-02: Partner Authentication & Tenant-Isolated Data Visibility
    // -----------------------------------------------------------------
    try {
      // 1. Partner Alpha queries rooms -> must only see Room Alpha
      const { data: alphaRooms, error: alphaRoomsErr } = await clientAlpha
        .from("rooms")
        .select("id, name, homestay_id");
      if (alphaRoomsErr) throw new Error(`Alpha rooms query failed: ${alphaRoomsErr.message}`);
      
      const leakedBetaRoom = (alphaRooms || []).some(r => r.homestay_id === hsBeta.id);
      if (leakedBetaRoom) throw new Error("TENANT LEAK: Partner Alpha saw Room Beta!");

      const sawAlphaRoom = (alphaRooms || []).some(r => r.id === roomAlpha.id);
      if (!sawAlphaRoom) throw new Error("Partner Alpha cannot see own room!");

      // 2. Partner Beta queries rooms -> must only see Room Beta
      const { data: betaRooms, error: betaRoomsErr } = await clientBeta
        .from("rooms")
        .select("id, name, homestay_id");
      if (betaRoomsErr) throw new Error(`Beta rooms query failed: ${betaRoomsErr.message}`);

      const leakedAlphaRoom = (betaRooms || []).some(r => r.homestay_id === hsAlpha.id);
      if (leakedAlphaRoom) throw new Error("TENANT LEAK: Partner Beta saw Room Alpha!");

      results.push({ id: "APP-02", name: "Partner Authentication & Tenant Data Isolation", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "APP-02", name: "Partner Authentication & Tenant Data Isolation", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST APP-03: Atomic Booking Creation with Guests (7-arg RPC Signature C)
    // -----------------------------------------------------------------
    let createdBookingId = null;
    try {
      // Dates: 3 nights (2027-06-10 to 2027-06-13)
      const checkIn = "2027-06-10";
      const checkOut = "2027-06-13";
      const nights = 3;
      const expectedTotal = roomAlpha.nightly_rate * nights; // 4500 * 3 = 13500

      const guestPayload = [
        { name: "John Doe (Primary)", is_primary: true, phone: "9876543210", email: "johndoe@example.com" },
        { name: "Jane Doe (Guest 2)", is_primary: false, phone: "9876543211", email: null }
      ];

      // Invoke canonical 7-arg create_booking_atomic RPC
      const { data: bookingId, error: rpcError } = await clientAlpha.rpc("create_booking_atomic", {
        p_room_id: roomAlpha.id,
        p_partner_id: partnerAlpha.id,
        p_check_in: checkIn,
        p_check_out: checkOut,
        p_number_of_guests: 2,
        p_notes: "App E2E Booking Verification",
        p_guests: guestPayload
      });

      if (rpcError || !bookingId) {
        throw new Error(`RPC create_booking_atomic failed: ${rpcError?.message} (code ${rpcError?.code})`);
      }

      createdBookingId = bookingId;
      cleanupStack.bookings.push(bookingId);
      saveManifest(testRunId, cleanupStack);

      // Verify booking row persisted correctly with matching rate and tenant
      const { data: verifiedBooking, error: fetchBookingErr } = await clientAlpha
        .from("bookings")
        .select("id, room_id, homestay_id, check_in, check_out, nightly_rate, total_amount, status")
        .eq("id", bookingId)
        .single();

      if (fetchBookingErr || !verifiedBooking) {
        throw new Error(`Failed to fetch created booking: ${fetchBookingErr?.message}`);
      }

      if (Number(verifiedBooking.total_amount) !== expectedTotal) {
        throw new Error(`Total amount mismatch: expected ${expectedTotal}, got ${verifiedBooking.total_amount}`);
      }

      if (verifiedBooking.homestay_id !== hsAlpha.id) {
        throw new Error(`Homestay ID mismatch on booking: expected ${hsAlpha.id}, got ${verifiedBooking.homestay_id}`);
      }

      // Verify guest rows created in guests table with correct homestay_id
      const { data: guests, error: fetchGuestsErr } = await clientAlpha
        .from("guests")
        .select("id, name, booking_id, homestay_id, is_primary")
        .eq("booking_id", bookingId);

      if (fetchGuestsErr || !guests || guests.length !== 2) {
        throw new Error(`Expected 2 guests inserted by RPC, found: ${guests?.length} (error: ${fetchGuestsErr?.message})`);
      }

      for (const g of guests) {
        if (g.homestay_id !== hsAlpha.id) {
          throw new Error(`Guest homestay_id mismatch: expected ${hsAlpha.id}, got ${g.homestay_id}`);
        }
      }

      results.push({ id: "APP-03", name: "Atomic Booking Creation with Guests (7-arg RPC)", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "APP-03", name: "Atomic Booking Creation with Guests (7-arg RPC)", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST APP-04: Payment Lifecycle & Financial Summary Invariants
    // -----------------------------------------------------------------
    try {
      if (!createdBookingId) {
        throw new Error("Skipped: createdBookingId missing due to APP-03 failure");
      }

      // Step 1: Record Advance Payment of ₹4,500.00 cash
      const { data: advPayment, error: advPaymentErr } = await clientAlpha
        .from("payments")
        .insert({
          homestay_id: hsAlpha.id,
          booking_id: createdBookingId,
          amount: 4500.00,
          payment_type: "payment",
          payment_method: "cash",
          recorded_by: partnerAlpha.id,
          notes: "Advance deposit"
        })
        .select("id, amount, payment_type").single();

      if (advPaymentErr || !advPayment) {
        throw new Error(`Advance payment failed: ${advPaymentErr?.message}`);
      }
      cleanupStack.payments.push(advPayment.id);
      saveManifest(testRunId, cleanupStack);

      // Step 2: Record Settlement Payment of remaining ₹9,000.00 bank transfer
      const { data: settlePayment, error: settlePaymentErr } = await clientAlpha
        .from("payments")
        .insert({
          homestay_id: hsAlpha.id,
          booking_id: createdBookingId,
          amount: 9000.00,
          payment_type: "payment",
          payment_method: "bank_transfer",
          recorded_by: partnerAlpha.id,
          notes: "Final settlement"
        })
        .select("id, amount, payment_type").single();

      if (settlePaymentErr || !settlePayment) {
        throw new Error(`Settlement payment failed: ${settlePaymentErr?.message}`);
      }
      cleanupStack.payments.push(settlePayment.id);
      saveManifest(testRunId, cleanupStack);

      // Step 3: Record Partial Refund of ₹1,500.00 (linked to Advance Payment)
      const { data: refundPayment, error: refundPaymentErr } = await clientAlpha
        .from("payments")
        .insert({
          homestay_id: hsAlpha.id,
          booking_id: createdBookingId,
          amount: 1500.00,
          payment_type: "refund",
          payment_method: "cash",
          parent_payment_id: advPayment.id,
          recorded_by: partnerAlpha.id,
          notes: "Partial refund for early departure"
        })
        .select("id, amount, payment_type").single();

      if (refundPaymentErr || !refundPayment) {
        throw new Error(`Partial refund failed: ${refundPaymentErr?.message}`);
      }
      cleanupStack.payments.push(refundPayment.id);
      saveManifest(testRunId, cleanupStack);

      // Step 4: Verify Financial Summary Calculations
      // Total Booking Amount: ₹13,500.00
      // Total Paid: ₹4,500 + ₹9,000 = ₹13,500.00
      // Total Refunded: ₹1,500.00
      // Net Cash Collected: ₹13,500 - ₹1,500 = ₹12,000.00
      // Balance Due: ₹13,500 - ₹12,000 = ₹1,500.00
      const { data: allPayments, error: fetchAllErr } = await clientAlpha
        .from("payments")
        .select("amount, payment_type")
        .eq("booking_id", createdBookingId);

      if (fetchAllErr || !allPayments) {
        throw new Error(`Failed to fetch booking payments: ${fetchAllErr?.message}`);
      }

      let totalPaid = 0;
      let totalRefunded = 0;
      for (const p of allPayments) {
        const amt = Number(p.amount);
        if (p.payment_type === "payment") totalPaid += amt;
        if (p.payment_type === "refund") totalRefunded += amt;
      }
      const netCash = totalPaid - totalRefunded;
      const expectedTotalAmount = 13500;
      const balanceDue = expectedTotalAmount - netCash;

      if (totalPaid !== 13500 || totalRefunded !== 1500 || netCash !== 12000 || balanceDue !== 1500) {
        throw new Error(`Financial math discrepancy: totalPaid=${totalPaid}, totalRefunded=${totalRefunded}, netCash=${netCash}, balanceDue=${balanceDue}`);
      }

      // Step 5: Verify Ledger Immutability in Application Layer
      // Attempt to modify payment amount -> MUST BE BLOCKED
      const { error: modifyErr } = await clientAlpha
        .from("payments")
        .update({ amount: 99999 })
        .eq("id", advPayment.id);

      if (!modifyErr) {
        throw new Error("IMMUTABILITY VULNERABILITY: Payment update succeeded without error!");
      }

      results.push({ id: "APP-04", name: "Payment Lifecycle & Financial Summary Invariants", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "APP-04", name: "Payment Lifecycle & Financial Summary Invariants", status: "FAIL", discrepancy: err.message });
    }

    // -----------------------------------------------------------------
    // TEST APP-05: Storage Logo Upload & Public Policy Verification
    // -----------------------------------------------------------------
    try {
      // 1. Create minimal 1x1 synthetic PNG buffer
      const pngBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );

      const fileName = `${hsAlpha.id}/synthetic-logo-${testRunId}.png`;

      // 2. Upload to storage bucket 'homestay-logos' using admin client
      const { data: uploadData, error: uploadErr } = await adminClient.storage
        .from("homestay-logos")
        .upload(fileName, pngBuffer, {
          contentType: "image/png",
          upsert: true
        });

      if (uploadErr) {
        throw new Error(`Storage upload failed: ${uploadErr.message}`);
      }
      cleanupStack.storageFiles.push(fileName);
      saveManifest(testRunId, cleanupStack);

      // 3. Obtain public URL
      const { data: publicUrlData } = adminClient.storage
        .from("homestay-logos")
        .getPublicUrl(fileName);

      if (!publicUrlData?.publicUrl) {
        throw new Error("Failed to resolve storage public URL");
      }

      // 4. Verify public readability via standard HTTP GET (simulating web browser image load)
      const resp = await fetch(publicUrlData.publicUrl);
      if (resp.status !== 200) {
        throw new Error(`Public read policy failed: HTTP ${resp.status} on ${publicUrlData.publicUrl}`);
      }

      const contentType = resp.headers.get("content-type");
      if (!contentType?.includes("image")) {
        throw new Error(`Unexpected Content-Type returned: ${contentType}`);
      }

      // 5. Clean up test storage file
      await adminClient.storage.from("homestay-logos").remove([fileName]);

      results.push({ id: "APP-05", name: "Storage Logo Upload & Public Policy Verification", status: "PASS", discrepancy: "None" });
    } catch (err) {
      results.push({ id: "APP-05", name: "Storage Logo Upload & Public Policy Verification", status: "FAIL", discrepancy: err.message });
    }

  } catch (err) {
    suiteError = err;
    console.error(`\n❌ [APPLICATION E2E HALTED]: ${err.message}`);
  } finally {
    // -----------------------------------------------------------------
    // CLEANUP: Strictly Fixture-Scoped Teardown
    // -----------------------------------------------------------------
    console.log("\n[CLEANUP] Cleaning up exact test fixtures...");

    // Storage files
    for (const f of cleanupStack.storageFiles) {
      try {
        await adminClient.storage.from("homestay-logos").remove([f]);
      } catch (_) {}
    }

    // Payments (immutable, expected to be protected)
    for (const pid of cleanupStack.payments) {
      await safeDeleteFixture(adminClient, "payments", pid);
    }

    // Bookings, Rooms, Partners, Homestays (FK restricted by payments)
    for (const bid of cleanupStack.bookings) await safeDeleteFixture(adminClient, "bookings", bid);
    for (const rid of cleanupStack.rooms) await safeDeleteFixture(adminClient, "rooms", rid);
    for (const pid of cleanupStack.partners) await safeDeleteFixture(adminClient, "partners", pid);
    for (const hid of cleanupStack.homestays) await safeDeleteFixture(adminClient, "homestays", hid);

    // Auth Users (cleanly removable from Supabase Auth)
    for (const uid of cleanupStack.authUsers) {
      await safeDeleteAuthUser(adminClient, uid);
    }

    console.log(`✅ Cleanup complete. Recovery manifest preserved at:\n   ${manifestPath}\n`);
  }

  console.table(results);
  if (suiteError) {
    console.error(`\n⚠️  E2E suite encountered an error: ${suiteError.message}`);
  }
  return { status: suiteError ? "ERROR" : "COMPLETED", results };
}

// Auto-run if executed directly via CLI
if (process.argv[1]?.endsWith("test_phase1_application_e2e.mjs")) {
  runApplicationE2ESuite().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
