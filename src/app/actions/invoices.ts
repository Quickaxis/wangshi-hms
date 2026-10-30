"use server";

import { createClient } from "@/lib/supabase/server";
import { 
  DbInvoice, 
  DbInvoiceItem, 
  CreateInvoiceInput, 
  UpdateInvoiceInput, 
  InvoiceStatus,
  PaymentMethod
} from "@/lib/types";
import { 
  calculateInvoiceTotals, 
  paiseToDecimalString, 
  rupeesToPaise,
  reconcileStatusWithLedger,
  isValidMoneyInput 
} from "@/lib/money";
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
            paymentsByInvoice[p.invoice_id].push(p);
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

    // Fetch payments for this booking
    const { data: payments, error: paymentsErr } = await supabase
      .from("payments")
      .select("*, partners(id, name, email)")
      .eq("booking_id", invoice.booking_id)
      .order("created_at", { ascending: true });

    if (paymentsErr) {
      console.error("Failed to fetch payment ledger for invoice:", paymentsErr);
      return { success: false, error: `Failed to load payment ledger: ${paymentsErr.message}` };
    }

    const allPayments = payments || [];
    // Only payments explicitly attributed to THIS invoice
    const invoicePayments = allPayments.filter((p: any) => p.invoice_id === invoice.id);

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
 * Check if an active invoice already exists for a booking.
 */
export async function getInvoiceByBookingIdAction(bookingId: string): Promise<InvoiceActionResult> {
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
      .eq("booking_id", bookingId)
      .neq("status", "cancelled")
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

    // 2. Prevent duplicate active invoices unless explicitly allowed
    if (!input.allowDuplicate) {
      const { data: existingActive } = await supabase
        .from("invoices")
        .select("id, invoice_number")
        .eq("booking_id", input.bookingId)
        .neq("status", "cancelled")
        .maybeSingle();

      if (existingActive) {
        return { 
          success: false, 
          error: `An active invoice (${existingActive.invoice_number}) already exists for this booking. You can edit or view the existing invoice instead.` 
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

    // 5. If payments exist on this invoice, financial fields (line items, rates, taxes, discounts)
    // are strictly immutable to maintain ledger integrity. Only non-financial guest/stay metadata
    // may be safely updated on public.invoices.
    if (hasPayments) {
      const hasFinancialChange = hasFinancialModifications(
        input,
        existingInvoice,
        currentItems,
        existingFlatDiscount
      );

      if (hasFinancialChange) {
        return {
          success: false,
          error: "Financial records are locked because payments have been recorded for this invoice. Line items, taxes, and discounts cannot be modified."
        };
      }

      // Check contract field modifications (invoice number, issue date, room, stay dates)
      const hasContractModifications =
        (input.invoiceNumber !== undefined && input.invoiceNumber.trim() !== (existingInvoice.invoice_number || '').trim()) ||
        (input.invoiceDate !== undefined && input.invoiceDate !== existingInvoice.invoice_date) ||
        (input.checkIn !== undefined && input.checkIn !== existingInvoice.check_in) ||
        (input.checkOut !== undefined && input.checkOut !== existingInvoice.check_out) ||
        (input.roomName !== undefined && ((input.roomName ? input.roomName.trim() : '') !== (existingInvoice.room_name || '').trim())) ||
        (input.roomId !== undefined && input.roomId !== existingInvoice.room_id);

      if (hasContractModifications) {
        return {
          success: false,
          error: "Contract records are locked because payments have been recorded for this invoice. Invoice number, issue date, accommodation, and stay dates cannot be modified."
        };
      }

      // Safe metadata-only update directly on public.invoices
      const metadataPatch: Record<string, any> = {};
      if (input.guestName !== undefined) metadataPatch.guest_name = input.guestName.trim();
      if (input.guestPhone !== undefined) metadataPatch.guest_phone = input.guestPhone ? input.guestPhone.trim() : null;
      if (input.guestEmail !== undefined) metadataPatch.guest_email = input.guestEmail ? input.guestEmail.trim() : null;
      if (input.guestAddress !== undefined) metadataPatch.guest_address = input.guestAddress ? input.guestAddress.trim() : null;
      if (input.notes !== undefined) metadataPatch.notes = input.notes ? input.notes.trim() : null;
      if (input.houseRules !== undefined) metadataPatch.house_rules = input.houseRules ? input.houseRules.trim() : null;

      if (Object.keys(metadataPatch).length > 0) {
        const { error: updateErr } = await supabase
          .from("invoices")
          .update(metadataPatch)
          .eq("id", existingInvoice.id);

        if (updateErr) {
          return {
            success: false,
            error: updateErr.message || "Failed to update invoice metadata."
          };
        }
      }

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

    // 2. Execute atomic payment recording RPC inside single PostgreSQL transaction
    const { data: rpcRes, error: rpcErr } = await supabase.rpc(
      "record_invoice_payment",
      {
        p_invoice_id: input.invoiceId,
        p_amount: Number(decimalAmount),
        p_payment_method: input.paymentMethod || 'cash',
        p_transaction_ref: input.transactionRef?.trim() || null,
        p_notes: input.notes?.trim() || null,
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
