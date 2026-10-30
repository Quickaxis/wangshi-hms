"use server";

import { createClient } from "@/lib/supabase/server";
import { 
  DbPayment, 
  PaymentType, 
  PaymentMethod, 
  BookingFinancialSummary 
} from "@/lib/types";
import { 
  rupeesToPaise, 
  paiseToDecimalString, 
  isValidMoneyInput, 
  calculateFinancialSummary,
  calculateParentPaymentAllocation
} from "@/lib/money";

export interface RecordPaymentInput {
  bookingId: string;
  amount: string | number; // e.g. "2500" or "2500.50"
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  parentPaymentId?: string | null;
  transactionRef?: string | null;
  notes?: string | null;
  invoiceId?: string | null;
  idempotencyKey?: string | null;
}

export interface RecordPaymentResult {
  success: boolean;
  paymentId?: string;
  summary?: BookingFinancialSummary;
  warning?: string;
  error?: string;
}

export interface GetPaymentsResult {
  success: boolean;
  summary?: BookingFinancialSummary;
  error?: string;
}

/**
 * Server action to record a payment, refund, or reversal.
 * All operations are tenant-isolated and strictly validated.
 */
export async function recordPaymentAction(input: RecordPaymentInput): Promise<RecordPaymentResult> {
  try {
    const supabase = await createClient();

    // 1. Authenticate user & partner
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "You must be logged in to record transactions." };
    }

    const { data: partner, error: partnerError } = await supabase
      .from("partners")
      .select("id, role, homestay_id, is_active")
      .eq("email", user.email)
      .single();

    if (partnerError || !partner || !partner.is_active) {
      return { success: false, error: "Your account is not authorized to record transactions." };
    }

    // 2. Validate booking existence and tenant permissions
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, homestay_id, total_amount, status")
      .eq("id", input.bookingId)
      .single();

    if (bookingError || !booking) {
      return { success: false, error: "Referenced booking does not exist." };
    }

    const isSuperAdmin = partner.role === 'super_admin';
    if (!isSuperAdmin && partner.homestay_id !== booking.homestay_id) {
      return { success: false, error: "You are not authorized to manage transactions for this homestay." };
    }

    // 3. Monetary precision validation
    if (!isValidMoneyInput(input.amount)) {
      return { 
        success: false, 
        error: "Invalid amount. Must be a positive number with at most 2 decimal places." 
      };
    }

    const amountPaise = rupeesToPaise(input.amount);
    const amountDecimalString = paiseToDecimalString(amountPaise);

    // 4. Type-specific business rules
    if (input.paymentType === 'refund') {
      if (!input.notes || !input.notes.trim()) {
        return { success: false, error: "A clear reason is required for all guest refunds." };
      }
    }

    if (input.paymentType === 'reversal') {
      if (!input.parentPaymentId) {
        return { 
          success: false, 
          error: "Reversal entries must link to the specific payment being corrected." 
        };
      }
      if (!input.notes || !input.notes.trim()) {
        return { 
          success: false, 
          error: "A documented audit note is required explaining why this payment is being reversed." 
        };
      }
    }

    // 4b. If linked to a parent payment, validate against remaining unallocated balance
    if (input.parentPaymentId) {
      const { data: parentPayment, error: parentError } = await supabase
        .from("payments")
        .select("id, amount, payment_type, booking_id")
        .eq("id", input.parentPaymentId)
        .single();

      if (parentError || !parentPayment || parentPayment.booking_id !== booking.id) {
        return { success: false, error: "Referenced parent payment does not exist on this booking." };
      }

      if (parentPayment.payment_type !== 'payment') {
        return { success: false, error: "Only original 'payment' entries can be linked as parent." };
      }

      const { data: childAllocations } = await supabase
        .from("payments")
        .select("amount, payment_type")
        .eq("parent_payment_id", input.parentPaymentId)
        .in("payment_type", ["refund", "reversal"]);

      const { remainingPaise, remainingAmount } = calculateParentPaymentAllocation(
        parentPayment.amount,
        (childAllocations || []) as Array<{ amount: number | string; payment_type: 'refund' | 'reversal' | 'payment' }>
      );

      if (amountPaise > remainingPaise) {
        return {
          success: false,
          error: `Cannot ${input.paymentType}: requested amount (₹${amountDecimalString}) exceeds remaining available amount (₹${remainingAmount}) on this specific payment.`,
        };
      }
    }

    // 5. If recording an original payment against an invoice, use the atomic record_invoice_payment RPC
    if (input.invoiceId && input.paymentType === 'payment') {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc(
        "record_invoice_payment",
        {
          p_invoice_id: input.invoiceId,
          p_amount: Number(amountDecimalString),
          p_payment_method: input.paymentMethod || 'cash',
          p_transaction_ref: input.transactionRef?.trim() || null,
          p_notes: input.notes?.trim() || null,
          p_idempotency_key: input.idempotencyKey?.trim() || null,
        }
      );

      if (rpcErr) {
        console.error("[HMS Payment Action] record_invoice_payment RPC error:", rpcErr);
        const msg = rpcErr.message || "";
        if (msg.includes("INVOICE_OVERPAYMENT_EXCEEDED")) {
          return { success: false, error: "Payment rejected: Amount exceeds remaining outstanding balance of the invoice." };
        }
        if (msg.includes("INVOICE_CANCELLED") || msg.includes("PAYMENT_INVOICE_CANCELLED")) {
          return { success: false, error: "Cannot record payment against a cancelled invoice." };
        }
        if (msg.includes("ACCESS_DENIED") || msg.includes("PAYMENT_RECORDER_UNAUTHORIZED")) {
          return { success: false, error: "Tenant authorization failure. Access denied." };
        }
        if (msg.includes("IDEMPOTENCY_CONFLICT")) {
          return { success: false, error: msg };
        }
        if (rpcErr.code === '42P01' || rpcErr.code === 'PGRST205') {
          return { success: false, error: `Database table 'public.invoices' or RPC does not exist in schema cache [${rpcErr.code}]: ${rpcErr.message}.` };
        }
        return { success: false, error: rpcErr.code ? `Transaction failed [${rpcErr.code}]: ${rpcErr.message}` : `Transaction failed: ${rpcErr.message}` };
      }

      const committedPaymentId = (rpcRes as any)?.payment_id;
      try {
        const summaryResult = await getBookingPaymentsAction(booking.id);
        return {
          success: true,
          paymentId: committedPaymentId,
          summary: summaryResult.summary,
        };
      } catch (summaryErr: any) {
        console.warn("[HMS Payment Action] Summary refresh failed after payment commit:", summaryErr);
        return {
          success: true,
          paymentId: committedPaymentId,
          warning: "Payment was recorded successfully, but the financial summary could not be refreshed.",
        };
      }
    }

    // 5b. Otherwise (booking-only payments, refunds, or reversals), insert directly into ledger.
    // The database trigger trg_sync_invoice_from_payments automatically synchronizes the invoice if linked.
    const paymentPayload: any = {
      homestay_id: booking.homestay_id,
      booking_id: booking.id,
      amount: amountDecimalString,
      payment_type: input.paymentType,
      payment_method: input.paymentMethod,
      parent_payment_id: input.parentPaymentId || null,
      transaction_ref: input.transactionRef?.trim() || null,
      notes: input.notes?.trim() || null,
      recorded_by: partner.id,
      idempotency_key: input.idempotencyKey?.trim() || null,
    };

    if (input.invoiceId) {
      paymentPayload.invoice_id = input.invoiceId;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("payments")
      .insert(paymentPayload)
      .select("id")
      .single();

    if (insertError) {
      console.error("[HMS Payment Action] Insert error:", insertError);
      
      const msg = insertError.message || "";
      if (msg.includes("OVER_REFUND_EXCEEDED")) {
        return { 
          success: false, 
          error: "Refund rejected: Requested refund amount exceeds available collected cash." 
        };
      }
      if (msg.includes("PARENT_BALANCE_EXCEEDED")) {
        return { 
          success: false, 
          error: "Transaction rejected: Requested amount exceeds remaining unallocated balance of the parent payment." 
        };
      }
      if (msg.includes("REVERSAL_EXCEEDS_PARENT")) {
        return { 
          success: false, 
          error: "Reversal rejected: Reversal amount exceeds remaining unreversed balance of the original payment." 
        };
      }
      if (msg.includes("INVOICE_OVERPAYMENT_EXCEEDED")) {
        return { 
          success: false, 
          error: "Payment rejected: Payment amount exceeds remaining invoice balance." 
        };
      }
      if (msg.includes("PAYMENT_INVOICE_CANCELLED") || msg.includes("INVOICE_CANCELLED")) {
        return { 
          success: false, 
          error: "Cannot record payment against a cancelled invoice." 
        };
      }
      if (msg.includes("PAYMENT_TENANT_MISMATCH") || msg.includes("PAYMENT_RECORDER_UNAUTHORIZED")) {
        return { success: false, error: "Tenant authorization failure. Access denied." };
      }

      if (insertError.code === '42P01' || insertError.code === 'PGRST205') {
        return { 
          success: false, 
          error: `Database table 'public.payments' does not exist in schema cache [${insertError.code}]: ${insertError.message}. An approved database migration is required.` 
        };
      }

      return { 
        success: false, 
        error: insertError.code ? `Transaction failed [${insertError.code}]: ${insertError.message}` : `Transaction failed: ${insertError.message}` 
      };
    }

    // 6. Fetch updated summary
    const committedPaymentId = inserted?.id;
    try {
      const summaryResult = await getBookingPaymentsAction(booking.id);
      return { 
        success: true, 
        paymentId: committedPaymentId,
        summary: summaryResult.summary 
      };
    } catch (summaryErr: any) {
      console.warn("[HMS Payment Action] Summary refresh failed after payment insert:", summaryErr);
      return {
        success: true,
        paymentId: committedPaymentId,
        warning: "Payment was recorded successfully, but the financial summary could not be refreshed.",
      };
    }

  } catch (err: unknown) {
    console.error("[HMS Payment Action] Exception:", err);
    return { 
      success: false, 
      error: err instanceof Error ? err.message : "Internal server error occurred." 
    };
  }
}

