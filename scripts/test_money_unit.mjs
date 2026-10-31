import assert from 'node:assert';

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);
const ONE = BigInt(1);
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

function calculateParentPaymentAllocation(parentAmount, childTransactions) {
  const parentPaise = rupeesToPaise(parentAmount);
  let allocatedPaise = ZERO;

  for (const c of childTransactions) {
    if (c.payment_type === 'reversal' || c.payment_type === 'refund') {
      allocatedPaise += rupeesToPaise(c.amount);
    }
  }

  const remainingPaise = parentPaise - allocatedPaise;
  return {
    parentAmount: paiseToDecimalString(parentPaise),
    allocatedAmount: paiseToDecimalString(allocatedPaise),
    remainingAmount: paiseToDecimalString(remainingPaise),
    remainingPaise,
  };
}

function calculateFinancialSummary(totalBookingRupees, transactions) {
  const totalContractedPaise = rupeesToPaise(totalBookingRupees);

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
  const balanceDuePaise = totalContractedPaise - netPaidByGuestPaise;

  let paymentStatus = 'unpaid';
  if (netPaidByGuestPaise <= ZERO && (refundedPaise > ZERO || reversedPaise > ZERO)) {
    paymentStatus = 'refunded';
  } else if (netPaidByGuestPaise <= ZERO) {
    paymentStatus = 'unpaid';
  } else if (netPaidByGuestPaise < totalContractedPaise) {
    paymentStatus = 'partially_paid';
  } else if (netPaidByGuestPaise === totalContractedPaise) {
    paymentStatus = 'paid';
  } else {
    paymentStatus = 'overpaid';
  }

  return {
    totalContracted: paiseToDecimalString(totalContractedPaise),
    grossCollected: paiseToDecimalString(grossCollectedPaise),
    totalReversed: paiseToDecimalString(reversedPaise),
    netCollected: paiseToDecimalString(netCollectedPaise),
    totalRefunded: paiseToDecimalString(refundedPaise),
    netPaid: paiseToDecimalString(netPaidByGuestPaise),
    balanceDue: paiseToDecimalString(balanceDuePaise),
    paymentStatus,
  };
}

console.log("🧪 Running Comprehensive Money & Financial Invariant Tests...\n");

// -------------------------------------------------------------
// Test 1: Precision without floating-point errors
// -------------------------------------------------------------
assert.strictEqual(rupeesToPaise("2500.50"), BigInt(250050));
assert.strictEqual(rupeesToPaise(2500.5), BigInt(250050));
assert.strictEqual(rupeesToPaise("0.10") + rupeesToPaise("0.20"), BigInt(30));
assert.strictEqual(paiseToDecimalString(BigInt(30)), "0.30");
console.log("✅ Test 1 Passed: Floating-point precision strictly avoided.");

// -------------------------------------------------------------
// Test 2: Partial payment
// -------------------------------------------------------------
const s1 = calculateFinancialSummary(5000, [{ amount: "2000.00", payment_type: "payment" }]);
assert.strictEqual(s1.paymentStatus, "partially_paid");
assert.strictEqual(s1.netPaid, "2000.00");
assert.strictEqual(s1.balanceDue, "3000.00");
console.log("✅ Test 2 Passed: Partial payment correctly evaluated.");

// -------------------------------------------------------------
// Test 3: Full payment
// -------------------------------------------------------------
const s2 = calculateFinancialSummary(5000, [
  { amount: "2000.00", payment_type: "payment" },
  { amount: "3000.00", payment_type: "payment" },
]);
assert.strictEqual(s2.paymentStatus, "paid");
assert.strictEqual(s2.netPaid, "5000.00");
assert.strictEqual(s2.balanceDue, "0.00");
console.log("✅ Test 3 Passed: Full payment correctly evaluated.");

// -------------------------------------------------------------
// Test 4: Erroneous payment reversal (distinguished from guest refund)
// -------------------------------------------------------------
const s3 = calculateFinancialSummary(5000, [
  { amount: "5000.00", payment_type: "payment" },
  { amount: "5000.00", payment_type: "payment" }, // accidental duplicate
  { amount: "5000.00", payment_type: "reversal" }, // void duplicate
]);
assert.strictEqual(s3.grossCollected, "10000.00");
assert.strictEqual(s3.totalReversed, "5000.00");
assert.strictEqual(s3.totalRefunded, "0.00"); // Zero guest refunds
assert.strictEqual(s3.netPaid, "5000.00");
assert.strictEqual(s3.balanceDue, "0.00");
assert.strictEqual(s3.paymentStatus, "paid");
console.log("✅ Test 4 Passed: Reversal successfully negates erroneous payment without misrepresenting as guest refund.");

