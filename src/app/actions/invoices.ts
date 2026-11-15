"use server";

import { createClient } from "@/lib/supabase/server";
import { 
  DbInvoice, 
  DbInvoiceItem, 
  CreateInvoiceInput, 
  UpdateInvoiceInput, 
  InvoiceStatus,
  PaymentMethod,
  PaymentStage,
  InvoiceItemCategory,
  DbPayment
} from "@/lib/types";
import { 
  calculateInvoiceTotals, 
  paiseToDecimalString, 
  rupeesToPaise,
  reconcileStatusWithLedger,
  isValidMoneyInput,
  extractPaymentStage,
  formatPaymentNotesWithStage,
  stripPaymentStageTag
} from "@/lib/money";
import {
  formatISTPaymentTimestamp,
  formatISTLedgerDateTime,
  formatReceiptNumber
} from "@/lib/dateUtils";
import { recordPaymentAction } from "@/app/actions/payments";

export interface InvoiceActionResult {
  success: boolean;
  invoiceId?: string;
  invoice?: DbInvoice;
  paymentId?: string;
  warning?: string;
  error?: string;
}

export interface GetInvoicesResult {
  success: boolean;
  invoices?: DbInvoice[];
  error?: string;
}

/**
 * Helper to authenticate user and partner, and verify tenant access.
 */
async function getAuthenticatedPartner() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "You must be logged in to access billing.", supabase: null, partner: null };
  }

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("id, name, email, role, homestay_id, is_active")
    .eq("email", user.email)
    .single();

  if (partnerError || !partner || !partner.is_active) {
    return { error: "Your account is not authorized to access billing records.", supabase: null, partner: null };
  }

  return { error: null, supabase, partner };
}

/**
 * Generate a clean, unique invoice number.
 * Example: INV-WNG-20261027-4821
 */
function generateInvoiceNumber(homestayName?: string | null): string {
  const prefix = homestayName
    ? homestayName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase()
    : "HMS";
  
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);

  return `INV-${prefix}-${yyyy}${mm}${dd}-${randomSuffix}`;
}

/**
 * Fetch all invoices for the authenticated partner's homestay (or all if super_admin).
 */
export async function getInvoicesAction(homestayIdFilter?: string): Promise<GetInvoicesResult> {
  try {
    const { error: authErr, supabase, partner } = await getAuthenticatedPartner();
    if (authErr || !supabase || !partner) {
      return { success: false, error: authErr || "Authentication failed." };
    }

    const isSuperAdmin = partner.role === 'super_admin';
    const targetHomestayId = homestayIdFilter || (isSuperAdmin ? null : partner.homestay_id);

    let query = supabase
      .from("invoices")
      .select(`
        *,
        items:invoice_items(*),
        bookings:bookings(
          id,
          room_id,
          check_in,
          check_out,
          status,
          total_amount,
          rooms(id, room_number, name),
          guests(id, name, phone, email, is_primary)
        ),
        homestay:homestays(
          id,
          name,
          slug,
          location,
          phone,
          email,
          logo_url
        )
      `)
      .order("created_at", { ascending: false });

    if (targetHomestayId) {
      query = query.eq("homestay_id", targetHomestayId);
    }

    const { data: invoices, error } = await query;

    if (error) {
      // If table doesn't exist yet, return empty list gracefully
      if (error.code === '42P01' || error.code === 'PGRST205' || error.message?.includes('invoices')) {
        return { success: true, invoices: [] };
      }
      return { success: false, error: error.message };
    }

    // Fetch booking payments for strict invoice-level reconciliation
    const bookingIds = (invoices || []).map((inv: DbInvoice) => inv.booking_id).filter(Boolean);
    let paymentsByInvoice: Record<string, any[]> = {};

    if (bookingIds.length > 0) {
      const { data: payments, error: paymentsErr } = await supabase
        .from("payments")
        .select("*")
        .in("booking_id", bookingIds);

      if (paymentsErr) {
        console.error("Failed to fetch payment ledger for invoices:", paymentsErr);
        return { success: false, error: `Failed to load payment ledger: ${paymentsErr.message}` };
      }

      if (payments) {
        for (const p of payments) {
          // Strictly attribute payment ONLY if it has an explicit invoice_id
          if (p.invoice_id) {
            if (!paymentsByInvoice[p.invoice_id]) paymentsByInvoice[p.invoice_id] = [];
            const stage = extractPaymentStage(p);
            const recNumber = p.receipt_number || formatReceiptNumber(p.created_at, p.id);
            paymentsByInvoice[p.invoice_id].push({
              ...p,
              payment_stage: stage,
              receipt_number: recNumber,
              formatted_timestamp: formatISTPaymentTimestamp(p.created_at),
              formatted_date_time: formatISTLedgerDateTime(p.created_at),
            });
          }
          // Note: Payments with invoice_id IS NULL are unallocated booking-level payments
          // and are NOT silently credited to any individual invoice.
        }
      }
    }

    const mappedInvoices = (invoices || []).map((inv: any) => {
      // Attribute only payments specifically linked to this invoice
      const invoicePayments = paymentsByInvoice[inv.id] || [];
      const totals = calculateInvoiceTotals(
        inv.items || [],
        inv.tax_rate,
        inv.discount_amount,
        invoicePayments
      );

      const reconciledStatus = reconcileStatusWithLedger(inv.status, totals.paymentStatus);

      return {
        ...inv,
        amount_paid: totals.amountPaid,
        balance_due: totals.balanceDue,
        status: reconciledStatus,
        payments: invoicePayments
      } as DbInvoice;
    });

    return { success: true, invoices: mappedInvoices };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load invoices." };
  }
}

/**
 * Fetch a single invoice by its ID.
 */
export async function getInvoiceByIdAction(invoiceId: string): Promise<InvoiceActionResult> {
  try {
    const { error: authErr, supabase, partner } = await getAuthenticatedPartner();
    if (authErr || !supabase || !partner) {
      return { success: false, error: authErr || "Authentication failed." };
    }

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select(`
        *,
        items:invoice_items(*),
        bookings:bookings(
          id,
          room_id,
          check_in,
          check_out,
          status,
          total_amount,
          rooms(id, room_number, name, nightly_rate),
          guests(id, name, phone, email, is_primary)
        ),
        homestay:homestays(
          id,
          name,
          slug,
          location,
          phone,
          email,
          logo_url
        )
      `)
      .eq("id", invoiceId)
      .single();

    if (error || !invoice) {
      if (error?.code === '42P01' || error?.code === 'PGRST205' || error?.message?.includes('invoices')) {
        return { success: false, error: "Database table 'public.invoices' is not found in schema cache. An approved database migration is required." };
      }
      return { success: false, error: error?.message || "Invoice not found." };
    }

    // Verify tenant authorization
    const isSuperAdmin = partner.role === 'super_admin';
    if (!isSuperAdmin && partner.homestay_id !== invoice.homestay_id) {
      return { success: false, error: "Unauthorized access to this invoice." };
    }

    // Fetch payments explicitly attributed to this invoice or linked booking
    let paymentQuery = supabase
      .from("payments")
      .select("*, partners(id, name, email)")
      .order("created_at", { ascending: true });

    if (invoice.group_id) {
      paymentQuery = paymentQuery.or(`invoice_id.eq.${invoice.id},booking_id.eq.${invoice.booking_id}`);
    } else {
      paymentQuery = paymentQuery.or(`invoice_id.eq.${invoice.id},booking_id.eq.${invoice.booking_id}`);
    }

    const { data: payments, error: paymentsErr } = await paymentQuery;

    if (paymentsErr) {
      console.error("Failed to fetch payment ledger for invoice:", paymentsErr);
      return { success: false, error: `Failed to load payment ledger: ${paymentsErr.message}` };
    }

    const allPayments = payments || [];
    // Only payments explicitly attributed to THIS invoice
    const rawInvoicePayments = allPayments.filter((p: any) => p.invoice_id === invoice.id);

    const invoicePayments: DbPayment[] = rawInvoicePayments.map((p: any) => {
      const stage = extractPaymentStage(p);
      const recNumber = p.receipt_number || formatReceiptNumber(p.created_at, p.id);
      return {
        ...p,
        payment_stage: stage,
        receipt_number: recNumber,
        formatted_timestamp: formatISTPaymentTimestamp(p.created_at),
        formatted_date_time: formatISTLedgerDateTime(p.created_at),
      };
    });

    const totals = calculateInvoiceTotals(
      invoice.items || [],
      invoice.tax_rate,
      invoice.discount_amount,
      invoicePayments
    );

    const reconciledStatus = reconcileStatusWithLedger(invoice.status, totals.paymentStatus);

    // Read action is strictly read-only: no read-time invoice header updates are performed.
    // Database triggers trg_sync_invoice_from_payments and reconcile_invoice_summary RPC
    // serve as the authoritative synchronization mechanism.

    const reconciledInvoice: DbInvoice = {
      ...invoice,
      amount_paid: totals.amountPaid,
      balance_due: totals.balanceDue,
      status: reconciledStatus,
      payments: invoicePayments
    };

    return { success: true, invoice: reconciledInvoice };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to fetch invoice." };
  }
}