/**
 * Server action to fetch all transactions and calculate the live financial summary for a booking.
 */
export async function getBookingPaymentsAction(bookingId: string): Promise<GetPaymentsResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "You must be logged in to view transactions." };
    }

    const { data: partner } = await supabase
      .from("partners")
      .select("id, role, homestay_id, is_active")
      .eq("email", user.email)
      .single();

    if (!partner || !partner.is_active) {
      return { success: false, error: "Unauthorized access." };
    }

    // Fetch booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, homestay_id, total_amount")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      return { success: false, error: "Booking not found." };
    }

    const isSuperAdmin = partner.role === 'super_admin';
    if (!isSuperAdmin && partner.homestay_id !== booking.homestay_id) {
      return { success: false, error: "Access denied: unauthorized homestay." };
    }

    // Fetch all payments for this booking
    const { data: payments, error: paymentsError } = await supabase
      .from("payments")
      .select(`
        id,
        homestay_id,
        booking_id,
        amount,
        payment_type,
        payment_method,
        parent_payment_id,
        transaction_ref,
        notes,
        recorded_by,
        created_at,
        partners ( id, name, email )
      `)
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true });

    if (paymentsError) {
      if (paymentsError.code === '42P01' || paymentsError.code === 'PGRST205' || paymentsError.message?.includes('payments')) {
        const financialSummary = calculateFinancialSummary(booking.total_amount, []);
        return {
          success: true,
          summary: {
            bookingId: booking.id,
            ...financialSummary,
            payments: [],
          }
        };
      }
      console.error("[HMS Payment Action] Fetch error:", paymentsError);
      return { success: false, error: paymentsError.message };
    }

    const paymentRows = (payments || []) as unknown as DbPayment[];
    const financialSummary = calculateFinancialSummary(
      booking.total_amount,
      paymentRows.map(p => ({ amount: p.amount, payment_type: p.payment_type }))
    );

    return {
      success: true,
      summary: {
        bookingId: booking.id,
        ...financialSummary,
        payments: paymentRows,
      }
    };

  } catch (err: unknown) {
    console.error("[HMS Payment Action] Exception in getBookingPaymentsAction:", err);
    return { 
      success: false, 
      error: err instanceof Error ? err.message : "Internal server error occurred." 
    };
  }
}
