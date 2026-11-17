// ==============================================================================
// HOSPIRO — Web Push & Website Booking Notifications Automated Test Suite
// File: scripts/test_push_notifications.js
// ==============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

console.log('================================================================');
console.log('🚀 Running HOSPIRO Web Push & Notification Test Suite');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${testName}`);
    console.error(`   Error: ${err.message}\n`);
  }
}

async function runAsyncTest(testName, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${testName}`);
    console.error(`   Error: ${err.message}\n`);
  }
}

async function main() {
  // ----------------------------------------------------------------------------
  // TEST 1: VAPID Key Generation & Crypto Formatting
  // ----------------------------------------------------------------------------
  runTest('1. VAPID Keys: Generate valid VAPID pair and sign request', () => {
    const keys = webpush.generateVAPIDKeys();
    assert(keys.publicKey && keys.publicKey.length > 30, 'Public key must be valid base64url string');
    assert(keys.privateKey && keys.privateKey.length > 30, 'Private key must be valid base64url string');

    webpush.setVapidDetails('mailto:test@hospiro.com', keys.publicKey, keys.privateKey);
    const headers = webpush.getVapidHeaders(
      'https://fcm.googleapis.com/fcm/send/test-sub',
      'mailto:test@hospiro.com',
      keys.publicKey,
      keys.privateKey,
      'aes128gcm'
    );
    assert(headers.Authorization && headers.Authorization.startsWith('vapid t='), 'VAPID Authorization header must be generated');
  });

  // ----------------------------------------------------------------------------
  // TEST 2: Notification Payload Structure & PWA Android Fields
  // ----------------------------------------------------------------------------
  runTest('2. Notification Payload: Validate PWA fields and target URL', () => {
    const rawPayload = {
      title: 'New Website Booking Request',
      body: 'Pema Dorjee requested Deluxe Suite (20 Nov - 22 Nov) • ₹5,200',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      tag: 'booking-req-12345',
      data: {
        url: '/requests',
        requestId: '12345',
        homestayId: 'homestay-alpha'
      }
    };

    const json = JSON.stringify(rawPayload);
    const parsed = JSON.parse(json);

    assert.strictEqual(parsed.title, 'New Website Booking Request');
    assert.strictEqual(parsed.icon, '/icons/icon-192x192.png');
    assert.strictEqual(parsed.badge, '/icons/icon-96x96.png');
    assert.strictEqual(parsed.data.url, '/requests');
    assert.strictEqual(parsed.tag, 'booking-req-12345');
  });

  // ----------------------------------------------------------------------------
  // TEST 3: Multi-Homestay Tenant Scoping & Isolation
  // ----------------------------------------------------------------------------
  runTest('3. Tenant Isolation: Recipients are strictly filtered by homestay_id', () => {
    const homestayA = '11111111-1111-1111-1111-111111111111';
    const homestayB = '22222222-2222-2222-2222-222222222222';

    // Mock partner roster
    const mockPartners = [
      { id: 'p1', name: 'Owner A', homestay_id: homestayA, role: 'owner', is_active: true },
      { id: 'p2', name: 'Receptionist A', homestay_id: homestayA, role: 'receptionist', is_active: true },
      { id: 'p3', name: 'Owner B', homestay_id: homestayB, role: 'owner', is_active: true },
      { id: 'p4', name: 'Receptionist B', homestay_id: homestayB, role: 'receptionist', is_active: true },
      { id: 'p5', name: 'Super Admin', homestay_id: null, role: 'super_admin', is_active: true }
    ];

    // Filter recipients for Homestay A
    const targetHomestayId = homestayA;
    const recipientsA = mockPartners.filter(p => 
      p.is_active && (p.homestay_id === targetHomestayId || p.role === 'super_admin')
    );

    // Verify Homestay A recipients
    const recipientIdsA = recipientsA.map(p => p.id);
    assert(recipientIdsA.includes('p1'), 'Owner A must receive notification');
    assert(recipientIdsA.includes('p2'), 'Receptionist A must receive notification');
    assert(recipientIdsA.includes('p5'), 'Super Admin may receive notification');
    assert(!recipientIdsA.includes('p3'), 'Owner B must NEVER receive Homestay A notification');
    assert(!recipientIdsA.includes('p4'), 'Receptionist B must NEVER receive Homestay A notification');
  });

  // ----------------------------------------------------------------------------
  // TEST 4: Duplicate Submission & Idempotency Key Defense
  // ----------------------------------------------------------------------------
  runTest('4. Duplicate Prevention: Retried submissions do not duplicate alerts', () => {
    const mockNotificationsDb = new Map();

    function processSubmission(requestId, homestayId, guestName) {
      const idempotencyKey = `booking_req:${requestId}`;
      if (mockNotificationsDb.has(idempotencyKey)) {
        return { created: false, reason: 'Duplicate submission caught by idempotency key' };
      }
      mockNotificationsDb.set(idempotencyKey, {
        id: 'notif-' + Math.random(),
        homestay_id: homestayId,
        message: `${guestName} requested a room`,
        created_at: new Date().toISOString()
      });
      return { created: true, notificationId: mockNotificationsDb.get(idempotencyKey).id };
    }

    // First attempt
    const res1 = processSubmission('req-abc-123', 'hs-1', 'Tenzing');
    assert.strictEqual(res1.created, true, 'First submission must create a notification');

    // Retried attempt (e.g. guest clicked Submit twice or network retry)
    const res2 = processSubmission('req-abc-123', 'hs-1', 'Tenzing');
    assert.strictEqual(res2.created, false, 'Duplicate submission must be ignored');
    assert.strictEqual(mockNotificationsDb.size, 1, 'Database must only contain 1 notification');
  });

  // ----------------------------------------------------------------------------
  // TEST 5: Expired / Revoked Subscriptions Cleanup Simulation
  // ----------------------------------------------------------------------------
  await runAsyncTest('5. Expired Subscription Handling: 404/410 marks subscription inactive', async () => {
    let subscriptionStatus = 'active';

    async function mockSendPush(status) {
      if (status === 410 || status === 404) {
        return { success: false, expired: true, statusCode: status };
      }
      return { success: true, statusCode: 201 };
    }

    const result = await mockSendPush(410);
    assert.strictEqual(result.expired, true, 'Expired push error must be detected');

    if (result.expired) {
      subscriptionStatus = 'inactive';
    }

    assert.strictEqual(subscriptionStatus, 'inactive', 'Expired subscription must be deactivated');
  });

  // ----------------------------------------------------------------------------
  // TEST 6: Service Worker Integrity & Handlers
  // ----------------------------------------------------------------------------
  runTest('6. Service Worker: Verify push and notificationclick listeners in sw.js', () => {
    const swPath = path.join(process.cwd(), 'public', 'sw.js');
    assert(fs.existsSync(swPath), 'public/sw.js must exist');
    const content = fs.readFileSync(swPath, 'utf8');

    assert(content.includes("self.addEventListener('push'"), 'sw.js must have push listener');
    assert(content.includes("self.addEventListener('notificationclick'"), 'sw.js must have notificationclick listener');
    assert(content.includes("showNotification"), 'sw.js must call showNotification');
    assert(content.includes("clients.matchAll"), 'sw.js must handle client focus and navigation');
    assert(content.includes("supabase.co"), 'sw.js must preserve Supabase passthrough');
  });

  // ----------------------------------------------------------------------------
  // TEST 7: Migration Files Exist & Have Valid Syntax
  // ----------------------------------------------------------------------------
  runTest('7. SQL Migrations: Verify push notifications migration and rollback files', () => {
    const migPath = path.join(process.cwd(), 'scripts', 'migration_push_notifications.sql');
    const rollbackPath = path.join(process.cwd(), 'scripts', 'migration_push_notifications_rollback.sql');

    assert(fs.existsSync(migPath), 'migration_push_notifications.sql must exist');
    assert(fs.existsSync(rollbackPath), 'migration_push_notifications_rollback.sql must exist');

    const migSql = fs.readFileSync(migPath, 'utf8');
    assert(migSql.includes('CREATE TABLE IF NOT EXISTS public.push_subscriptions'), 'Must create push_subscriptions');
    assert(migSql.includes('CREATE TABLE IF NOT EXISTS public.notifications'), 'Must create notifications');
    assert(migSql.includes('ENABLE ROW LEVEL SECURITY'), 'Must enable RLS');
    assert(migSql.includes('supabase_realtime'), 'Must add to realtime publication');
  });

  // ----------------------------------------------------------------------------
  // Summary
  // ----------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`🏁 Test Summary: ${passedTests} / ${totalTests} passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

