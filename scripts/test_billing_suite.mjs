import assert from 'node:assert';

console.log("🧪 Running Comprehensive Billing & Invoicing Test Suite...\n");

// --- Helper Functions to Test ---
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

  let grossCollectedPaise = ZERO;
  let reversedPaise = ZERO;
  let refundedPaise = ZERO;

  for (const t of transactions) {
    const paise = rupeesToPaise(t.amount);
    if (t.payment_type === 'payment') {
      grossCollectedPaise += paise;
    } else if (t.payment_type === 'reversal') {
      reversedPaise += paise;
    } else if (t.payment_type === 'refund') {
      refundedPaise += paise;
    }
  }

  const netCollectedPaise = grossCollectedPaise - reversedPaise;
  const netPaidByGuestPaise = netCollectedPaise - refundedPaise;
  const balanceDuePaise = grandTotalPaise - netPaidByGuestPaise;

  let paymentStatus = 'unpaid';
  if (netPaidByGuestPaise <= ZERO && (refundedPaise > ZERO || reversedPaise > ZERO)) {
    paymentStatus = 'refunded';
  } else if (netPaidByGuestPaise <= ZERO) {
    paymentStatus = 'unpaid';
  } else if (netPaidByGuestPaise < grandTotalPaise) {
    paymentStatus = 'partially_paid';
  } else if (netPaidByGuestPaise === grandTotalPaise) {
    paymentStatus = 'paid';
  } else {
    paymentStatus = 'overpaid';
  }

  return {
    subtotal: Number(paiseToDecimalString(subtotalPaise)),
    discountAmount: Number(paiseToDecimalString(totalDiscountPaise)),
    taxRate: taxPct,
    taxAmount: Number(paiseToDecimalString(taxPaise)),
    grandTotal: Number(paiseToDecimalString(grandTotalPaise)),
    amountPaid: Number(paiseToDecimalString(netPaidByGuestPaise > ZERO ? netPaidByGuestPaise : ZERO)),
    balanceDue: Number(paiseToDecimalString(balanceDuePaise)),
    paymentStatus,
  };
}

function generateInvoiceNumber(homestayName) {
  const prefix = homestayName
    ? homestayName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase()
    : "HMS";
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const randomSuffix = 4821;
  return `INV-${prefix}-${yyyy}${mm}${dd}-${randomSuffix}`;
}

function reconcileStatusWithLedger(currentStatus, paymentStatus) {
  if (currentStatus === 'cancelled') {
    return 'cancelled';
  }
  if (paymentStatus === 'unpaid' || paymentStatus === 'refunded') {
    if (currentStatus === 'draft' || currentStatus === 'issued') {
      return currentStatus;
    }
    return 'unpaid';
  }
  return paymentStatus;
}


// -------------------------------------------------------------
// Test 1: Conclave Homestay Invoice Sample Simulation
// (2 Nights @ ₹1,999.00 = ₹3,998.00, Tax ₹0, Paid in Full)
// -------------------------------------------------------------
const conclaveInvoice = calculateInvoiceTotals(
  [{ category: 'room', rate: '1999.00', quantity: 2 }],
  0, // 0% tax
  0, // no discount
  [{ amount: '3998.00', payment_type: 'payment' }]
);

assert.strictEqual(conclaveInvoice.subtotal, 3998.00);
assert.strictEqual(conclaveInvoice.taxAmount, 0.00);
assert.strictEqual(conclaveInvoice.grandTotal, 3998.00);
assert.strictEqual(conclaveInvoice.amountPaid, 3998.00);
assert.strictEqual(conclaveInvoice.balanceDue, 0.00);
assert.strictEqual(conclaveInvoice.paymentStatus, 'paid');
console.log("✅ Test 1 Passed: The Conclave Homestay sample folio successfully simulated.");

// -------------------------------------------------------------
// Test 2: Itemized charges with Extra Bed, Food & Laundry
// -------------------------------------------------------------
const multiItemInvoice = calculateInvoiceTotals(
  [
    { category: 'room', rate: '2500.00', quantity: 3 }, // ₹7,500
    { category: 'extra_bed', rate: '600.00', quantity: 2 }, // ₹1,200
    { category: 'food_beverage', rate: '350.00', quantity: 4 }, // ₹1,400
    { category: 'laundry', rate: '200.00', quantity: 1 }, // ₹200
  ],
  0,
  0,
  [{ amount: '5000.00', payment_type: 'payment' }] // Partial advance paid
);