/**
 * Check if an active invoice already exists for a booking or its group.
 */
export async function getInvoiceByBookingIdAction(bookingId: string): Promise<InvoiceActionResult> {
  try {
    const { error: authErr, supabase, partner } = await getAuthenticatedPartner();
    if (authErr || !supabase || !partner) {
      return { success: false, error: authErr || "Authentication failed." };
    }

    // Fetch booking to inspect homestay and potential group_id
    const { data: targetBooking } = await supabase
      .from("bookings")
      .select("id, homestay_id, group_id")
      .eq("id", bookingId)
      .maybeSingle();

    let invQuery = supabase
      .from("invoices")
      .select(`
        *,
        items:invoice_items(*),
        bookings:bookings(
          id,
          room_id,
          check_in,
          check_out,
          status,
          total_amount,
          rooms(id, room_number, name),
          guests(id, name, phone, email, is_primary)
        ),
        homestay:homestays(*)
      `)
      .neq("status", "cancelled");

    if (targetBooking?.group_id) {
      invQuery = invQuery.or(`group_id.eq.${targetBooking.group_id},booking_id.eq.${bookingId}`);
    } else {
      invQuery = invQuery.eq("booking_id", bookingId);
    }

    const { data: invoice, error } = await invQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205' || error.message?.includes('invoices')) {
        return { success: false, error: "Database table 'public.invoices' is not found in schema cache. An approved database migration is required." };
      }
      return { success: false, error: error.message };
    }

    if (!invoice) {
      return { success: true, invoice: undefined };
    }

    const isSuperAdmin = partner.role === 'super_admin';
    if (!isSuperAdmin && partner.homestay_id !== invoice.homestay_id) {
      return { success: false, error: "Unauthorized access to this homestay's invoices." };
    }

    // Fetch payments strictly attributed to this invoice
    const { data: payments, error: paymentsErr } = await supabase
      .from("payments")
      .select("*")
      .eq("invoice_id", invoice.id);

    if (paymentsErr) {
      console.error("Failed to fetch payment ledger for booking invoice:", paymentsErr);
      return { success: false, error: `Failed to load payment ledger: ${paymentsErr.message}` };
    }

    const invoicePayments = payments || [];
    const totals = calculateInvoiceTotals(
      invoice.items || [],
      invoice.tax_rate,
      invoice.discount_amount,
      invoicePayments
    );

    const reconciledStatus = reconcileStatusWithLedger(invoice.status, totals.paymentStatus);

    return { 
      success: true, 
      invoice: {
        ...invoice,
        amount_paid: totals.amountPaid,
        balance_due: totals.balanceDue,
        status: reconciledStatus,
        payments: invoicePayments
      } 
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to query booking invoice." };
  }
}

/**
 * Check if an active consolidated invoice exists for a group.
 */
export async function getInvoiceByGroupIdAction(groupId: string): Promise<InvoiceActionResult> {
  try {
    const { error: authErr, supabase, partner } = await getAuthenticatedPartner();
    if (authErr || !supabase || !partner) {
      return { success: false, error: authErr || "Authentication failed." };
    }

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select(`
        *,
        items:invoice_items(*),
        bookings:bookings(
          id,
          room_id,
          check_in,
          check_out,
          status,
          total_amount,
          rooms(id, room_number, name),
          guests(id, name, phone, email, is_primary)
        ),
        homestay:homestays(*)
      `)
      .eq("group_id", groupId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!invoice) {
      return { success: true, invoice: undefined };
    }

    const isSuperAdmin = partner.role === 'super_admin';
    if (!isSuperAdmin && partner.homestay_id !== invoice.homestay_id) {
      return { success: false, error: "Unauthorized access to this homestay's invoices." };
    }

    const { data: payments, error: paymentsErr } = await supabase
      .from("payments")
      .select("*")
      .eq("invoice_id", invoice.id);

    if (paymentsErr) {
      return { success: false, error: `Failed to load payments: ${paymentsErr.message}` };
    }

    const invoicePayments = payments || [];
    const totals = calculateInvoiceTotals(
      invoice.items || [],
      invoice.tax_rate,
      invoice.discount_amount,
      invoicePayments
    );

    const reconciledStatus = reconcileStatusWithLedger(invoice.status, totals.paymentStatus);

    return {
      success: true,
      invoice: {
        ...invoice,
        amount_paid: totals.amountPaid,
        balance_due: totals.balanceDue,
        status: reconciledStatus,
        payments: invoicePayments
      }
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to query group invoice." };
  }
}

/**
 * Automatically get or initialize a Live Guest Folio for any booking.
 * 
 * CORE PMS PRINCIPLE: ONE BOOKING = ONE LIVE GUEST FOLIO.
 * 
 * - If an active folio/invoice already exists for this booking or group, returns it immediately.
 * - If no folio exists yet, automatically constructs and initializes the live folio in status 'draft'
 *   with all booked room nights, rates, and guest details.
 * - Auto-links any unallocated pre-arrival advance payments on this booking or group.
 * - Multi-room groups automatically share a single consolidated group folio.
 */
export async function getOrCreateBookingFolioAction(bookingId: string): Promise<InvoiceActionResult> {
  try {
    const { error: authErr, supabase, partner } = await getAuthenticatedPartner();
    if (authErr || !supabase || !partner) {
      return { success: false, error: authErr || "Authentication failed." };
    }

    // 1. Fetch referenced booking
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select(`
        id,
        homestay_id,
        room_id,
        group_id,
        is_group_lead,
        check_in,
        check_out,
        nightly_rate,
        total_amount,
        status,
        rooms(id, room_number, name, nightly_rate),
        homestay:homestays(id, name, slug),
        guests(id, name, phone, email, is_primary)
      `)
      .eq("id", bookingId)
      .single();

    if (bookingErr || !booking) {
      return { success: false, error: "Referenced booking does not exist." };
    }

    const isSuperAdmin = partner.role === 'super_admin';
    if (!isSuperAdmin && partner.homestay_id !== booking.homestay_id) {
      return { success: false, error: "Unauthorized access to this homestay's bookings." };
    }

    // 2. Check if an active invoice already exists for this booking or group
    if (booking.group_id) {
      const existingGroupInv = await getInvoiceByGroupIdAction(booking.group_id);
      if (existingGroupInv.success && existingGroupInv.invoice) {
        return existingGroupInv;
      }
    }

    const existingBookingInv = await getInvoiceByBookingIdAction(booking.id);
    if (existingBookingInv.success && existingBookingInv.invoice) {
      return existingBookingInv;
    }

    // 3. No active invoice exists: initialize the Live Folio automatically
    let itemsPayload: Array<{
      category: any;
      description: string;
      stay_period: string;
      quantity: number;
      rate: number;
      amount: number;
      sort_order: number;
    }> = [];

    let leadBookingId = booking.id;
    let minCheckIn = booking.check_in;
    let maxCheckOut = booking.check_out;

    if (booking.group_id) {
      // Group booking: fetch all active rooms in the group
      const { data: groupBookings } = await supabase
        .from("bookings")
        .select(`
          id,
          room_id,
          check_in,
          check_out,
          nightly_rate,
          total_amount,
          is_group_lead,
          rooms(id, room_number, name, nightly_rate)
        `)
        .eq("group_id", booking.group_id)
        .neq("status", "cancelled")
        .order("created_at", { ascending: true });

      const allRooms = groupBookings && groupBookings.length > 0 ? groupBookings : [booking];
      const leadRoom = allRooms.find(r => r.is_group_lead) || allRooms[0];
      leadBookingId = leadRoom.id;

      itemsPayload = allRooms.map((b: any, idx: number) => {
        const checkInDate = new Date(b.check_in);
        const checkOutDate = new Date(b.check_out);
        const nights = Math.max(1, Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)));
        const bRoom = Array.isArray(b.rooms) ? b.rooms[0] : b.rooms;
        const rName = bRoom?.name || bRoom?.room_number || `Room ${idx + 1}`;
        const rate = Number(b.nightly_rate) || Number(bRoom?.nightly_rate) || 0;
        const amount = Number(b.total_amount) || Number((nights * rate).toFixed(2));

        if (b.check_in < minCheckIn) minCheckIn = b.check_in;
        if (b.check_out > maxCheckOut) maxCheckOut = b.check_out;

        return {
          category: 'room',
          description: `Room: ${rName} (${b.check_in} to ${b.check_out})`,
          stay_period: `[${b.check_in}, ${b.check_out})`,
          quantity: nights,
          rate: rate,
          amount: amount,
          sort_order: idx
        };
      });
    } else {
      // Single room booking
      const checkInDate = new Date(booking.check_in);
      const checkOutDate = new Date(booking.check_out);
      const nights = Math.max(1, Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)));
      const singleRoom = Array.isArray(booking.rooms) ? (booking.rooms as any)[0] : (booking.rooms as any);
      const rName = singleRoom?.name || singleRoom?.room_number || "Room";
      const rate = Number(booking.nightly_rate) || Number(singleRoom?.nightly_rate) || 0;
      const amount = Number(booking.total_amount) || Number((nights * rate).toFixed(2));

      itemsPayload = [{
        category: 'room',
        description: `Room: ${rName} (${booking.check_in} to ${booking.check_out})`,
        stay_period: `[${booking.check_in}, ${booking.check_out})`,
        quantity: nights,
        rate: rate,
        amount: amount,
        sort_order: 0
      }];
    }

    // Resolve primary guest info
    const guestList = (booking.guests as any[]) || [];
    const primaryGuest = guestList.find(g => g.is_primary) || guestList[0];
    const guestName = primaryGuest?.name?.trim() || "Guest";
    const guestPhone = primaryGuest?.phone?.trim() || null;
    const guestEmail = primaryGuest?.email?.trim() || null;
    const leadRoomObj = Array.isArray(booking.rooms) ? (booking.rooms as any)[0] : (booking.rooms as any);
    const rName = leadRoomObj?.name || leadRoomObj?.room_number || "Room";

    // Create the live folio with status 'draft'
    const createRes = await createInvoiceAction({
      bookingId: leadBookingId,
      groupId: booking.group_id || undefined,
      guestName,
      guestPhone,
      guestEmail,
      checkIn: minCheckIn,
      checkOut: maxCheckOut,
      roomId: booking.room_id,
      roomName: rName,
      invoiceDate: new Date().toISOString().split('T')[0],
      status: 'draft',
      taxRate: 0,
      discountAmount: 0,
      items: itemsPayload,
      notes: 'Live Guest Folio',
      houseRules: 'Standard Homestay House Rules Apply.'
    });

    if (!createRes.success || !createRes.invoiceId) {
      return createRes;
    }

    return await getInvoiceByIdAction(createRes.invoiceId);
  } catch (err: any) {
    console.error("[HMS Invoices] getOrCreateBookingFolioAction exception:", err);
    return { success: false, error: err.message || "Failed to initialize guest folio." };
  }
}