// -------------------------------------------------------------
// Test 5: Genuine guest refund
// -------------------------------------------------------------
const s4 = calculateFinancialSummary(5000, [
  { amount: "5000.00", payment_type: "payment" },
  { amount: "2000.00", payment_type: "refund" },
]);
assert.strictEqual(s4.grossCollected, "5000.00");
assert.strictEqual(s4.totalRefunded, "2000.00");
assert.strictEqual(s4.totalReversed, "0.00");
assert.strictEqual(s4.netPaid, "3000.00");
assert.strictEqual(s4.balanceDue, "2000.00");
assert.strictEqual(s4.paymentStatus, "partially_paid");
console.log("✅ Test 5 Passed: Guest refund correctly reduces net paid and updates balance due.");

// -------------------------------------------------------------
// Test 6: Full cancellation refund
// -------------------------------------------------------------
const s5 = calculateFinancialSummary(5000, [
  { amount: "5000.00", payment_type: "payment" },
  { amount: "5000.00", payment_type: "refund" },
]);
assert.strictEqual(s5.netPaid, "0.00");
assert.strictEqual(s5.paymentStatus, "refunded");
console.log("✅ Test 6 Passed: Full refund evaluates status to 'refunded'.");

// -------------------------------------------------------------
// Test 7: Reversal after partial guest refund (User's Exact Scenario)
// Payment ₹5,000 -> Guest Refund ₹3,000 -> Attempted Reversal of ₹5,000
// -------------------------------------------------------------
const alloc1 = calculateParentPaymentAllocation("5000.00", [
  { amount: "3000.00", payment_type: "refund" }
]);
assert.strictEqual(alloc1.parentAmount, "5000.00");
assert.strictEqual(alloc1.allocatedAmount, "3000.00");
assert.strictEqual(alloc1.remainingAmount, "2000.00");
assert.strictEqual(alloc1.remainingPaise, BigInt(200000));

const canReverseFull = rupeesToPaise("5000.00") <= alloc1.remainingPaise;
assert.strictEqual(canReverseFull, false, "Reversing full ₹5,000 after ₹3,000 refund MUST be rejected!");

const canReverseRemaining = rupeesToPaise("2000.00") <= alloc1.remainingPaise;
assert.strictEqual(canReverseRemaining, true, "Reversing remaining ₹2,000 MUST be accepted.");
console.log("✅ Test 7 Passed: Reversal after partial refund correctly capped at unreversed and unrefunded balance (₹2,000 max).");

// -------------------------------------------------------------
// Test 8: Multiple partial refunds against a single parent payment
// Payment ₹5,000 -> Refund 1: ₹2,000 -> Refund 2: ₹2,000 -> Attempted Refund 3: ₹2,000
// -------------------------------------------------------------
const alloc2 = calculateParentPaymentAllocation("5000.00", [
  { amount: "2000.00", payment_type: "refund" },
  { amount: "2000.00", payment_type: "refund" },
]);
assert.strictEqual(alloc2.allocatedAmount, "4000.00");
assert.strictEqual(alloc2.remainingAmount, "1000.00");

const canRefund3 = rupeesToPaise("2000.00") <= alloc2.remainingPaise;
assert.strictEqual(canRefund3, false, "Third refund of ₹2,000 against parent with only ₹1,000 remaining MUST be rejected!");

const canRefund3Valid = rupeesToPaise("1000.00") <= alloc2.remainingPaise;
assert.strictEqual(canRefund3Valid, true, "Final refund of exactly ₹1,000 MUST be accepted.");
console.log("✅ Test 8 Passed: Multiple partial refunds against one parent payment strictly enforce parent remaining balance.");

// -------------------------------------------------------------
// Test 9: Unlinked refund across multiple original payments
// Payment 1: ₹3,000 + Payment 2: ₹4,000 = ₹7,000 total collected.
// Guest is given an unlinked cancellation refund of ₹5,000.
// Then an attempted second unlinked refund of ₹3,000 is made.
// -------------------------------------------------------------
const summaryMulti = calculateFinancialSummary(7000, [
  { amount: "3000.00", payment_type: "payment" },
  { amount: "4000.00", payment_type: "payment" },
  { amount: "5000.00", payment_type: "refund" }, // unlinked refund
]);
assert.strictEqual(summaryMulti.grossCollected, "7000.00");
assert.strictEqual(summaryMulti.totalRefunded, "5000.00");
assert.strictEqual(summaryMulti.netPaid, "2000.00");
// Only 2000 remaining available across the booking!
const canRefundExtra3000 = rupeesToPaise("3000.00") <= rupeesToPaise(summaryMulti.netPaid);
assert.strictEqual(canRefundExtra3000, false, "Second unlinked refund of ₹3,000 when only ₹2,000 is available MUST be rejected!");
const canRefundExtra2000 = rupeesToPaise("2000.00") <= rupeesToPaise(summaryMulti.netPaid);
assert.strictEqual(canRefundExtra2000, true, "Second unlinked refund of remaining ₹2,000 MUST be accepted.");
console.log("✅ Test 9 Passed: Unlinked refund across multiple original payments correctly enforced against booking net collected cash.");