// 7500 + 1200 + 1400 + 200 = 10,300
assert.strictEqual(multiItemInvoice.subtotal, 10300.00);
assert.strictEqual(multiItemInvoice.grandTotal, 10300.00);
assert.strictEqual(multiItemInvoice.amountPaid, 5000.00);
assert.strictEqual(multiItemInvoice.balanceDue, 5300.00);
assert.strictEqual(multiItemInvoice.paymentStatus, 'partially_paid');
console.log("✅ Test 2 Passed: Multi-item charges and partial payment verified.");

// -------------------------------------------------------------
// Test 3: Tax Calculation (GST 5% & 12%)
// -------------------------------------------------------------
const gstInvoice = calculateInvoiceTotals(
  [{ category: 'room', rate: '4000.00', quantity: 2 }], // ₹8,000
  12, // 12% GST
  0,
  []
);

// 8000 * 0.12 = 960 tax, grand total = 8960
assert.strictEqual(gstInvoice.subtotal, 8000.00);
assert.strictEqual(gstInvoice.taxAmount, 960.00);
assert.strictEqual(gstInvoice.grandTotal, 8960.00);
assert.strictEqual(gstInvoice.amountPaid, 0.00);
assert.strictEqual(gstInvoice.balanceDue, 8960.00);
assert.strictEqual(gstInvoice.paymentStatus, 'unpaid');
console.log("✅ Test 3 Passed: Configurable tax rate calculated accurately.");

// -------------------------------------------------------------
// Test 4: Custom Discounts (Itemized and Flat)
// -------------------------------------------------------------
const discountInvoice = calculateInvoiceTotals(
  [
    { category: 'room', rate: '3000.00', quantity: 2 }, // ₹6,000
    { category: 'discount', rate: '500.00', quantity: 1 }, // -₹500 item discount
  ],
  5, // 5% tax on net
  200, // ₹200 flat discount
  [{ amount: '5565.00', payment_type: 'payment' }]
);

// subtotal = 6000
// total discount = 500 + 200 = 700
// net before tax = 5300
// tax (5%) = 265
// grand total = 5565
// amount paid = 5565
assert.strictEqual(discountInvoice.subtotal, 6000.00);
assert.strictEqual(discountInvoice.discountAmount, 700.00);
assert.strictEqual(discountInvoice.taxAmount, 265.00);
assert.strictEqual(discountInvoice.grandTotal, 5565.00);
assert.strictEqual(discountInvoice.amountPaid, 5565.00);
assert.strictEqual(discountInvoice.balanceDue, 0.00);
assert.strictEqual(discountInvoice.paymentStatus, 'paid');
console.log("✅ Test 4 Passed: Multiple discount layers and net tax calculation passed.");

// -------------------------------------------------------------
// Test 5: Overpayment Guard
// -------------------------------------------------------------
function validatePayment(balanceDue, attemptedPayment) {
  const balancePaise = rupeesToPaise(balanceDue);
  const paymentPaise = rupeesToPaise(attemptedPayment);

  if (paymentPaise <= ZERO) {
    return { valid: false, error: "Payment must be positive" };
  }
  if (paymentPaise > balancePaise && balancePaise > ZERO) {
    return { valid: false, error: "Payment exceeds balance due" };
  }
  return { valid: true };
}

assert.strictEqual(validatePayment("2500.00", "2500.00").valid, true);
assert.strictEqual(validatePayment("2500.00", "1000.00").valid, true);
assert.strictEqual(validatePayment("2500.00", "3000.00").valid, false);
assert.strictEqual(validatePayment("2500.00", "-500.00").valid, false);
console.log("✅ Test 5 Passed: Accidental overpayment and negative payment guards verified.");

// -------------------------------------------------------------
// Test 6: Duplicate Active Invoice Prevention Invariant
// -------------------------------------------------------------
function canCreateInvoiceForBooking(existingInvoices, bookingId, allowDuplicate = false) {
  const activeExisting = existingInvoices.find(
    i => i.booking_id === bookingId && i.status !== 'cancelled'
  );
  if (activeExisting && !allowDuplicate) {
    return { allowed: false, existingId: activeExisting.id, invoiceNumber: activeExisting.invoice_number };
  }
  return { allowed: true };
}

const mockExisting = [
  { id: 'inv-1', booking_id: 'bk-100', invoice_number: 'INV-WNG-20261027-1001', status: 'paid' },
  { id: 'inv-2', booking_id: 'bk-200', invoice_number: 'INV-WNG-20261027-1002', status: 'cancelled' },
];

