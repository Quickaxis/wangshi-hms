/**
 * Monetary handling utility.
 * Enforces integer paise arithmetic (BigInt) to eliminate IEEE-754 floating-point errors.
 * Never mix rupees and paise. All conversion to/from PostgreSQL NUMERIC(12,2) happens via fixed-point strings.
 */

import { InvoiceStatus } from "@/lib/types";

export interface TransactionForCalculation {
  amount: number | string;
  payment_type: 'payment' | 'refund' | 'reversal';
  parent_payment_id?: string | null;
}

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);
const MINUS_ONE = BigInt(-1);

/**
 * Converts a rupee number or string (e.g. 2500, "2500.50") into exact integer paise (BigInt).
 * Splits on the decimal dot to avoid floating-point multiplication errors.
 */
export function rupeesToPaise(val: string | number): bigint {
  if (val === undefined || val === null || val === '') {
    return ZERO;
  }

  const rawStr = typeof val === 'number' ? val.toFixed(2) : String(val).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(rawStr)) {
    throw new Error(`Invalid monetary format: "${val}". Must be an amount with at most 2 decimal places.`);
  }

  const isNegative = rawStr.startsWith('-');
  const cleanStr = isNegative ? rawStr.slice(1) : rawStr;
  const [whole, fraction = '00'] = cleanStr.split('.');
  const paddedFraction = fraction.padEnd(2, '0').slice(0, 2);

  const paise = BigInt(whole || '0') * HUNDRED + BigInt(paddedFraction);
  return isNegative ? paise * MINUS_ONE : paise;
}

/**
 * Converts integer paise (BigInt) into a safe 2-decimal string for PostgreSQL NUMERIC(12,2).
 * e.g., BigInt(250050) -> "2500.50", BigInt(-500) -> "-5.00"
 */
export function paiseToDecimalString(paise: bigint): string {
  const isNegative = paise < ZERO;
  const abs = isNegative ? paise * MINUS_ONE : paise;
  const whole = abs / HUNDRED;
  const fraction = (abs % HUNDRED).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${whole}.${fraction}`;
}

/**
 * Formats integer paise into an Indian Rupee string (e.g. ₹2,500.00).
 */
export function formatPaiseToRupees(paise: bigint): string {
  const isNegative = paise < ZERO;
  const abs = isNegative ? paise * MINUS_ONE : paise;
  const whole = abs / HUNDRED;
  const fraction = (abs % HUNDRED).toString().padStart(2, '0');
  const formattedWhole = Number(whole).toLocaleString('en-IN');
  return `${isNegative ? '-' : ''}₹${formattedWhole}.${fraction}`;
}

/**
 * Validates that an input amount is a valid, positive monetary value with at most 2 decimal places.
 */
export function isValidMoneyInput(val: string | number): boolean {
  try {
    const paise = rupeesToPaise(val);
    return paise > ZERO;
  } catch {
    return false;
  }
}

/**
 * Pure, deterministic calculation of remaining unallocated balance on a parent payment.
 * Ensures cumulative linked refunds and reversals cannot exceed the parent payment amount.
 */
export function calculateParentPaymentAllocation(
  parentAmount: number | string,
  childTransactions: Array<{ amount: number | string; payment_type: 'refund' | 'reversal' | 'payment' }>
) {
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

/**
 * Pure, deterministic calculation of financial summary from booking total and transactions.
 * Distinguishes:
 * - Gross Collected: Sum of 'payment'
 * - Reversed/Voided: Sum of 'reversal' (erroneous entry adjustments)
 * - Net Collected: Gross Collected - Reversed
 * - True Guest Refund: Sum of 'refund' (cash returned to guest)
 * - Net Paid by Guest: Net Collected - True Guest Refund
 * - Balance Due: Total Contracted Amount - Net Paid by Guest
 */
export function calculateFinancialSummary(
  totalBookingRupees: number,
  transactions: TransactionForCalculation[]
) {
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

  let paymentStatus: 'unpaid' | 'partially_paid' | 'paid' | 'overpaid' | 'refunded' = 'unpaid';

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
    formatted: {
      totalContracted: formatPaiseToRupees(totalContractedPaise),
      grossCollected: formatPaiseToRupees(grossCollectedPaise),
      totalReversed: formatPaiseToRupees(reversedPaise),
      netCollected: formatPaiseToRupees(netCollectedPaise),
      totalRefunded: formatPaiseToRupees(refundedPaise),
      netPaid: formatPaiseToRupees(netPaidByGuestPaise),
      balanceDue: formatPaiseToRupees(balanceDuePaise),
    }
  };
}

export interface InvoiceLineItemForCalc {
  category?: string;
  quantity: number | string;
  rate: number | string;
  amount?: number | string;
}

/**
 * Pure, deterministic calculation of invoice totals, discounts, taxes, and balance due.
 */
export function calculateInvoiceTotals(
  items: InvoiceLineItemForCalc[],
  taxRatePercent: number | string = 0,
  flatDiscount: number | string = 0,
  transactions: TransactionForCalculation[] = []
) {
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

  // Payments
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

  let paymentStatus: 'unpaid' | 'partially_paid' | 'paid' | 'overpaid' | 'refunded' = 'unpaid';
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
    formatted: {
      subtotal: formatPaiseToRupees(subtotalPaise),
      discountAmount: formatPaiseToRupees(totalDiscountPaise),
      taxAmount: formatPaiseToRupees(taxPaise),
      grandTotal: formatPaiseToRupees(grandTotalPaise),
      amountPaid: formatPaiseToRupees(netPaidByGuestPaise > ZERO ? netPaidByGuestPaise : ZERO),
      balanceDue: formatPaiseToRupees(balanceDuePaise),
    }
  };
}

/**
 * Safely reconciles an invoice's status based on authoritative payments ledger.
 * Guarantees that:
 * 1. 'cancelled' invoices always remain cancelled.
 * 2. Invoices with zero attributed payments preserve 'draft' or 'issued' status.
 * 3. Invoices with active payments reflect 'partially_paid', 'paid', or 'overpaid'.
 * 4. Invoices with payments that were refunded or reversed return to 'unpaid'.
 */
export function reconcileStatusWithLedger(
  currentStatus: InvoiceStatus,
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid' | 'overpaid' | 'refunded'
): InvoiceStatus {
  if (currentStatus === 'cancelled') {
    return 'cancelled';
  }

  // If there are zero net payments attributed to this invoice (unpaid or fully refunded/reversed)
  if (paymentStatus === 'unpaid' || paymentStatus === 'refunded') {
    // Preserve draft or issued state
    if (currentStatus === 'draft' || currentStatus === 'issued') {
      return currentStatus;
    }
    return 'unpaid';
  }

  // Reflect active payments
  return paymentStatus; // 'partially_paid' | 'paid' | 'overpaid'
}