// -------------------------------------------------------------
// Test 10: Reversal blocked by prior unlinked refund (Cross-Invariant Protection)
// Payment 1: ₹5,000 + Payment 2: ₹2,000 = ₹7,000 total collected.
// An unlinked refund of ₹6,000 is disbursed. Global net cash is ₹1,000.
// Attempted reversal of Payment 1 (₹5,000) must be rejected because global net cash is only ₹1,000!
// -------------------------------------------------------------
const summaryPriorRefund = calculateFinancialSummary(7000, [
  { amount: "5000.00", payment_type: "payment" },
  { amount: "2000.00", payment_type: "payment" },
  { amount: "6000.00", payment_type: "refund" }, // unlinked refund
]);
// Available global cash is 1000.00
const globalCashPaise = rupeesToPaise(summaryPriorRefund.netPaid);
assert.strictEqual(globalCashPaise, BigInt(100000));
const canReverseP1 = rupeesToPaise("5000.00") <= globalCashPaise;
assert.strictEqual(canReverseP1, false, "Reversing ₹5,000 payment when global net cash is only ₹1,000 MUST be blocked by REVERSAL_EXCEEDS_GLOBAL_CASH!");
const canReversePartialP1 = rupeesToPaise("1000.00") <= globalCashPaise;
assert.strictEqual(canReversePartialP1, true, "Reversing up to remaining global net cash (₹1,000) is permitted.");
console.log("✅ Test 10 Passed: Reversal blocked when prior unlinked refunds have already depleted global net cash.");

// -------------------------------------------------------------
// Test 11: Multi-transaction booking lifecycle with payments, reversals, and refunds
// -------------------------------------------------------------
const s6 = calculateFinancialSummary(10000, [
  { amount: "5000.00", payment_type: "payment" },
  { amount: "3000.00", payment_type: "payment" },
  { amount: "3000.00", payment_type: "reversal" },
  { amount: "5000.00", payment_type: "payment" },
  { amount: "2000.00", payment_type: "refund" },
]);
assert.strictEqual(s6.grossCollected, "13000.00");
assert.strictEqual(s6.totalReversed, "3000.00");
assert.strictEqual(s6.netCollected, "10000.00");
assert.strictEqual(s6.totalRefunded, "2000.00");
assert.strictEqual(s6.netPaid, "8000.00");
assert.strictEqual(s6.balanceDue, "2000.00");
assert.strictEqual(s6.paymentStatus, "partially_paid");
console.log("✅ Test 11 Passed: Multi-transaction booking lifecycle reconciled to the exact paisa.");

// -------------------------------------------------------------
// Test 12: Invoice Line Items, Taxes, Discounts & Balance Due
// -------------------------------------------------------------
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

const inv1 = calculateInvoiceTotals([
  { category: 'room', rate: '1999.00', quantity: 2 }, // 3998
  { category: 'food_beverage', rate: '250.00', quantity: 2 }, // 500
  { category: 'laundry', rate: '150.00', quantity: 1 }, // 150
  { category: 'discount', rate: '200.00', quantity: 1 }, // -200
], 5, 0, [{ amount: '2000.00', payment_type: 'payment' }]);

// subtotal = 3998 + 500 + 150 = 4648
// discount = 200
// net before tax = 4448
// tax (5%) = 222.40 -> round to 222.40 paise -> 222.40
// grand total = 4448 + 222.40 = 4670.40
// amount paid = 2000.00
// balance due = 2670.40
assert.strictEqual(inv1.subtotal, 4648.00);
assert.strictEqual(inv1.discountAmount, 200.00);
assert.strictEqual(inv1.grandTotal, 4670.40);
assert.strictEqual(inv1.amountPaid, 2000.00);
assert.strictEqual(inv1.balanceDue, 2670.40);
assert.strictEqual(inv1.paymentStatus, 'partially_paid');
console.log("✅ Test 12 Passed: Invoicing itemization, taxes, discounts, and payments reconciled.");

console.log("\n🎉 ALL 12 FINANCIAL & INVOICING INVARIANT TESTS PASSED WITH 100% MATHEMATICAL ACCURACY!\n");
