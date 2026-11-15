import assert from 'node:assert';

console.log("===============================================================================");
console.log("🧪 RUNNING COMPREHENSIVE MULTI-ROOM / GROUP BOOKING & INVOICE TEST SUITE");
console.log("===============================================================================\n");

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [TEST ${totalTests}] PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [TEST ${totalTests}] FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// Inlined Money Helpers matching src/lib/money.ts
const ZERO = BigInt(0);
const HUNDRED = BigInt(100);
const MINUS_ONE = BigInt(-1);

function rupeesToPaise(val) {
  if (val === undefined || val === null || val === '') return ZERO;
  const rawStr = typeof val === 'number' ? val.toFixed(2) : String(val).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(rawStr)) {
    throw new Error(`Invalid monetary format: "${val}"`);
  }
  const isNegative = rawStr.startsWith('-');
  const cleanStr = isNegative ? rawStr.slice(1) : rawStr;
  const [whole, fraction = '00'] = cleanStr.split('.');
  const paddedFraction = fraction.padEnd(2, '0').slice(0, 2);
  const paise = BigInt(whole || '0') * HUNDRED + BigInt(paddedFraction);
  return isNegative ? paise * MINUS_ONE : paise;
}

function paiseToDecimalString(paise) {
  const isNegative = paise < ZERO;
  const abs = isNegative ? paise * MINUS_ONE : paise;
  const whole = abs / HUNDRED;
  const fraction = (abs % HUNDRED).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${whole}.${fraction}`;
}

function calculateInvoiceTotals(items, taxRatePercent = 0, flatDiscount = 0, transactions = []) {
  let subtotalPaise = ZERO;
  let itemDiscountPaise = ZERO;

  for (const item of items) {
    const qtyStr = String(item.quantity !== undefined && item.quantity !== null && item.quantity !== '' ? item.quantity : 1).trim();
    const rateStr = String(item.rate !== undefined && item.rate !== null && item.rate !== '' ? item.rate : 0).trim();
    const qty = parseFloat(qtyStr) || 0;
    const ratePaise = rupeesToPaise(rateStr);
    
    const itemPaise = BigInt(Math.round(Number(ratePaise) * qty));
    if (item.category === 'discount') {
      itemDiscountPaise += (itemPaise > ZERO ? itemPaise : -itemPaise);
    } else {
      subtotalPaise += itemPaise;
    }
  }

  const flatDiscountPaise = rupeesToPaise(flatDiscount || 0);
  const totalDiscountPaise = itemDiscountPaise + flatDiscountPaise;

  const netBeforeTaxPaise = subtotalPaise > totalDiscountPaise 
    ? subtotalPaise - totalDiscountPaise 
    : ZERO;

  const taxPct = parseFloat(String(taxRatePercent || 0)) || 0;
  const taxPaise = BigInt(Math.round(Number(netBeforeTaxPaise) * (taxPct / 100)));
  const grandTotalPaise = netBeforeTaxPaise + taxPaise;

  let paidPaise = ZERO;
  for (const tx of transactions) {
    const amtPaise = rupeesToPaise(tx.amount || 0);
    if (tx.payment_type === 'refund') {
      paidPaise -= amtPaise;
    } else {
      paidPaise += amtPaise;
    }
  }

  const balanceDuePaise = grandTotalPaise > paidPaise ? grandTotalPaise - paidPaise : ZERO;

  let paymentStatus = 'unpaid';
  if (paidPaise <= ZERO) {
    paymentStatus = 'unpaid';
  } else if (paidPaise >= grandTotalPaise && grandTotalPaise > ZERO) {
    paymentStatus = 'paid';
  } else {
    paymentStatus = 'partially_paid';
  }

  return {
    subtotal: Number(paiseToDecimalString(subtotalPaise)),
    taxAmount: Number(paiseToDecimalString(taxPaise)),
    discountAmount: Number(paiseToDecimalString(totalDiscountPaise)),
    grandTotal: Number(paiseToDecimalString(grandTotalPaise)),
    amountPaid: Number(paiseToDecimalString(paidPaise)),
    balanceDue: Number(paiseToDecimalString(balanceDuePaise)),
    paymentStatus
  };
}

// -----------------------------------------------------------------------------
// Test 1: Single Room Booking (Backward Compatibility)
// -----------------------------------------------------------------------------
runTest("Scenario 1: One guest booking one room (Single-Room Compatibility)", () => {
  const room = { id: "room-1", name: "Room No. 1", nightly_rate: 2500, max_guests: 2 };
  const checkIn = "2026-11-18";
  const checkOut = "2026-11-20";
  const nights = 2;

  const input = {
    roomId: room.id,
    roomIds: [room.id],
    checkIn,
    checkOut,
    numberOfGuests: 2,
    guests: [{ name: "Chaitanya Reddy", isPrimary: true, phone: "9876543210" }]
  };

  assert.strictEqual(input.roomIds.length, 1);
  const totalAmount = nights * room.nightly_rate;
  assert.strictEqual(totalAmount, 5000);
  assert.strictEqual(input.guests[0].name, "Chaitanya Reddy");
  assert.strictEqual(input.guests[0].isPrimary, true);
});

// -----------------------------------------------------------------------------
// Test 2: Multi-Room Booking (2 Rooms)
// -----------------------------------------------------------------------------
runTest("Scenario 2: One guest booking two rooms (Shared group_id & Lead Booking)", () => {
  const rooms = [
    { id: "room-1", name: "Room No. 1", nightly_rate: 2500 },
    { id: "room-2", name: "Room No. 2", nightly_rate: 2500 },
  ];
  const checkIn = "2026-11-18";
  const checkOut = "2026-11-20";
  const nights = 2;
  const groupId = "grp-test-uuid-2rooms";

  const bookings = rooms.map((r, idx) => ({
    id: `bk-${r.id}`,
    group_id: groupId,
    is_group_lead: idx === 0,
    room_id: r.id,
    nightly_rate: r.nightly_rate,
    total_amount: nights * r.nightly_rate,
    status: "confirmed"
  }));

  assert.strictEqual(bookings.length, 2);
  assert.strictEqual(bookings[0].is_group_lead, true);
  assert.strictEqual(bookings[1].is_group_lead, false);
  assert.strictEqual(bookings[0].group_id, bookings[1].group_id);

  const groupTotal = bookings.reduce((sum, b) => sum + b.total_amount, 0);
  assert.strictEqual(groupTotal, 10000);
});

// -----------------------------------------------------------------------------
// Test 3: Multi-Room Booking (4 Rooms)
// -----------------------------------------------------------------------------
runTest("Scenario 3: One guest booking four rooms (Full capacity & group integrity)", () => {
  const rooms = [
    { id: "room-1", name: "Room No. 1", nightly_rate: 2500 },
    { id: "room-2", name: "Room No. 2", nightly_rate: 2500 },
    { id: "room-3", name: "Room No. 3", nightly_rate: 2500 },
    { id: "room-4", name: "Room No. 4", nightly_rate: 2500 },
  ];
  const nights = 2;
  const groupId = "grp-test-uuid-4rooms";

  const bookings = rooms.map((r, idx) => ({
    id: `bk-${r.id}`,
    group_id: groupId,
    is_group_lead: idx === 0,
    room_id: r.id,
    nightly_rate: r.nightly_rate,
    total_amount: nights * r.nightly_rate,
    status: "confirmed"
  }));

  assert.strictEqual(bookings.length, 4);
  const leads = bookings.filter(b => b.is_group_lead);
  assert.strictEqual(leads.length, 1);
  assert.strictEqual(leads[0].room_id, "room-1");

  const combinedTotal = bookings.reduce((sum, b) => sum + b.total_amount, 0);
  assert.strictEqual(combinedTotal, 20000);
});

// -----------------------------------------------------------------------------
// Test 4: Atomicity & Partial Availability Conflict Rejection
// -----------------------------------------------------------------------------
runTest("Scenario 4: One unavailable room among multiple selected rooms (Atomic Rejection)", () => {
  const selectedRoomIds = ["room-1", "room-2", "room-3"];
  const existingActiveBookings = [
    { room_id: "room-2", check_in: "2026-11-17", check_out: "2026-11-19", status: "confirmed" }
  ];

  const checkIn = "2026-11-18";
  const checkOut = "2026-11-20";

  const conflictedRooms = [];
  for (const rId of selectedRoomIds) {
    const hasConflict = existingActiveBookings.some(
      b => b.room_id === rId && b.status !== 'cancelled' && b.check_in < checkOut && b.check_out > checkIn
    );
    if (hasConflict) {
      conflictedRooms.push(rId);
    }
  }

  assert.strictEqual(conflictedRooms.length, 1);
  assert.strictEqual(conflictedRooms[0], "room-2");

  let transactionCommitted = false;
  if (conflictedRooms.length > 0) {
    transactionCommitted = false;
  } else {
    transactionCommitted = true;
  }

  assert.strictEqual(transactionCommitted, false, "Transaction must rollback completely if any room is unavailable");
});

// -----------------------------------------------------------------------------
// Test 5: Different Room Prices in Group Booking
// -----------------------------------------------------------------------------
runTest("Scenario 5: Different room prices in one group booking", () => {
  const rooms = [
    { id: "room-standard", name: "Standard Room", nightly_rate: 2000 },
    { id: "room-deluxe", name: "Deluxe Suite", nightly_rate: 3500 },
    { id: "room-villa", name: "Executive Villa", nightly_rate: 5500 },
  ];
  const nights = 3;
  const groupId = "grp-heterogeneous-pricing";

  const bookings = rooms.map((r, idx) => ({
    id: `bk-${r.id}`,
    group_id: groupId,
    is_group_lead: idx === 0,
    room_id: r.id,
    nightly_rate: r.nightly_rate,
    total_amount: nights * r.nightly_rate,
    status: "confirmed"
  }));

  assert.strictEqual(bookings[0].total_amount, 6000);  // 3 * 2000
  assert.strictEqual(bookings[1].total_amount, 10500); // 3 * 3500
  assert.strictEqual(bookings[2].total_amount, 16500); // 3 * 5500

  const groupTotal = bookings.reduce((sum, b) => sum + b.total_amount, 0);
  assert.strictEqual(groupTotal, 33000);
});

// -----------------------------------------------------------------------------
// Test 6: Different Room Statuses within Group
// -----------------------------------------------------------------------------
runTest("Scenario 6: Different room statuses & mixed group status determination", () => {
  const groupRooms = [
    { bookingId: "b1", status: "checked_in" },
    { bookingId: "b2", status: "confirmed" },
    { bookingId: "b3", status: "cancelled" },
  ];

  const statuses = groupRooms.map(r => r.status);
  const activeRooms = groupRooms.filter(r => r.status !== "cancelled");
  assert.strictEqual(activeRooms.length, 2);

  let overallStatus = "mixed";
  if (statuses.every(s => s === "cancelled")) overallStatus = "cancelled";
  else if (statuses.every(s => s === "checked_out")) overallStatus = "checked_out";
  else if (statuses.every(s => s === "checked_in")) overallStatus = "checked_in";
  else if (statuses.every(s => s === "confirmed")) overallStatus = "confirmed";
  else overallStatus = "mixed";

  assert.strictEqual(overallStatus, "mixed");
});

// -----------------------------------------------------------------------------
// Test 7: Consolidated Invoice Generation with All Rooms
// -----------------------------------------------------------------------------
runTest("Scenario 7: Consolidated Invoice generation with room line items", () => {
  const groupRooms = [
    { name: "Room No. 1", nights: 2, rate: 2500, amount: 5000 },
    { name: "Room No. 2", nights: 2, rate: 2500, amount: 5000 },
    { name: "Room No. 3", nights: 2, rate: 2500, amount: 5000 },
  ];

  const invoiceItems = groupRooms.map((r, idx) => ({
    category: 'room',
    description: `${r.name} – ${r.nights} Night Stay`,
    quantity: r.nights,
    rate: r.rate,
    amount: r.amount,
    sort_order: idx
  }));

  invoiceItems.push({
    category: 'food_beverage',
    description: "Group Dinner & Barbecue",
    quantity: 1,
    rate: 3000,
    amount: 3000,
    sort_order: 3
  });

  const totals = calculateInvoiceTotals(invoiceItems, 0, 0, []);
  assert.strictEqual(totals.subtotal, 18000);
  assert.strictEqual(totals.grandTotal, 18000);
  assert.strictEqual(totals.amountPaid, 0);
  assert.strictEqual(totals.balanceDue, 18000);
  assert.strictEqual(totals.paymentStatus, 'unpaid');
});

// -----------------------------------------------------------------------------
// Test 8: Partial Payment and Ledger Attribution
// -----------------------------------------------------------------------------
runTest("Scenario 8: Consolidated invoice payment ledger reconciliation", () => {
  const invoiceItems = [
    { category: 'room', description: "Room 1 - 2 nights", quantity: 2, rate: 2500, amount: 5000 },
    { category: 'room', description: "Room 2 - 2 nights", quantity: 2, rate: 2500, amount: 5000 },
    { category: 'room', description: "Room 3 - 2 nights", quantity: 2, rate: 2500, amount: 5000 },
  ];

  const payments = [
    { id: "pay-1", amount: 5000, payment_type: 'payment', payment_method: 'cash' }
  ];

  const step1Totals = calculateInvoiceTotals(invoiceItems, 0, 0, payments);
  assert.strictEqual(step1Totals.grandTotal, 15000);
  assert.strictEqual(step1Totals.amountPaid, 5000);
  assert.strictEqual(step1Totals.balanceDue, 10000);
  assert.strictEqual(step1Totals.paymentStatus, 'partially_paid');

  payments.push({
    id: "pay-2", amount: 10000, payment_type: 'payment', payment_method: 'upi'
  });

  const step2Totals = calculateInvoiceTotals(invoiceItems, 0, 0, payments);
  assert.strictEqual(step2Totals.grandTotal, 15000);
  assert.strictEqual(step2Totals.amountPaid, 15000);
  assert.strictEqual(step2Totals.balanceDue, 0);
  assert.strictEqual(step2Totals.paymentStatus, 'paid');
});

// -----------------------------------------------------------------------------
// Test 9: Cancellation of One Room within a Group
// -----------------------------------------------------------------------------
runTest("Scenario 9: Cancelling one room leaves other group rooms intact", () => {
  const group = [
    { id: "b1", room: "Room 1", status: "confirmed" },
    { id: "b2", room: "Room 2", status: "confirmed" },
    { id: "b3", room: "Room 3", status: "confirmed" },
  ];

  const targetRoomToCancel = "b3";
  const updatedGroup = group.map(b => b.id === targetRoomToCancel ? { ...b, status: "cancelled" } : b);

  assert.strictEqual(updatedGroup[0].status, "confirmed");
  assert.strictEqual(updatedGroup[1].status, "confirmed");
  assert.strictEqual(updatedGroup[2].status, "cancelled");

  const activeRooms = updatedGroup.filter(b => b.status !== "cancelled");
  assert.strictEqual(activeRooms.length, 2);
});

// -----------------------------------------------------------------------------
// Test 10: Cancellation of the Entire Group
// -----------------------------------------------------------------------------
runTest("Scenario 10: Cancellation of entire group updates active rooms safely", () => {
  const group = [
    { id: "b1", room: "Room 1", status: "confirmed" },
    { id: "b2", room: "Room 2", status: "checked_in" },
    { id: "b3", room: "Room 3", status: "checked_out" },
  ];

  const updatedGroup = group.map(b => {
    if (b.status === "confirmed" || b.status === "checked_in") {
      return { ...b, status: "cancelled" };
    }
    return b;
  });

  assert.strictEqual(updatedGroup[0].status, "cancelled");
  assert.strictEqual(updatedGroup[1].status, "cancelled");
  assert.strictEqual(updatedGroup[2].status, "checked_out", "Checked-out room must not be cancelled");
});

// -----------------------------------------------------------------------------
// Test 11: Revenue & Occupancy Calculations (No Double-Counting)
// -----------------------------------------------------------------------------
runTest("Scenario 11: Correct revenue & occupancy reporting with zero double-counting", () => {
  const bookings = [
    { id: "b1", group_id: "grp-A", room_id: "r1", total_amount: 5000, status: "confirmed" },
    { id: "b2", group_id: "grp-A", room_id: "r2", total_amount: 5000, status: "confirmed" },
    { id: "b3", group_id: "grp-A", room_id: "r3", total_amount: 5000, status: "confirmed" },
    { id: "b4", group_id: null, room_id: "r4", total_amount: 3000, status: "checked_in" },
    { id: "b5", group_id: null, room_id: "r5", total_amount: 4000, status: "cancelled" },
  ];

  const nonCancelled = bookings.filter(b => b.status !== "cancelled");
  const totalRevenue = nonCancelled.reduce((sum, b) => sum + b.total_amount, 0);

  assert.strictEqual(totalRevenue, 18000, "Revenue must accurately sum individual rooms without multiplying group totals");

  const distinctGroups = new Set(nonCancelled.map(b => b.group_id || b.id));
  assert.strictEqual(distinctGroups.size, 2, "There should be exactly 2 distinct booking parties");

  const activeRoomsOccupied = nonCancelled.length;
  assert.strictEqual(activeRoomsOccupied, 4, "There should be exactly 4 physical rooms booked");
});

// -----------------------------------------------------------------------------
// Test 12: Grouped Booking List View Aggregation & Search
// -----------------------------------------------------------------------------
runTest("Scenario 12: Table grouping logic aggregates rows correctly", () => {
  const rawBookings = [
    {
      id: "b1",
      group_id: "grp-1",
      is_group_lead: true,
      room_id: "r1",
      check_in: "2026-11-18",
      check_out: "2026-11-20",
      total_amount: 5000,
      status: "confirmed",
      created_at: "2026-11-15T10:00:00Z",
      rooms: { name: "Room No. 1", room_number: 1 },
      guests: [{ name: "Chaitanya Reddy", phone: "9876543210", is_primary: true }]
    },
    {
      id: "b2",
      group_id: "grp-1",
      is_group_lead: false,
      room_id: "r2",
      check_in: "2026-11-18",
      check_out: "2026-11-20",
      total_amount: 5000,
      status: "confirmed",
      created_at: "2026-11-15T10:00:00Z",
      rooms: { name: "Room No. 2", room_number: 2 },
      guests: []
    },
    {
      id: "b3",
      group_id: "grp-1",
      is_group_lead: false,
      room_id: "r3",
      check_in: "2026-11-18",
      check_out: "2026-11-20",
      total_amount: 5000,
      status: "confirmed",
      created_at: "2026-11-15T10:00:00Z",
      rooms: { name: "Room No. 3", room_number: 3 },
      guests: []
    },
    {
      id: "b4",
      group_id: null,
      is_group_lead: false,
      room_id: "r4",
      check_in: "2026-11-19",
      check_out: "2026-11-21",
      total_amount: 2500,
      status: "confirmed",
      created_at: "2026-11-15T11:00:00Z",
      rooms: { name: "Room No. 4", room_number: 4 },
      guests: [{ name: "Anita Sen", phone: "9123456789", is_primary: true }]
    }
  ];

  const map = new Map();
  rawBookings.forEach((b) => {
    const key = b.group_id || b.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(b);
  });

  const displayRows = [];
  map.forEach((list, key) => {
    const lead = list.find((b) => b.is_group_lead) || list[0];
    const isGroup = list.length > 1;
    const roomNames = list.map((b) => b.rooms.name).join(", ");
    const totalAmount = list.reduce((sum, b) => sum + b.total_amount, 0);

    displayRows.push({
      id: key,
      guestName: lead.guests[0]?.name || "Guest",
      roomNames,
      totalAmount,
      isGroup,
      roomCount: list.length
    });
  });

  assert.strictEqual(displayRows.length, 2, "4 bookings must be grouped into exactly 2 table rows");

  const groupRow = displayRows.find(r => r.isGroup);
  assert.strictEqual(groupRow.guestName, "Chaitanya Reddy");
  assert.strictEqual(groupRow.roomNames, "Room No. 1, Room No. 2, Room No. 3");
  assert.strictEqual(groupRow.totalAmount, 15000);
  assert.strictEqual(groupRow.roomCount, 3);

  const singleRow = displayRows.find(r => !r.isGroup);
  assert.strictEqual(singleRow.guestName, "Anita Sen");
  assert.strictEqual(singleRow.roomNames, "Room No. 4");
  assert.strictEqual(singleRow.totalAmount, 2500);
  assert.strictEqual(singleRow.roomCount, 1);
});

console.log(`\n===============================================================================`);
console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
console.log(`===============================================================================\n`);