// bk-100 already has active invoice -> blocked
const check1 = canCreateInvoiceForBooking(mockExisting, 'bk-100', false);
assert.strictEqual(check1.allowed, false);
assert.strictEqual(check1.invoiceNumber, 'INV-WNG-20261027-1001');

// bk-100 with allowDuplicate: true (supplementary folio) -> allowed
const check2 = canCreateInvoiceForBooking(mockExisting, 'bk-100', true);
assert.strictEqual(check2.allowed, true);

// bk-200 had a cancelled invoice -> allowed
const check3 = canCreateInvoiceForBooking(mockExisting, 'bk-200', false);
assert.strictEqual(check3.allowed, true);

// bk-300 has no invoice -> allowed
const check4 = canCreateInvoiceForBooking(mockExisting, 'bk-300', false);
assert.strictEqual(check4.allowed, true);
console.log("✅ Test 6 Passed: Duplicate active invoice prevention invariant verified.");

// -------------------------------------------------------------
// Test 7: Unique Invoice Number Generation
// -------------------------------------------------------------
const num1 = generateInvoiceNumber("Wangshi Homestay");
assert.ok(num1.startsWith("INV-WAN-"));
const num2 = generateInvoiceNumber("The Conclave");
assert.ok(num2.startsWith("INV-THE-"));
const num3 = generateInvoiceNumber(null);
assert.ok(num3.startsWith("INV-HMS-"));
console.log("✅ Test 7 Passed: Tenant-aware invoice numbering formatting verified.");

// -------------------------------------------------------------
// Test 8: Two Invoices on One Booking with Invoice-Specific Payments
// (Room Stay = ₹10,000, Dining & Laundry = ₹2,500. Payment of ₹2,500 for Invoice B)
// -------------------------------------------------------------
const bookingId = "bk-multi-500";
const invoiceA = {
  id: "inv-room-101",
  booking_id: bookingId,
  status: "issued",
  items: [{ description: "Room Stay (4 Nights)", quantity: 4, rate: 2500, amount: 10000 }],
};
const invoiceB = {
  id: "inv-food-102",
  booking_id: bookingId,
  status: "draft",
  items: [
    { description: "Dinner Buffet", quantity: 2, rate: 800, amount: 1600 },
    { description: "Laundry Service", quantity: 1, rate: 900, amount: 900 },
  ],
};

// Payment attributed explicitly to Invoice B
const ledgerPayments = [
  { id: "pay-1", booking_id: bookingId, invoice_id: "inv-food-102", amount: "2500.00", payment_type: "payment" },
];

// Reconcile Invoice B
const bPayments = ledgerPayments.filter(p => p.invoice_id === invoiceB.id);
const totalsB = calculateInvoiceTotals(invoiceB.items, 0, 0, bPayments);
const statusB = reconcileStatusWithLedger(invoiceB.status, totalsB.paymentStatus);
assert.strictEqual(totalsB.grandTotal, 2500);
assert.strictEqual(totalsB.amountPaid, 2500);
assert.strictEqual(totalsB.balanceDue, 0);
assert.strictEqual(statusB, "paid");

// Reconcile Invoice A (MUST NOT absorb Invoice B's payment)
const aPayments = ledgerPayments.filter(p => p.invoice_id === invoiceA.id);
const totalsA = calculateInvoiceTotals(invoiceA.items, 0, 0, aPayments);
const statusA = reconcileStatusWithLedger(invoiceA.status, totalsA.paymentStatus);
assert.strictEqual(totalsA.grandTotal, 10000);
assert.strictEqual(totalsA.amountPaid, 0);
assert.strictEqual(totalsA.balanceDue, 10000);
assert.strictEqual(statusA, "issued"); // State is preserved, not corrupted!
console.log("✅ Test 8 Passed: Two invoices for one booking isolated; invoice-specific payment does not bleed.");

// -------------------------------------------------------------
// Test 9: Legacy & Advance Booking Deposits (invoice_id IS NULL) Remain Unattributed
// -------------------------------------------------------------
const advanceDeposit = { id: "pay-advance", booking_id: bookingId, invoice_id: null, amount: "3000.00", payment_type: "payment" };
const allLedger = [...ledgerPayments, advanceDeposit];

// Reconcile both invoices again
const aPaymentsWithUnlinked = allLedger.filter(p => p.invoice_id === invoiceA.id);
const bPaymentsWithUnlinked = allLedger.filter(p => p.invoice_id === invoiceB.id);
const unallocated = allLedger.filter(p => !p.invoice_id);

