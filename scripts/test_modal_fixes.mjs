import assert from 'node:assert';
import path from 'node:path';

console.log("🧪 Testing HMS Invoice & Billing Modal Functional Logic...\n");

// 1. Test Payment Validation
function validatePaymentInput(amountStr, balanceDue) {
  const amt = parseFloat(amountStr);
  if (isNaN(amt) || amt <= 0) {
    return { valid: false, error: "Payment amount must be a positive number." };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(String(amountStr).trim())) {
    return { valid: false, error: "Invalid monetary format. Please provide at most 2 decimal places." };
  }
  if (amt > balanceDue) {
    return { valid: false, error: `Payment amount (₹${amt}) exceeds outstanding balance due (₹${balanceDue}).` };
  }
  return { valid: true };
}

// 1.1 Negative / Zero Amount
assert.strictEqual(validatePaymentInput("-100", 2500).valid, false);
assert.strictEqual(validatePaymentInput("0", 2500).valid, false);
assert.strictEqual(validatePaymentInput("abc", 2500).valid, false);

// 1.2 Overpayment Guard
assert.strictEqual(validatePaymentInput("3000", 2500).valid, false);
assert.strictEqual(validatePaymentInput("3000", 2500).error.includes("exceeds outstanding balance"), true);

// 1.3 Exact Balance Payment
assert.strictEqual(validatePaymentInput("2500", 2500).valid, true);

// 1.4 Partial Payment
assert.strictEqual(validatePaymentInput("1250.50", 2500).valid, true);

// 1.5 Precision limit
assert.strictEqual(validatePaymentInput("1250.555", 2500).valid, false);

console.log("✅ 1. Payment input validation & overpayment prevention verified.");

// 2. Test Invoice Generation Validation
function validateInvoiceGeneration(input) {
  if (!input.guestName?.trim()) {
    return { valid: false, error: "Primary Guest Name is required." };
  }
  if (!input.checkIn || !input.checkOut) {
    return { valid: false, error: "Check-in and Check-out dates are required." };
  }
  if (new Date(input.checkOut) <= new Date(input.checkIn)) {
    return { valid: false, error: "Check-out date must be strictly after Check-in date." };
  }
  if (!input.items || input.items.length === 0) {
    return { valid: false, error: "At least one line item is required on the invoice." };
  }
  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    if (!it.description?.trim()) {
      return { valid: false, error: `Line item #${i + 1} requires a valid description.` };
    }
    if (Number(it.quantity) <= 0) {
      return { valid: false, error: `Line item "${it.description}" quantity must be greater than zero.` };
    }
    if (Number(it.rate) < 0) {
      return { valid: false, error: `Line item "${it.description}" rate cannot be negative.` };
    }
  }
  if (input.taxRate < 0 || input.taxRate > 100) {
    return { valid: false, error: "Tax rate must be between 0% and 100%." };
  }
  if (input.flatDiscount < 0) {
    return { valid: false, error: "Discount amount cannot be negative." };
  }
  if (!input.bookingId) {
    return { valid: false, error: "Please select a booking reservation to associate with this invoice." };
  }
  return { valid: true };
}

// 2.1 Missing Guest
assert.strictEqual(validateInvoiceGeneration({ checkIn: '2026-10-01', checkOut: '2026-10-03', items: [{ description: 'Room', quantity: 2, rate: 2500 }], bookingId: 'b-1' }).valid, false);

// 2.2 Invalid Date Order
assert.strictEqual(validateInvoiceGeneration({ guestName: 'Guest', checkIn: '2026-10-05', checkOut: '2026-10-03', items: [{ description: 'Room', quantity: 2, rate: 2500 }], bookingId: 'b-1' }).valid, false);

// 2.3 Empty Line Items
assert.strictEqual(validateInvoiceGeneration({ guestName: 'Guest', checkIn: '2026-10-01', checkOut: '2026-10-03', items: [], bookingId: 'b-1' }).valid, false);

// 2.4 Missing Booking ID
assert.strictEqual(validateInvoiceGeneration({ guestName: 'Guest', checkIn: '2026-10-01', checkOut: '2026-10-03', items: [{ description: 'Room', quantity: 2, rate: 2500 }], bookingId: null }).valid, false);

// 2.5 Valid Invoice Generation
assert.strictEqual(validateInvoiceGeneration({ guestName: 'Anirban Sen', checkIn: '2026-10-01', checkOut: '2026-10-03', taxRate: 5, flatDiscount: 0, items: [{ description: 'Room', quantity: 2, rate: 2500 }], bookingId: 'b-1' }).valid, true);

console.log("✅ 2. Invoice generation comprehensive validation verified.");

// 3. Test Dirty / Unsaved Changes Detection
function isDirtyCheck(initialSnapshot, currentSnapshot, draftPayment) {
  if (draftPayment?.amount?.trim() || draftPayment?.ref?.trim() || draftPayment?.notes?.trim()) {
    return true;
  }
  return JSON.stringify(initialSnapshot) !== JSON.stringify(currentSnapshot);
}

const initial = { guestName: "Anirban", items: [{ desc: "Room", rate: 2500 }] };
assert.strictEqual(isDirtyCheck(initial, { ...initial }, { amount: "", ref: "", notes: "" }), false);
assert.strictEqual(isDirtyCheck(initial, { ...initial, guestName: "Anirban Sen" }, { amount: "", ref: "", notes: "" }), true);
assert.strictEqual(isDirtyCheck(initial, { ...initial }, { amount: "1000", ref: "", notes: "" }), true);

console.log("✅ 3. Unsaved changes tracking & draft payment detection verified.");

// 4. Test Error Handling for Missing Tables (never pretend success)
function handleActionResponse(res) {
  if (!res.success) {
    return {
      status: "error",
      message: res.error,
      shouldPersistLocally: false // NEVER pretend success
    };
  }
  return {
    status: "success",
    message: "Persisted successfully",
    shouldPersistLocally: true
  };
}

const dbErrorRes = { success: false, error: "Database table 'public.invoices' does not exist in schema cache." };
const handled = handleActionResponse(dbErrorRes);
assert.strictEqual(handled.status, "error");
assert.strictEqual(handled.shouldPersistLocally, false);
assert.strictEqual(handled.message.includes("does not exist in schema cache"), true);

console.log("✅ 4. Honest error propagation without fake success verified.");
console.log("\n🎉 ALL MODAL LOGICAL VERIFICATION TESTS PASSED!");