/**
 * Add an individual charge directly to the live folio.
 * Immediately persists to invoice_items and recalculates folio balance and totals.
 */
export async function addFolioChargeAction(input: {
  invoiceId: string;
  category: any;
  description: string;
  quantity: number;
  rate: number;
  stayPeriod?: string | null;
}): Promise<InvoiceActionResult> {
  try {
    const { error: authErr, supabase, partner } = await getAuthenticatedPartner();
    if (authErr || !supabase || !partner) {
      return { success: false, error: authErr || "Authentication failed." };
    }

    if (!input.description || !input.description.trim()) {
      return { success: false, error: "Charge description cannot be empty." };
    }

    if (input.category === 'room') {
      return { 
        success: false, 
        error: "Room charges cannot be added as direct folio charges. Room modifications must be handled through Booking Management." 
      };
    }

    const qty = Number(input.quantity);
    if (isNaN(qty) || qty < 1) {
      return { success: false, error: "Quantity must be at least 1." };
    }

    const rate = Number(input.rate);
    if (isNaN(rate) || rate < 0) {
      return { success: false, error: "Rate cannot be negative." };
    }

    const itemAmount = Number((qty * rate).toFixed(2));

    // Fetch existing invoice
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*, items:invoice_items(*)")
      .eq("id", input.invoiceId)
      .single();

    if (invErr || !invoice) {
      return { success: false, error: "Folio / Invoice does not exist." };
    }

    const isSuperAdmin = partner.role === 'super_admin';
    if (!isSuperAdmin && partner.homestay_id !== invoice.homestay_id) {
      return { success: false, error: "Unauthorized access to this homestay's folio." };
    }

    if (invoice.status === 'cancelled') {
      return { success: false, error: "Cannot add charges to a cancelled folio." };
    }

    const nextSortOrder = (invoice.items?.length || 0) + 1;

    // Insert new item
    const { error: insertErr } = await supabase
      .from("invoice_items")
      .insert({
        invoice_id: input.invoiceId,
        homestay_id: invoice.homestay_id,
        category: input.category || 'custom',
        description: input.description.trim(),
        stay_period: input.stayPeriod || null,
        quantity: qty,
        rate: rate,
        amount: itemAmount,
        sort_order: nextSortOrder
      });

    if (insertErr) {
      return { success: false, error: `Failed to add charge: ${insertErr.message}` };
    }

    // Re-fetch all items for this invoice to recalculate totals
    const { data: updatedItems } = await supabase
      .from("invoice_items")
      .select("amount")
      .eq("invoice_id", input.invoiceId);

    const newSubtotal = (updatedItems || []).reduce((sum, it) => sum + Number(it.amount), 0);
    const taxRate = Number(invoice.tax_rate) || 0;
    const newTaxAmount = Number(((newSubtotal * taxRate) / 100).toFixed(2));
    const flatDiscount = Number(invoice.discount_amount) || 0;
    const newGrandTotal = Math.max(0, Number((newSubtotal + newTaxAmount - flatDiscount).toFixed(2)));

    // Update invoice header totals
    await supabase
      .from("invoices")
      .update({
        subtotal: newSubtotal,
        tax_amount: newTaxAmount,
        grand_total: newGrandTotal,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.invoiceId);

    // Reconcile status and balance with ledger
    await supabase.rpc("reconcile_invoice_summary", { p_invoice_id: input.invoiceId });

    return await getInvoiceByIdAction(input.invoiceId);
  } catch (err: any) {
    console.error("[HMS Invoices] addFolioChargeAction exception:", err);
    return { success: false, error: err.message || "Failed to add charge to folio." };
  }
}

/**
 * Remove an additional charge from the live folio.
 * Validates that removing the item does not reduce grand_total below payments already collected.
 */
export async function removeFolioChargeAction(input: {
  invoiceId: string;
  itemId: string;
}): Promise<InvoiceActionResult> {
  try {
    const { error: authErr, supabase, partner } = await getAuthenticatedPartner();
    if (authErr || !supabase || !partner) {
      return { success: false, error: authErr || "Authentication failed." };
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*, items:invoice_items(*)")
      .eq("id", input.invoiceId)
      .single();

    if (invErr || !invoice) {
      return { success: false, error: "Folio / Invoice does not exist." };
    }

    const isSuperAdmin = partner.role === 'super_admin';
    if (!isSuperAdmin && partner.homestay_id !== invoice.homestay_id) {
      return { success: false, error: "Unauthorized access to this homestay's folio." };
    }

    if (invoice.status === 'cancelled') {
      return { success: false, error: "Cannot modify a cancelled folio." };
    }

    const itemToRemove = (invoice.items || []).find((it: any) => it.id === input.itemId);
    if (!itemToRemove) {
      return { success: false, error: "The specified charge does not exist on this folio." };
    }

    if (itemToRemove.category === 'room') {
      return {
        success: false,
        error: "Contractual room charges cannot be removed from the folio. Room reservation changes must be managed through Booking Management."
      };
    }

    // Safety check: Cannot remove charge if doing so makes grand_total < amount_paid
    const currentSubtotal = Number(invoice.subtotal) || 0;
    const itemAmount = Number(itemToRemove.amount) || 0;
    const newSubtotal = Math.max(0, currentSubtotal - itemAmount);
    const taxRate = Number(invoice.tax_rate) || 0;
    const newTaxAmount = Number(((newSubtotal * taxRate) / 100).toFixed(2));
    const flatDiscount = Number(invoice.discount_amount) || 0;
    const newGrandTotal = Math.max(0, Number((newSubtotal + newTaxAmount - flatDiscount).toFixed(2)));
    const currentPaid = Number(invoice.amount_paid) || 0;

    if (newGrandTotal < currentPaid) {
      return {
        success: false,
        error: `Cannot remove charge: The new folio total (₹${newGrandTotal}) would be less than payments already collected (₹${currentPaid}). Please process a refund or adjustment first.`
      };
    }

    // Delete item
    const { error: delErr } = await supabase
      .from("invoice_items")
      .delete()
      .eq("id", input.itemId)
      .eq("invoice_id", input.invoiceId);

    if (delErr) {
      return { success: false, error: `Failed to remove charge: ${delErr.message}` };
    }

    // Update invoice header totals
    await supabase
      .from("invoices")
      .update({
        subtotal: newSubtotal,
        tax_amount: newTaxAmount,
        grand_total: newGrandTotal,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.invoiceId);

    // Reconcile status and balance with ledger
    await supabase.rpc("reconcile_invoice_summary", { p_invoice_id: input.invoiceId });

    return await getInvoiceByIdAction(input.invoiceId);
  } catch (err: any) {
    console.error("[HMS Invoices] removeFolioChargeAction exception:", err);
    return { success: false, error: err.message || "Failed to remove charge from folio." };
  }
}

/**
 * Update an existing additional service charge on the live folio.
 * Validates that:
 * 1. Contractual room charges (category === 'room') cannot be modified from the folio.
 * 2. New grand total >= amount paid (cannot reduce grand total below recorded payments).
 * 3. Immediately recalculates subtotal, tax, grand total, and balance due.
 */
export async function updateFolioChargeAction(input: {
  invoiceId: string;
  itemId: string;
  category?: InvoiceItemCategory;
  description?: string;
  quantity?: number;
  rate?: number;
  stayPeriod?: string | null;
  isComplimentary?: boolean;
  reason?: string;
}): Promise<InvoiceActionResult> {
  try {
    const { error: authErr, supabase, partner } = await getAuthenticatedPartner();
    if (authErr || !supabase || !partner) {
      return { success: false, error: authErr || "Authentication failed." };
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*, items:invoice_items(*)")
      .eq("id", input.invoiceId)
      .single();

    if (invErr || !invoice) {
      return { success: false, error: "Folio / Invoice does not exist." };
    }

    const isSuperAdmin = partner.role === 'super_admin';
    if (!isSuperAdmin && partner.homestay_id !== invoice.homestay_id) {
      return { success: false, error: "Unauthorized access to this homestay's folio." };
    }

    if (invoice.status === 'cancelled') {
      return { success: false, error: "Cannot modify a cancelled folio." };
    }

    const itemToUpdate = (invoice.items || []).find((it: any) => it.id === input.itemId);
    if (!itemToUpdate) {
      return { success: false, error: "The specified charge does not exist on this folio." };
    }

    // Role authorization check for room rate adjustments
    const isAuthorized = ['admin', 'staff', 'super_admin'].includes(partner.role);
    if (itemToUpdate.category === 'room' && !isAuthorized) {
      return {
        success: false,
        error: "Only authorized staff or administrators may adjust room rates."
      };
    }

    if (itemToUpdate.category === 'room' && input.category && input.category !== 'room') {
      return {
        success: false,
        error: "Cannot change the category of a room charge."
      };
    }

    if (itemToUpdate.category !== 'room' && input.category === 'room') {
      return {
        success: false,
        error: "Cannot change an additional service into a room charge."
      };
    }

    const newDescription = input.description !== undefined ? input.description.trim() : itemToUpdate.description;
    if (!newDescription) {
      return { success: false, error: "Charge description cannot be empty." };
    }

    const newCategory = input.category || itemToUpdate.category;
    const newQty = input.quantity !== undefined ? Number(input.quantity) : Number(itemToUpdate.quantity);
    if (isNaN(newQty) || newQty < 1) {
      return { success: false, error: "Quantity must be at least 1." };
    }

    const isComp = input.isComplimentary !== undefined ? input.isComplimentary : !!itemToUpdate.is_complimentary;
    const newRate = isComp ? 0 : (input.rate !== undefined ? Number(input.rate) : Number(itemToUpdate.rate));
    if (isNaN(newRate) || newRate < 0) {
      return { success: false, error: "Rate cannot be negative." };
    }

    const newItemAmount = Number((newQty * newRate).toFixed(2));

    // Calculate new totals across all items
    const otherItems = (invoice.items || []).filter((it: any) => it.id !== input.itemId);
    const otherItemsSum = otherItems.reduce((sum: number, it: any) => sum + Number(it.amount || 0), 0);
    const newSubtotal = Number((otherItemsSum + newItemAmount).toFixed(2));
    const taxRate = Number(invoice.tax_rate) || 0;
    const newTaxAmount = Number(((newSubtotal * taxRate) / 100).toFixed(2));
    const flatDiscount = Number(invoice.discount_amount) || 0;
    const newGrandTotal = Math.max(0, Number((newSubtotal + newTaxAmount - flatDiscount).toFixed(2)));
    const currentPaid = Number(invoice.amount_paid) || 0;

    // Financial integrity check: Grand total cannot fall below recorded payments
    if (newGrandTotal < currentPaid) {
      return {
        success: false,
        error: `Cannot modify charge: The new folio total (₹${newGrandTotal}) would be less than payments already collected (₹${currentPaid}). Please process a refund or adjustment first.`
      };
    }

    // Audit logging for room charge rate adjustments or service edits
    let updatedNotes = invoice.notes || "";
    if (itemToUpdate.category === 'room') {
      const isRateOrQtyChanged = (newRate !== Number(itemToUpdate.rate)) || (newQty !== Number(itemToUpdate.quantity)) || (newDescription !== itemToUpdate.description);
      if (isRateOrQtyChanged) {
        const staffName = partner.name || partner.email || "Staff";
        const staffRole = partner.role || "staff";
        const timestamp = formatISTLedgerDateTime(new Date().toISOString());
        const reasonText = input.reason?.trim() ? ` • Reason: ${input.reason.trim()}` : "";
        const auditEntry = `[Room Charge Adjustment - ${timestamp} by ${staffName} (${staffRole})]: "${itemToUpdate.description}" adjusted from ₹${itemToUpdate.rate} × ${itemToUpdate.quantity} (₹${itemToUpdate.amount}) to ₹${newRate} × ${newQty} (₹${newItemAmount})${reasonText}`;
        updatedNotes = updatedNotes ? `${updatedNotes}\n\n${auditEntry}` : auditEntry;
      }
    } else if (input.reason?.trim()) {
      const staffName = partner.name || partner.email || "Staff";
      const staffRole = partner.role || "staff";
      const timestamp = formatISTLedgerDateTime(new Date().toISOString());
      const auditEntry = `[Service Adjustment - ${timestamp} by ${staffName} (${staffRole})]: "${itemToUpdate.description}" adjusted to ₹${newRate} × ${newQty} (₹${newItemAmount}) • Reason: ${input.reason.trim()}`;
      updatedNotes = updatedNotes ? `${updatedNotes}\n\n${auditEntry}` : auditEntry;
    }

    // Build update payload for invoice_items
    const updatePayload: Record<string, any> = {
      category: newCategory,
      description: newDescription,
      stay_period: input.stayPeriod !== undefined ? input.stayPeriod : itemToUpdate.stay_period,
      quantity: newQty,
      rate: newRate,
      amount: newItemAmount,
    };

    // Only include is_complimentary if explicitly specified for an additional service
    if (itemToUpdate.category !== 'room' && input.isComplimentary !== undefined) {
      updatePayload.is_complimentary = isComp;
    }

    let { error: updateErr } = await supabase
      .from("invoice_items")
      .update(updatePayload)
      .eq("id", input.itemId)
      .eq("invoice_id", input.invoiceId);

    // Schema cache resiliency: If column is_complimentary is not found in schema cache,
    // gracefully retry update without is_complimentary
    if (updateErr && (updateErr.message?.includes("is_complimentary") || updateErr.code === "PGRST204" || updateErr.code === "42703")) {
      const fallbackPayload = { ...updatePayload };
      delete fallbackPayload.is_complimentary;
      const retryRes = await supabase
        .from("invoice_items")
        .update(fallbackPayload)
        .eq("id", input.itemId)
        .eq("invoice_id", input.invoiceId);
      updateErr = retryRes.error;
    }

    if (updateErr) {
      return { success: false, error: `Failed to update charge: ${updateErr.message}` };
    }

    // Update invoice header totals and audit notes
    await supabase
      .from("invoices")
      .update({
        subtotal: newSubtotal,
        tax_amount: newTaxAmount,
        grand_total: newGrandTotal,
        notes: updatedNotes,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.invoiceId);

    // Reconcile status and balance with ledger
    await supabase.rpc("reconcile_invoice_summary", { p_invoice_id: input.invoiceId });

    return await getInvoiceByIdAction(input.invoiceId);
  } catch (err: any) {
    console.error("[HMS Invoices] updateFolioChargeAction exception:", err);
    return { success: false, error: err.message || "Failed to update charge on folio." };
  }
}

/**
 * Finalize / Issue the formal tax invoice from the live guest folio.
 * Marks the folio as officially issued or paid for check-out.
 */
export async function finalizeFolioInvoiceAction(invoiceId: string): Promise<InvoiceActionResult> {
  try {
    const { error: authErr, supabase, partner } = await getAuthenticatedPartner();
    if (authErr || !supabase || !partner) {
      return { success: false, error: authErr || "Authentication failed." };
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (invErr || !invoice) {
      return { success: false, error: "Folio / Invoice does not exist." };
    }

    const isSuperAdmin = partner.role === 'super_admin';
    if (!isSuperAdmin && partner.homestay_id !== invoice.homestay_id) {
      return { success: false, error: "Unauthorized access to this homestay's folio." };
    }

    if (invoice.status === 'cancelled') {
      return { success: false, error: "Cannot finalize a cancelled folio." };
    }

    // Determine target status based on current balance
    const balanceDue = Number(invoice.balance_due) || 0;
    const amountPaid = Number(invoice.amount_paid) || 0;
    let targetStatus = 'issued';
    if (balanceDue <= 0.00 && amountPaid > 0.00) {
      targetStatus = 'paid';
    } else if (amountPaid > 0.00) {
      targetStatus = 'partially_paid';
    }

    const { error: updateErr } = await supabase
      .from("invoices")
      .update({
        status: targetStatus,
        invoice_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString()
      })
      .eq("id", invoiceId);

    if (updateErr) {
      return { success: false, error: `Failed to finalize invoice: ${updateErr.message}` };
    }

    return await getInvoiceByIdAction(invoiceId);
  } catch (err: any) {
    console.error("[HMS Invoices] finalizeFolioInvoiceAction exception:", err);
    return { success: false, error: err.message || "Failed to finalize folio." };
  }
}

/**
 * Create a new invoice prefilled from booking and guest details.
 */
export async function createInvoiceAction(input: CreateInvoiceInput): Promise<InvoiceActionResult> {
  try {
    const { error: authErr, supabase, partner } = await getAuthenticatedPartner();
    if (authErr || !supabase || !partner) {
      return { success: false, error: authErr || "Authentication failed." };
    }

    // 1. Validate booking existence & tenant ownership
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select(`
        id,
        homestay_id,
        room_id,
        group_id,
        check_in,
        check_out,
        total_amount,
        status,
        rooms(id, room_number, name, nightly_rate),
        homestay:homestays(id, name, slug)
      `)
      .eq("id", input.bookingId)
      .single();

    if (bookingErr || !booking) {
      return { success: false, error: "Referenced booking does not exist." };
    }

    const isSuperAdmin = partner.role === 'super_admin';
    if (!isSuperAdmin && partner.homestay_id !== booking.homestay_id) {
      return { success: false, error: "You are not authorized to create invoices for this homestay." };
    }

    const effectiveGroupId = input.groupId || booking.group_id;

    // 2. Prevent duplicate active invoices unless explicitly allowed
    if (!input.allowDuplicate) {
      let dupQuery = supabase
        .from("invoices")
        .select("id, invoice_number")
        .neq("status", "cancelled");

      if (effectiveGroupId) {
        dupQuery = dupQuery.or(`group_id.eq.${effectiveGroupId},booking_id.eq.${input.bookingId}`);
      } else {
        dupQuery = dupQuery.eq("booking_id", input.bookingId);
      }

      const { data: existingActive } = await dupQuery.limit(1).maybeSingle();

      if (existingActive) {
        return { 
          success: false, 
          error: `An active consolidated invoice (${existingActive.invoice_number}) already exists for this booking/group. You can edit or view the existing invoice instead.` 
        };
      }
    }

    // 3. Validate line items
    if (!input.items || input.items.length === 0) {
      return { success: false, error: "An invoice must have at least one line item." };
    }

    for (let i = 0; i < input.items.length; i++) {
      const it = input.items[i];
      if (!it.description || !it.description.trim()) {
        return { success: false, error: `Item #${i + 1} is missing a Service / Item Name.` };
      }
      const qty = Number(it.quantity);
      if (isNaN(qty) || qty < 1) {
        return { success: false, error: `Quantity must be at least 1 for "${it.description.trim()}".` };
      }
      const rate = Number(it.rate);
      if (isNaN(rate) || rate < 0) {
        return { success: false, error: `Rate cannot be negative for "${it.description.trim()}".` };
      }
      if (rate === 0 && it.category !== 'discount' && !it.is_complimentary) {
        return { success: false, error: `Rate cannot be ₹0 for "${it.description.trim()}". Mark as complimentary if intended.` };
      }
    }

    // Newly created invoice has zero attributed payments initially
    // Legacy or advance booking payments (invoice_id IS NULL) remain unattributed at the booking level
    const taxRate = input.taxRate || 0;
    // input.discountAmount is the flat discount entered by the user
    const flatDiscount = input.discountAmount || 0;
    const totals = calculateInvoiceTotals(input.items, taxRate, flatDiscount, []);

    const homestayName = (booking.homestay as any)?.name || "Homestay";
    const invoiceNumber = input.invoiceNumber?.trim() || generateInvoiceNumber(homestayName);

    const checkInDate = input.checkIn || booking.check_in;
    const checkOutDate = input.checkOut || booking.check_out;
    const roomName = input.roomName || (booking.rooms as any)?.name || "Room";
    const initialStatus: InvoiceStatus = input.status || 'draft';

    // 4. Atomically insert invoice header and line items via PostgreSQL RPC transaction
    const itemsPayload = (input.items || []).map((item, idx) => {
      const qty = item.quantity || 1;
      const rate = item.rate || 0;
      const itemAmount = item.amount !== undefined ? item.amount : Number((qty * rate).toFixed(2));

      return {
        category: item.category || 'room',
        description: item.description.trim(),
        stay_period: item.stay_period || null,
        quantity: qty,
        rate: rate,
        amount: itemAmount,
        sort_order: item.sort_order ?? idx,
      };
    });

    const { data: createdInvoiceId, error: rpcErr } = await supabase.rpc(
      "create_invoice_with_items",
      {
        p_booking_id: booking.id,
        p_invoice_number: invoiceNumber,
        p_guest_name: input.guestName.trim(),
        p_check_in: checkInDate,
        p_check_out: checkOutDate,
        p_subtotal: totals.subtotal,
        p_tax_rate: taxRate,
        p_tax_amount: totals.taxAmount,
        p_discount_amount: flatDiscount,
        p_grand_total: totals.grandTotal,
        p_items: itemsPayload,
        p_invoice_date: input.invoiceDate || new Date().toISOString().split('T')[0],
        p_status: initialStatus,
        p_guest_phone: input.guestPhone?.trim() || null,
        p_guest_email: input.guestEmail?.trim() || null,
        p_guest_address: input.guestAddress?.trim() || null,
        p_room_id: input.roomId || booking.room_id || null,
        p_room_name: roomName,
        p_notes: input.notes?.trim() || null,
        p_house_rules: input.houseRules?.trim() || null,
      }
    );

    if (rpcErr || !createdInvoiceId) {
      if (rpcErr?.code === 'PGRST202' || rpcErr?.code === '42883') {
        return { 
          success: false, 
          error: `RPC 'create_invoice_with_items' does not exist in schema cache [${rpcErr.code}]: ${rpcErr.message}. An approved database migration is required.` 
        };
      }
      if (rpcErr?.code === 'PGRST205' || rpcErr?.code === '42P01') {
        return { 
          success: false, 
          error: `Database table 'public.invoices' does not exist in schema cache [${rpcErr.code}]: ${rpcErr.message}. An approved database migration is required.` 
        };
      }
      return { 
        success: false, 
        error: rpcErr?.code ? `[${rpcErr.code}] ${rpcErr.message}` : (rpcErr?.message || "Failed to create invoice.") 
      };
    }

    // 5. Auto-link any unallocated advance payments on this booking or group
    try {
      let targetBookingIds = [booking.id];
      if (effectiveGroupId) {
        const { data: groupBookings } = await supabase
          .from("bookings")
          .select("id")
          .eq("group_id", effectiveGroupId)
          .neq("status", "cancelled");
        if (groupBookings && groupBookings.length > 0) {
          targetBookingIds = groupBookings.map(b => b.id);
        }
      }

      const { data: unallocatedPayments } = await supabase
        .from("payments")
        .select("id")
        .in("booking_id", targetBookingIds)
        .is("invoice_id", null);

      if (unallocatedPayments && unallocatedPayments.length > 0) {
        const unallocatedIds = unallocatedPayments.map(p => p.id);
        await supabase
          .from("payments")
          .update({ invoice_id: createdInvoiceId })
          .in("id", unallocatedIds);

        // Authoritatively sync invoice balance and status
        await supabase.rpc("reconcile_invoice_summary", {
          p_invoice_id: createdInvoiceId
        });
      }
    } catch (linkErr) {
      console.warn("[HMS Invoices] Advance payment linking error on invoice creation:", linkErr);
    }

    const fullInvoiceResult = await getInvoiceByIdAction(createdInvoiceId as string);
    return { 
      success: true, 
      invoiceId: createdInvoiceId as string,
      invoice: fullInvoiceResult.invoice
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create invoice." };
  }
}

/**
 * Checks whether any financial properties (items, taxRate, discountAmount, status)
 * have been modified in the update payload compared to the existing record.
 */
function hasFinancialModifications(
  input: UpdateInvoiceInput,
  existingInvoice: any,
  currentItems: any[],
  existingFlatDiscount: number
): boolean {
  if (input.taxRate !== undefined && Number(input.taxRate) !== (Number(existingInvoice.tax_rate) || 0)) {
    return true;
  }
  if (input.discountAmount !== undefined && Number(input.discountAmount) !== existingFlatDiscount) {
    return true;
  }
  if (input.status !== undefined && input.status !== existingInvoice.status) {
    return true;
  }
  if (input.items !== undefined && input.items !== null) {
    if (input.items.length !== currentItems.length) {
      return true;
    }
    for (let i = 0; i < input.items.length; i++) {
      const incoming = input.items[i];
      const existing = currentItems[i];
      if (!existing) return true;
      if ((incoming.category || 'room') !== (existing.category || 'room')) return true;
      if ((incoming.description || '').trim() !== (existing.description || '').trim()) return true;
      if ((incoming.stay_period || null) !== (existing.stay_period || null)) return true;
      if (Number(incoming.quantity || 1) !== Number(existing.quantity || 1)) return true;
      if (Number(incoming.rate || 0) !== Number(existing.rate || 0)) return true;
      if (incoming.amount !== undefined && Number(incoming.amount) !== Number(existing.amount || 0)) return true;
    }
  }
  return false;
}

/**
 * Update an existing invoice and its line items.
 * Payment history is never deleted or overwritten.
 */
export async function updateInvoiceAction(input: UpdateInvoiceInput): Promise<InvoiceActionResult> {
  try {
    const { error: authErr, supabase, partner } = await getAuthenticatedPartner();
    if (authErr || !supabase || !partner) {
      return { success: false, error: authErr || "Authentication failed." };
    }

    // 1. Fetch existing invoice
    const { data: existingInvoice, error: fetchErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", input.id)
      .single();

    if (fetchErr || !existingInvoice) {
      return { success: false, error: "Invoice not found." };
    }

    const isSuperAdmin = partner.role === 'super_admin';
    if (!isSuperAdmin && partner.homestay_id !== existingInvoice.homestay_id) {
      return { success: false, error: "Unauthorized access to update this invoice." };
    }

    // 2. Fetch existing invoice items explicitly from `invoice_items` using invoice ID
    const { data: existingItemsData, error: itemsFetchErr } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", existingInvoice.id)
      .order("sort_order", { ascending: true });

    if (itemsFetchErr) {
      return { success: false, error: itemsFetchErr.message || "Failed to fetch invoice items." };
    }
    const currentItems = existingItemsData || [];

    // 3. Fetch existing payments specifically attributed to this invoice
    const { data: existingPayments, error: paymentsErr } = await supabase
      .from("payments")
      .select("*")
      .eq("invoice_id", existingInvoice.id);

    if (paymentsErr) {
      console.error("Failed to fetch payment ledger for invoice update:", paymentsErr);
      return { success: false, error: `Failed to load payment ledger: ${paymentsErr.message}` };
    }

    const invoicePayments = existingPayments || [];
    const hasPayments = invoicePayments.length > 0;

    // 4. Derive existing itemized discounts explicitly from fetched invoice_items records
    const existingItemDiscount = currentItems
      .filter((i: any) => i.category === 'discount')
      .reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0);

    // Existing flat discount = total discount stored on invoice header minus itemized discounts
    const existingFlatDiscount = Math.max(0, (Number(existingInvoice.discount_amount) || 0) - existingItemDiscount);

    // 5. Replace blanket financial lock:
    // Allow charge changes with financial validation: newGrandTotal >= netPaymentsReceived.
    // If payments exist on this invoice, grand total cannot fall below collected payments.
    if (hasPayments) {
      const isPreservingItems = input.items === undefined || input.items === null;
      if (!isPreservingItems) {
        if (!input.items || input.items.length === 0) {
          return { success: false, error: "An invoice must have at least one line item." };
        }
        for (let i = 0; i < input.items.length; i++) {
          const it = input.items[i];
          if (!it.description || !it.description.trim()) {
            return { success: false, error: `Item #${i + 1} is missing a Service / Item Name.` };
          }
          const qty = Number(it.quantity);
          if (isNaN(qty) || qty < 1) {
            return { success: false, error: `Quantity must be at least 1 for "${it.description.trim()}".` };
          }
          const rate = Number(it.rate);
          if (isNaN(rate) || rate < 0) {
            return { success: false, error: `Rate cannot be negative for "${it.description.trim()}".` };
          }
        }
      }

      const itemsForCalculation = isPreservingItems ? currentItems : input.items;
      const flatDiscount = input.discountAmount !== undefined ? input.discountAmount : existingFlatDiscount;
      const taxRate = input.taxRate !== undefined ? input.taxRate : Number(existingInvoice.tax_rate) || 0;
      const totals = calculateInvoiceTotals(itemsForCalculation as any, taxRate, flatDiscount, invoicePayments);

      // Financial validation: newGrandTotal >= amount_paid
      if (totals.grandTotal < Number(existingInvoice.amount_paid)) {
        return {
          success: false,
          error: `Cannot update invoice: The new grand total (₹${totals.grandTotal}) cannot be less than payments already collected (₹${existingInvoice.amount_paid}). Please process a refund or adjustment first.`
        };
      }

      // Safe update for invoices with payments
      if (!isPreservingItems) {
        // Delete existing items and insert new items
        const { error: delErr } = await supabase
          .from("invoice_items")
          .delete()
          .eq("invoice_id", existingInvoice.id);

        if (delErr) {
          return { success: false, error: `Failed to update line items: ${delErr.message}` };
        }

        const newItemsToInsert = (input.items || []).map((item, idx) => {
          const qty = Number(item.quantity) || 1;
          const rate = Number(item.rate) || 0;
          const itemAmount = item.amount !== undefined ? Number(item.amount) : Number((qty * rate).toFixed(2));
          return {
            invoice_id: existingInvoice.id,
            homestay_id: existingInvoice.homestay_id,
            category: item.category || 'room',
            description: item.description?.trim() || '',
            stay_period: item.stay_period || null,
            quantity: qty,
            rate: rate,
            amount: itemAmount,
            sort_order: item.sort_order ?? idx,
          };
        });

        const { error: insErr } = await supabase
          .from("invoice_items")
          .insert(newItemsToInsert);

        if (insErr) {
          return { success: false, error: `Failed to insert updated line items: ${insErr.message}` };
        }
      }

      const targetStatus = input.status || existingInvoice.status;
      const reconciledStatus = reconcileStatusWithLedger(targetStatus, totals.paymentStatus);

      const patchData: Record<string, any> = {
        subtotal: totals.subtotal,
        tax_rate: taxRate,
        tax_amount: totals.taxAmount,
        discount_amount: flatDiscount,
        grand_total: totals.grandTotal,
        status: reconciledStatus,
        updated_at: new Date().toISOString(),
      };

      if (input.guestName !== undefined) patchData.guest_name = input.guestName.trim();
      if (input.guestPhone !== undefined) patchData.guest_phone = input.guestPhone ? input.guestPhone.trim() : null;
      if (input.guestEmail !== undefined) patchData.guest_email = input.guestEmail ? input.guestEmail.trim() : null;
      if (input.guestAddress !== undefined) patchData.guest_address = input.guestAddress ? input.guestAddress.trim() : null;
      if (input.notes !== undefined) patchData.notes = input.notes ? input.notes.trim() : null;
      if (input.houseRules !== undefined) patchData.house_rules = input.houseRules ? input.houseRules.trim() : null;
      if (input.invoiceDate !== undefined) patchData.invoice_date = input.invoiceDate;

      const { error: updateInvErr } = await supabase
        .from("invoices")
        .update(patchData)
        .eq("id", existingInvoice.id);

      if (updateInvErr) {
        return { success: false, error: updateInvErr.message || "Failed to update invoice." };
      }

      // Reconcile status and balance with payment ledger
      await supabase.rpc("reconcile_invoice_summary", { p_invoice_id: existingInvoice.id });

      const fullUpdatedResult = await getInvoiceByIdAction(input.id);
      return {
        success: true,
        invoiceId: input.id,
        invoice: fullUpdatedResult.invoice
      };
    }

    // 6. Unpaid invoice flow: Determine items behavior and calculate authoritative totals
    // - Omitted (undefined) or explicit null: preserve existing items per documented SQL RPC contract
    // - Array (including empty array []): replace all items with the provided array
    const isPreservingItems = input.items === undefined || input.items === null;
    if (!isPreservingItems) {
      if (!input.items || input.items.length === 0) {
        return { success: false, error: "An invoice must have at least one line item." };
      }
      for (let i = 0; i < input.items.length; i++) {
        const it = input.items[i];
        if (!it.description || !it.description.trim()) {
          return { success: false, error: `Item #${i + 1} is missing a Service / Item Name.` };
        }
        const qty = Number(it.quantity);
        if (isNaN(qty) || qty < 1) {
          return { success: false, error: `Quantity must be at least 1 for "${it.description.trim()}".` };
        }
        const rate = Number(it.rate);
        if (isNaN(rate) || rate < 0) {
          return { success: false, error: `Rate cannot be negative for "${it.description.trim()}".` };
        }
        if (rate === 0 && it.category !== 'discount' && !it.is_complimentary) {
          return { success: false, error: `Rate cannot be ₹0 for "${it.description.trim()}". Mark as complimentary if intended.` };
        }
      }
    }
    const itemsForCalculation = isPreservingItems ? currentItems : input.items;

    const flatDiscount = input.discountAmount !== undefined ? input.discountAmount : existingFlatDiscount;
    const taxRate = input.taxRate !== undefined ? input.taxRate : Number(existingInvoice.tax_rate) || 0;
    const totals = calculateInvoiceTotals(itemsForCalculation as any, taxRate, flatDiscount, invoicePayments);

    const targetStatus = input.status || existingInvoice.status;
    const reconciledStatus = reconcileStatusWithLedger(targetStatus, totals.paymentStatus);

    // 7. Build presence-aware JSON patch payload (omitted fields are preserved, null/empty cleared)
    const patchPayload: Record<string, any> = {
      subtotal: totals.subtotal,
      tax_rate: taxRate,
      tax_amount: totals.taxAmount,
      flat_discount: flatDiscount,
      grand_total: totals.grandTotal,
      status: reconciledStatus,
    };

    if (input.invoiceNumber !== undefined) patchPayload.invoice_number = input.invoiceNumber.trim();
    if (input.invoiceDate !== undefined) patchPayload.invoice_date = input.invoiceDate;
    if (input.guestName !== undefined) patchPayload.guest_name = input.guestName.trim();
    if (input.guestPhone !== undefined) patchPayload.guest_phone = input.guestPhone;
    if (input.guestEmail !== undefined) patchPayload.guest_email = input.guestEmail;
    if (input.guestAddress !== undefined) patchPayload.guest_address = input.guestAddress;
    if (input.roomId !== undefined) patchPayload.room_id = input.roomId;
    if (input.roomName !== undefined) patchPayload.room_name = input.roomName;
    if (input.notes !== undefined) patchPayload.notes = input.notes;
    if (input.houseRules !== undefined) patchPayload.house_rules = input.houseRules;
    if (input.checkIn !== undefined) patchPayload.check_in = input.checkIn;
    if (input.checkOut !== undefined) patchPayload.check_out = input.checkOut;

    // 8. Line items payload: null means preserve existing items, array replaces items atomically
    const itemsPayload = isPreservingItems ? null : (input.items || []).map((item, idx) => {
      const qty = Number(item.quantity) || 1;
      const rate = Number(item.rate) || 0;
      const itemAmount = item.amount !== undefined ? Number(item.amount) : Number((qty * rate).toFixed(2));

      return {
        category: item.category || 'room',
        description: item.description?.trim() || '',
        stay_period: item.stay_period || null,
        quantity: qty,
        rate: rate,
        amount: itemAmount,
        sort_order: item.sort_order ?? idx,
      };
    });

    const { error: rpcErr } = await supabase.rpc(
      "update_invoice_with_items",
      {
        p_invoice_id: input.id,
        p_patch: patchPayload,
        p_items: itemsPayload,
      }
    );

    if (rpcErr) {
      if (rpcErr?.code === 'PGRST202' || rpcErr?.code === '42883') {
        return { 
          success: false, 
          error: `RPC 'update_invoice_with_items' does not exist in schema cache [${rpcErr.code}]: ${rpcErr.message}. An approved database migration is required.` 
        };
      }
      if (rpcErr?.code === 'PGRST205' || rpcErr?.code === '42P01') {
        return { 
          success: false, 
          error: `Database table 'public.invoices' does not exist in schema cache [${rpcErr.code}]: ${rpcErr.message}. An approved database migration is required.` 
        };
      }
      return { 
        success: false, 
        error: rpcErr?.code ? `[${rpcErr.code}] ${rpcErr.message}` : (rpcErr.message || "Failed to update invoice.") 
      };
    }

    const fullUpdatedResult = await getInvoiceByIdAction(input.id);
    return { 
      success: true, 
      invoiceId: input.id,
      invoice: fullUpdatedResult.invoice
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update invoice." };
  }
}

/**
 * Cancel or Delete an invoice.
 */
export async function deleteInvoiceAction(invoiceId: string): Promise<InvoiceActionResult> {
  try {
    const { error: authErr, supabase, partner } = await getAuthenticatedPartner();
    if (authErr || !supabase || !partner) {
      return { success: false, error: authErr || "Authentication failed." };
    }

    const { data: invoice, error: fetchErr } = await supabase
      .from("invoices")
      .select("id, homestay_id, status")
      .eq("id", invoiceId)
      .single();

    if (fetchErr || !invoice) {
      return { success: false, error: "Invoice not found." };
    }

    const isSuperAdmin = partner.role === 'super_admin';
    if (!isSuperAdmin && partner.homestay_id !== invoice.homestay_id) {
      return { success: false, error: "Unauthorized access to this invoice." };
    }

    // Mark as cancelled for audit integrity
    const { error: updateErr } = await supabase
      .from("invoices")
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq("id", invoiceId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to cancel invoice." };
  }
}

/**
 * Record a payment directly from the billing interface.
 * Validates against overpayment and updates financial ledger atomically.
 */
export async function recordInvoicePaymentAction(input: {
  invoiceId: string;
  amount: string | number;
  paymentMethod: PaymentMethod;
  paymentStage?: PaymentStage;
  transactionRef?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
}): Promise<InvoiceActionResult> {
  try {
    const { error: authErr, supabase, partner } = await getAuthenticatedPartner();
    if (authErr || !supabase || !partner) {
      return { success: false, error: authErr || "Authentication failed." };
    }

    // 1. Validate monetary input
    if (!isValidMoneyInput(input.amount)) {
      return { success: false, error: "Invalid payment amount format." };
    }
    const paymentPaise = rupeesToPaise(input.amount);
    if (paymentPaise <= BigInt(0)) {
      return { success: false, error: "Payment amount must be greater than zero." };
    }
    const decimalAmount = paiseToDecimalString(paymentPaise);

    const effectiveStage: PaymentStage = input.paymentStage || 'partial';
    const formattedNotes = formatPaymentNotesWithStage(effectiveStage, input.notes);

    // 2. Execute atomic payment recording RPC inside single PostgreSQL transaction
    const { data: rpcRes, error: rpcErr } = await supabase.rpc(
      "record_invoice_payment",
      {
        p_invoice_id: input.invoiceId,
        p_amount: Number(decimalAmount),
        p_payment_method: input.paymentMethod || 'cash',
        p_transaction_ref: input.transactionRef?.trim() || null,
        p_notes: formattedNotes,
        p_idempotency_key: input.idempotencyKey?.trim() || null,
      }
    );

    if (rpcErr) {
      console.error("[HMS Invoices] record_invoice_payment error:", rpcErr);
      const msg = rpcErr.message || "";
      if (msg.includes("INVOICE_OVERPAYMENT_EXCEEDED")) {
        return { 
          success: false, 
          error: "Payment rejected: Payment amount exceeds the remaining outstanding balance of this invoice." 
        };
      }
      if (msg.includes("INVOICE_CANCELLED") || msg.includes("PAYMENT_INVOICE_CANCELLED")) {
        return { success: false, error: "Cannot record payment against a cancelled invoice." };
      }
      if (msg.includes("ACCESS_DENIED") || msg.includes("PAYMENT_RECORDER_UNAUTHORIZED")) {
        return { success: false, error: "Unauthorized to record payment for this invoice." };
      }
      if (msg.includes("IDEMPOTENCY_CONFLICT")) {
        return { success: false, error: msg };
      }
      if (rpcErr.code === 'PGRST202' || rpcErr.code === '42883') {
        return { 
          success: false, 
          error: `RPC 'record_invoice_payment' does not exist in schema cache [${rpcErr.code}]: ${rpcErr.message}. An approved database migration is required.` 
        };
      }
      if (rpcErr.code === 'PGRST205' || rpcErr.code === '42P01') {
        return { 
          success: false, 
          error: `Database table 'public.invoices' does not exist in schema cache [${rpcErr.code}]: ${rpcErr.message}. An approved database migration is required.` 
        };
      }
      return { success: false, error: rpcErr.code ? `[${rpcErr.code}] ${rpcErr.message}` : rpcErr.message };
    }

    // 3. Distinguish committed payment from failed summary refresh
    const committedPaymentId = (rpcRes as any)?.payment_id;
    try {
      const refreshed = await getInvoiceByIdAction(input.invoiceId);
      if (refreshed.success && refreshed.invoice) {
        return {
          ...refreshed,
          paymentId: committedPaymentId,
        };
      }
      console.warn("[HMS Invoices] Summary refresh returned non-success after payment commit:", refreshed.error);
    } catch (refreshErr: any) {
      console.warn("[HMS Invoices] Summary refresh threw after payment commit:", refreshErr?.message || refreshErr);
    }

    // Fallback: The payment committed successfully, but the full summary refresh encountered an error.
    // Return success: true so the client knows the payment is committed and does not re-submit.
    return {
      success: true,
      paymentId: committedPaymentId,
      invoiceId: input.invoiceId,
      warning: "Payment was recorded successfully, but the latest invoice summary could not be refreshed.",
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to record invoice payment." };
  }
}

/**
 * Reconcile an invoice's status, amount_paid, and balance_due against the authoritative
 * append-only public.payments ledger.
 *
 * Guarantees:
 * 1. Never mutates existing payment rows in public.payments.
 * 2. Strictly idempotent: computes sum over distinct immutable payment ledger records.
 * 3. Prevents race conditions and double counting.
 * 4. Correctly updates status after payments, refunds, or reversals.
 */
export async function reconcileInvoiceWithLedgerAction(invoiceId: string): Promise<InvoiceActionResult> {
  try {
    const { error: authErr, supabase, partner } = await getAuthenticatedPartner();
    if (authErr || !supabase || !partner) {
      return { success: false, error: authErr || "Authentication failed." };
    }

    // Call database-side authoritative reconciliation RPC using deterministic lock ordering (bookings -> invoices)
    const { data: rpcRes, error: rpcErr } = await supabase.rpc(
      "reconcile_invoice_summary",
      { p_invoice_id: invoiceId }
    );

    if (rpcErr) {
      console.error("[HMS Invoices] reconcile_invoice_summary RPC error:", rpcErr);
      if (rpcErr.code === 'PGRST202' || rpcErr.code === '42883') {
        return {
          success: false,
          error: `RPC 'reconcile_invoice_summary' does not exist in schema cache [${rpcErr.code}]: ${rpcErr.message}. An approved database migration is required.`
        };
      }
      return { success: false, error: rpcErr.message || "Failed to reconcile invoice summary with ledger." };
    }

    // Refresh and return full populated invoice record
    return await getInvoiceByIdAction(invoiceId);
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to reconcile invoice with ledger." };
  }
}