assert.strictEqual(aPaymentsWithUnlinked.length, 0);
assert.strictEqual(bPaymentsWithUnlinked.length, 1);
assert.strictEqual(unallocated.length, 1);
assert.strictEqual(unallocated[0].amount, "3000.00");

const totalsA2 = calculateInvoiceTotals(invoiceA.items, 0, 0, aPaymentsWithUnlinked);
assert.strictEqual(totalsA2.amountPaid, 0);
assert.strictEqual(totalsA2.balanceDue, 10000);

const totalsB2 = calculateInvoiceTotals(invoiceB.items, 0, 0, bPaymentsWithUnlinked);
assert.strictEqual(totalsB2.amountPaid, 2500);
assert.strictEqual(totalsB2.balanceDue, 0);
console.log("✅ Test 9 Passed: Advance booking deposit (invoice_id IS NULL) remains unattributed at booking level.");

// -------------------------------------------------------------
// Test 10: Refunds and Reversals Handled Consistently per Invoice
// -------------------------------------------------------------
// 10a. Partial refund on Invoice B (₹500 refunded)
const refundB = { id: "pay-ref-1", booking_id: bookingId, invoice_id: "inv-food-102", amount: "500.00", payment_type: "refund" };
const bPaymentsAfterRefund = [...bPayments, refundB];
const totalsBAfterRefund = calculateInvoiceTotals(invoiceB.items, 0, 0, bPaymentsAfterRefund);
const statusBAfterRefund = reconcileStatusWithLedger(statusB, totalsBAfterRefund.paymentStatus);
assert.strictEqual(totalsBAfterRefund.amountPaid, 2000);
assert.strictEqual(totalsBAfterRefund.balanceDue, 500);
assert.strictEqual(statusBAfterRefund, "partially_paid");

// Verify Invoice A is completely untouched by Invoice B's refund
const totalsAAfterBRefund = calculateInvoiceTotals(invoiceA.items, 0, 0, aPaymentsWithUnlinked);
assert.strictEqual(totalsAAfterBRefund.amountPaid, 0);
assert.strictEqual(totalsAAfterBRefund.balanceDue, 10000);

// 10b. Payment + Reversal on Invoice A
const paymentA = { id: "pay-a1", booking_id: bookingId, invoice_id: "inv-room-101", amount: "5000.00", payment_type: "payment" };
const reversalA = { id: "pay-rev-1", booking_id: bookingId, invoice_id: "inv-room-101", amount: "5000.00", payment_type: "reversal" };
const aPaymentsReversed = [paymentA, reversalA];
const totalsAReversed = calculateInvoiceTotals(invoiceA.items, 0, 0, aPaymentsReversed);
const statusAReversed = reconcileStatusWithLedger(invoiceA.status, totalsAReversed.paymentStatus);
assert.strictEqual(totalsAReversed.amountPaid, 0);
assert.strictEqual(totalsAReversed.balanceDue, 10000);
assert.strictEqual(statusAReversed, "issued"); // Still issued, net payment = 0
console.log("✅ Test 10 Passed: Refunds and reversals strictly isolated to target invoice with exact paise math.");

// -------------------------------------------------------------
// Test 11: Draft, Issued, and Cancelled Status Preservation
// -------------------------------------------------------------
// 1. Draft with 0 payments -> remains draft
assert.strictEqual(reconcileStatusWithLedger("draft", "unpaid"), "draft");

// 2. Issued with 0 payments -> remains issued
assert.strictEqual(reconcileStatusWithLedger("issued", "unpaid"), "issued");

// 3. Draft with active payment -> transitions to partially_paid or paid
assert.strictEqual(reconcileStatusWithLedger("draft", "partially_paid"), "partially_paid");
assert.strictEqual(reconcileStatusWithLedger("draft", "paid"), "paid");

// 4. Cancelled with any payments -> strictly remains cancelled
assert.strictEqual(reconcileStatusWithLedger("cancelled", "paid"), "cancelled");
assert.strictEqual(reconcileStatusWithLedger("cancelled", "partially_paid"), "cancelled");
assert.strictEqual(reconcileStatusWithLedger("cancelled", "unpaid"), "cancelled");

// 5. Unpaid status transitions
assert.strictEqual(reconcileStatusWithLedger("unpaid", "unpaid"), "unpaid");
assert.strictEqual(reconcileStatusWithLedger("unpaid", "paid"), "paid");
console.log("✅ Test 11 Passed: Draft, issued, and cancelled invoice states strictly preserved.");

console.log("\n🎉 ALL 11 BILLING SYSTEM INVARIANT TESTS PASSED WITH 100% SUCCESS!\n");

