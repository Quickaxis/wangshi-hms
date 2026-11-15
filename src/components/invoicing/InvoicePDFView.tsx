"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import { DbInvoice, Homestay, InvoiceItemCategory } from "@/lib/types";
import { formatISTCompactDate, formatISTLedgerDateTime, formatReceiptNumber } from "@/lib/dateUtils";
import { formatMethodLabel } from "@/lib/receipts";
import { 
  Building2, 
  Phone, 
  Mail, 
  Globe, 
  Clock, 
  CheckCircle2, 
  ShieldCheck, 
  MapPin, 
  Mountain, 
  Receipt,
  BedDouble,
  Utensils,
  CreditCard
} from "lucide-react";

interface InvoicePDFViewProps {
  invoice: DbInvoice;
  homestay?: Homestay | null;
  className?: string;
  isPrintVersion?: boolean;
}

/**
 * Format internal category string to clean client-facing label
 */
function getCategoryLabel(category?: InvoiceItemCategory | string | null): string {
  switch (category) {
    case 'room': return 'Accommodation';
    case 'food_beverage': return 'Food & Dining';
    case 'laundry': return 'Laundry';
    case 'extra_bed': return 'Extra Bedding';
    case 'additional_nights': return 'Extended Stay';
    case 'discount': return 'Concession / Discount';
    case 'custom': return 'Guest Service';
    default: return category ? category.replace(/_/g, ' ') : 'Service';
  }
}

/**
 * Clean transaction reference or notes for guest view.
 * Removes internal bracketed tags like [Advance], [Final], staff names, etc.
 */
function sanitizePaymentNotes(rawNotes?: string | null): string | null {
  if (!rawNotes || typeof rawNotes !== "string") return null;
  const cleaned = rawNotes
    .replace(/\[(?:advance|final|during_stay|partial|payment)\]/gi, "")
    .trim();
  return cleaned || null;
}

/**
 * Determine client-facing payment stage badge details
 */
function getPaymentStageDisplay(stage?: string | null, rawNotes?: string | null): {
  label: string;
  badgeClass: string;
} {
  const normStage = (stage || "").toLowerCase();
  const normNotes = (rawNotes || "").toLowerCase();

  if (normStage === "advance" || normNotes.includes("[advance]")) {
    return {
      label: "Advance Payment",
      badgeClass: "bg-blue-50 text-blue-700 border-blue-200"
    };
  }
  if (normStage === "final" || normNotes.includes("[final]")) {
    return {
      label: "Final Settlement",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200"
    };
  }
  if (normStage === "during_stay" || normStage === "partial" || normNotes.includes("[during_stay]")) {
    return {
      label: "In-Stay Payment",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200"
    };
  }
  return {
    label: "Payment Received",
    badgeClass: "bg-stone-100 text-stone-700 border-stone-200"
  };
}

export function InvoicePDFView({ 
  invoice, 
  homestay, 
  className = "", 
  isPrintVersion = false 
}: InvoicePDFViewProps) {
  const currentHomestay = homestay || invoice.homestay;
  const propertyName = currentHomestay?.name || "Wangshi Homestay";
  const propertyLocation = currentHomestay?.location || "";
  const propertyPhone = currentHomestay?.phone || "";
  const propertyEmail = currentHomestay?.email || "";
  const propertyWebsite = currentHomestay?.slug 
    ? `${currentHomestay.slug}.wangshihms.in` 
    : "";
  const propertyLogo = currentHomestay?.logo_url;

  // Format stay dates
  const checkInFormatted = invoice.check_in 
    ? `${formatISTCompactDate(invoice.check_in)}` 
    : "—";
  const checkOutFormatted = invoice.check_out 
    ? `${formatISTCompactDate(invoice.check_out)}` 
    : "—";

  // Calculate stay duration (nights)
  let stayNights = 1;
  if (invoice.check_in && invoice.check_out) {
    const d1 = new Date(invoice.check_in).getTime();
    const d2 = new Date(invoice.check_out).getTime();
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    if (diff > 0) stayNights = diff;
  }

  // Separate line items: Room Charges vs. Additional Guest Services
  const { roomItems, additionalServices, roomSubtotal, servicesSubtotal } = useMemo(() => {
    const items = invoice.items || [];
    const rooms = items.filter(it => it.category === 'room');
    const services = items.filter(it => it.category !== 'room');

    const rSub = rooms.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    const sSub = services.reduce((sum, it) => sum + (it.category === 'discount' ? -Number(it.amount || 0) : Number(it.amount || 0)), 0);

    return {
      roomItems: rooms,
      additionalServices: services,
      roomSubtotal: rooms.length > 0 ? rSub : Number(invoice.subtotal || 0),
      servicesSubtotal: sSub
    };
  }, [invoice.items, invoice.subtotal]);

  // Determine payment settlement status
  const balanceDue = Number(invoice.balance_due || 0);
  const isSettled = balanceDue <= 0.005;
  const paymentsList = invoice.payments || [];

  // Tax breakdown (CGST + SGST 50/50 split if tax is present)
  const hasTax = Number(invoice.tax_rate) > 0 && Number(invoice.tax_amount) > 0;
  const halfTaxRate = (Number(invoice.tax_rate) / 2).toFixed(1);
  const halfTaxAmount = (Number(invoice.tax_amount) / 2).toFixed(2);

  // Standard guest-facing policies (strictly client-facing, never internal notes)
  const houseRulesClean = useMemo(() => {
    if (!invoice.house_rules || !invoice.house_rules.trim()) {
      return "Standard Check-in: 12:00 PM • Standard Check-out: 11:00 AM • Government photo ID is required upon check-in. Quiet hours observed after 10:00 PM.";
    }
    // Filter out accidental internal logs if any were placed in house_rules
    const filtered = invoice.house_rules
      .split("\n")
      .filter(line => !line.trim().startsWith("[") && !line.includes("Live Guest Folio"))
      .join("\n")
      .trim();
    return filtered || "Standard Check-in: 12:00 PM • Standard Check-out: 11:00 AM • Government photo ID is required upon check-in.";
  }, [invoice.house_rules]);

  return (
    <div 
      className={`invoice-print-container bg-white text-stone-900 font-sans ${
        isPrintVersion 
          ? "p-0 max-w-none w-full shadow-none border-none min-h-0" 
          : "p-6 sm:p-8 md:p-10 max-w-[850px] w-full mx-auto shadow-xl rounded-xl border border-stone-200"
      } print:shadow-none print:p-0 print:m-0 print:max-w-none print:w-full print:border-none print:min-h-0 ${className}`}
    >
      {/* ─── Top Refined Brand Accent Line ─── */}
      <div className="h-1.5 w-full bg-gradient-to-r from-stone-900 via-[#5146D8] to-stone-900 rounded-full mb-6 print:mb-4" />

      {/* ─── 1. Header: Property Identity & Folio Specifications ─── */}
      <div className="invoice-header flex flex-col sm:flex-row print:flex-row justify-between items-start print:items-start gap-4 pb-6 print:pb-4 border-b border-stone-200 break-inside-avoid print:break-inside-avoid">
        {/* Left: Property Branding */}
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-14 h-14 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
            {propertyLogo ? (
              <Image 
                src={propertyLogo} 
                alt={propertyName} 
                width={56} 
                height={56} 
                priority
                unoptimized
                className="w-full h-full object-cover" 
              />
            ) : (
              <div className="w-full h-full bg-stone-900 flex flex-col items-center justify-center text-white">
                <Mountain className="w-6 h-6 text-stone-200" strokeWidth={1.5} />
                <span className="text-[7px] font-sans font-semibold tracking-wider text-stone-300 mt-0.5 uppercase">HOMESTAY</span>
              </div>
            )}
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-serif font-bold tracking-tight text-stone-900 truncate">
              {propertyName}
            </h1>
            {propertyLocation && (
              <p className="text-xs text-stone-600 font-medium flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span>{propertyLocation}</span>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-stone-500 mt-1">
              {propertyPhone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3 text-stone-400" />
                  <span className="font-mono">{propertyPhone}</span>
                </span>
              )}
              {propertyPhone && propertyEmail && <span>•</span>}
              {propertyEmail && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3 text-stone-400" />
                  <span>{propertyEmail}</span>
                </span>
              )}
              {propertyWebsite && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Globe className="w-3 h-3 text-stone-400" />
                    <span className="font-medium text-stone-700">{propertyWebsite}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Invoice Document Metadata */}
        <div className="text-left sm:text-right print:text-right shrink-0">
          <div className="inline-block px-2.5 py-0.5 bg-stone-100 border border-stone-200 rounded-md text-[10px] font-bold text-stone-700 uppercase tracking-widest mb-1.5">
            Official Tax Invoice & Folio
          </div>
          <div className="text-lg sm:text-xl font-mono font-bold tracking-tight text-stone-900">
            {invoice.invoice_number || "DRAFT-FOLIO"}
          </div>
          <div className="text-xs text-stone-600 mt-0.5">
            Invoice Date: <span className="font-medium text-stone-900">{formatISTCompactDate(invoice.invoice_date)}</span>
          </div>
          {invoice.booking_id && (
            <div className="text-[11px] text-stone-500 mt-0.5">
              Reservation ID: <span className="font-mono font-medium text-stone-800">WNG-{invoice.booking_id.slice(0, 8).toUpperCase()}</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── 2. Settlement Status Banner ─── */}
      <div className="invoice-settlement-banner my-4 print:my-3 flex flex-col sm:flex-row print:flex-row items-center justify-between gap-3 p-3.5 print:py-2.5 rounded-xl border bg-stone-50/80 border-stone-200 break-inside-avoid print:break-inside-avoid shadow-xs">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            isSettled 
              ? "bg-emerald-100 text-emerald-800 border border-emerald-300" 
              : "bg-amber-100 text-amber-800 border border-amber-300"
          }`}>
            {isSettled ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
          </div>
          <div>
            <div className="text-xs font-semibold text-stone-900 flex items-center gap-2">
              <span>Settlement Status:</span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                isSettled 
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300" 
                  : "bg-amber-50 text-amber-900 border-amber-300"
              }`}>
                {isSettled ? "Paid in Full • Folio Settled" : "Balance Due at Check-out"}
              </span>
            </div>
            <div className="text-[11px] text-stone-500 mt-0.5">
              Total Amount: <span className="font-mono font-semibold text-stone-800">₹{Number(invoice.grand_total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              {" • "}
              Total Paid: <span className="font-mono font-semibold text-emerald-700">₹{Number(invoice.amount_paid).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">
            Remaining Balance
          </div>
          <div className={`text-base sm:text-lg font-mono font-black tabular-nums ${isSettled ? "text-emerald-700" : "text-rose-700"}`}>
            ₹{Number(invoice.balance_due).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* ─── 3. Stay Details Ribbon ─── */}
      <div className="invoice-stay-ribbon grid grid-cols-2 md:grid-cols-4 print:grid-cols-4 gap-2.5 bg-stone-50/60 p-3 print:py-2.5 rounded-xl border border-stone-200 mb-4 print:mb-3 text-xs break-inside-avoid print:break-inside-avoid">
        <div className="border-r border-stone-200 pr-2">
          <span className="block text-[10px] font-bold tracking-wider text-stone-500 uppercase">ACCOMMODATION</span>
          <span className="font-bold text-stone-900 mt-0.5 block truncate" title={invoice.room_name || "Assigned Room"}>
            {invoice.room_name || "Homestay Accommodation"}
          </span>
        </div>
        <div className="border-r border-transparent md:border-stone-200 print:border-stone-200 px-2">
          <span className="block text-[10px] font-bold tracking-wider text-stone-500 uppercase">CHECK-IN</span>
          <span className="font-semibold text-stone-800 mt-0.5 block text-[11px]">{checkInFormatted}</span>
        </div>
        <div className="border-r border-stone-200 px-2">
          <span className="block text-[10px] font-bold tracking-wider text-stone-500 uppercase">CHECK-OUT</span>
          <span className="font-semibold text-stone-800 mt-0.5 block text-[11px]">{checkOutFormatted}</span>
        </div>
        <div className="pl-2">
          <span className="block text-[10px] font-bold tracking-wider text-stone-500 uppercase">STAY DURATION</span>
          <span className="font-bold text-stone-900 mt-0.5 block">
            {stayNights} {stayNights === 1 ? 'Night' : 'Nights'}
          </span>
        </div>
      </div>

      {/* ─── 4. Guest Details & Property Information Grid ─── */}
      <div className="invoice-guest-details grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-4 print:gap-3 mb-5 print:mb-3 text-xs break-inside-avoid print:break-inside-avoid">
        {/* Guest Details */}
        <div className="p-3.5 print:p-3 bg-stone-50/40 border border-stone-200 rounded-xl space-y-1.5">
          <div className="text-[10px] font-bold tracking-wider text-stone-500 uppercase border-b border-stone-200 pb-1 mb-2">
            GUEST & RESERVATION DETAILS
          </div>
          <div className="flex">
            <span className="w-24 text-stone-500 font-medium">Guest Name:</span>
            <span className="font-bold text-stone-900">{invoice.guest_name || "Valued Guest"}</span>
          </div>
          {invoice.guest_phone && (
            <div className="flex">
              <span className="w-24 text-stone-500 font-medium">Contact:</span>
              <span className="text-stone-800 font-mono">{invoice.guest_phone}</span>
            </div>
          )}
          {invoice.guest_email && (
            <div className="flex">
              <span className="w-24 text-stone-500 font-medium">Email:</span>
              <span className="text-stone-800 truncate">{invoice.guest_email}</span>
            </div>
          )}
          <div className="flex">
            <span className="w-24 text-stone-500 font-medium">Billing Address:</span>
            <span className="text-stone-800">{invoice.guest_address ? invoice.guest_address : "On File"}</span>
          </div>
        </div>

        {/* Property & Folio Specifications */}
        <div className="p-3.5 print:p-3 bg-stone-50/40 border border-stone-200 rounded-xl space-y-1.5">
          <div className="text-[10px] font-bold tracking-wider text-stone-500 uppercase border-b border-stone-200 pb-1 mb-2">
            FOLIO SPECIFICATIONS
          </div>
          <div className="flex">
            <span className="w-28 text-stone-500 font-medium">Currency:</span>
            <span className="text-stone-800 font-medium">INR (Indian Rupee - ₹)</span>
          </div>
          <div className="flex">
            <span className="w-28 text-stone-500 font-medium">Host Property:</span>
            <span className="text-stone-800 font-semibold">{propertyName}</span>
          </div>
          <div className="flex">
            <span className="w-28 text-stone-500 font-medium">Check-in / Out:</span>
            <span className="text-stone-800 font-medium">12:00 PM / 11:00 AM</span>
          </div>
          {propertyPhone && (
            <div className="flex">
              <span className="w-28 text-stone-500 font-medium">Front Desk:</span>
              <span className="text-stone-800 font-mono">{propertyPhone}</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── 5. LINE ITEMS: CLEAR SEPARATION OF ROOM CHARGES & ADDITIONAL SERVICES ─── */}

      {/* SECTION A: Room Accommodation Charges */}
      <div className="mb-5 print:mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
            <BedDouble className="w-3.5 h-3.5 text-stone-600" />
            <span>Room Accommodation Charges</span>
          </h3>
          <span className="text-[11px] font-medium text-stone-500">
            {roomItems.length} {roomItems.length === 1 ? "Room" : "Rooms"}
          </span>
        </div>

        <div className="rounded-xl border border-stone-200 overflow-hidden print:overflow-visible">
          <table className="w-full text-left border-collapse text-xs print:text-[11px]">
            <thead className="print:table-header-group">
              <tr className="bg-stone-900 text-stone-100 text-[10px] tracking-wider uppercase font-semibold break-inside-avoid print:break-inside-avoid">
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3">ACCOMMODATION & STAY DETAILS</th>
                <th className="py-2.5 px-3 text-right">RATE / NIGHT</th>
                <th className="py-2.5 px-2 text-center w-16">NIGHTS</th>
                <th className="py-2.5 px-3 text-right w-28">AMOUNT (INR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {roomItems.length > 0 ? (
                roomItems.map((item, idx) => (
                  <tr key={item.id || idx} className={`break-inside-avoid print:break-inside-avoid ${idx % 2 === 0 ? "bg-white" : "bg-stone-50/50"}`}>
                    <td className="py-2.5 px-3 text-center text-stone-400 font-mono text-[11px]">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-stone-900">{item.description}</div>
                      {item.stay_period && (
                        <div className="text-[11px] text-stone-500 mt-0.5">{item.stay_period}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-stone-700 font-mono tabular-nums">
                      ₹{Number(item.rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-2 text-center font-medium text-stone-800 tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-stone-900 font-mono tabular-nums">
                      ₹{Number(item.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="bg-white break-inside-avoid print:break-inside-avoid">
                  <td className="py-2.5 px-3 text-center text-stone-400 font-mono text-[11px]">1</td>
                  <td className="py-2.5 px-3">
                    <div className="font-bold text-stone-900">{invoice.room_name || "Room Accommodation"}</div>
                    <div className="text-[11px] text-stone-500 mt-0.5">{checkInFormatted} to {checkOutFormatted}</div>
                  </td>
                  <td className="py-2.5 px-3 text-right text-stone-700 font-mono tabular-nums">
                    ₹{Number(invoice.subtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-2 text-center font-medium text-stone-800 tabular-nums">{stayNights}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-stone-900 font-mono tabular-nums">
                    ₹{Number(invoice.subtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-stone-50 border-t border-stone-200 font-semibold text-stone-800 text-[11px]">
                <td colSpan={4} className="py-2 px-3 text-right uppercase tracking-wider text-stone-600">
                  Room Accommodation Subtotal:
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold text-stone-900">
                  ₹{roomSubtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* SECTION B: Additional Services & Amenities (Only rendered if present) */}
      {additionalServices.length > 0 && (
        <div className="mb-5 print:mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
              <Utensils className="w-3.5 h-3.5 text-stone-600" />
              <span>Additional Guest Services & Amenities</span>
            </h3>
            <span className="text-[11px] font-medium text-stone-500">
              {additionalServices.length} {additionalServices.length === 1 ? "Service" : "Services"}
            </span>
          </div>

          <div className="rounded-xl border border-stone-200 overflow-hidden print:overflow-visible">
            <table className="w-full text-left border-collapse text-xs print:text-[11px]">
              <thead className="print:table-header-group">
                <tr className="bg-stone-100 text-stone-800 text-[10px] tracking-wider uppercase font-semibold border-b border-stone-200 break-inside-avoid print:break-inside-avoid">
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3">SERVICE / AMENITY DESCRIPTION</th>
                  <th className="py-2.5 px-3 w-28">CATEGORY</th>
                  <th className="py-2.5 px-3 text-right w-28">UNIT PRICE</th>
                  <th className="py-2.5 px-2 text-center w-16">QTY</th>
                  <th className="py-2.5 px-3 text-right w-28">AMOUNT (INR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {additionalServices.map((item, idx) => {
                  const isComp = Boolean(item.is_complimentary || Number(item.rate) === 0);
                  const isDisc = item.category === 'discount';

                  return (
                    <tr key={item.id || idx} className={`break-inside-avoid print:break-inside-avoid ${idx % 2 === 0 ? "bg-white" : "bg-stone-50/50"}`}>
                      <td className="py-2.5 px-3 text-center text-stone-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-stone-900">{item.description}</div>
                        {item.stay_period && (
                          <div className="text-[11px] text-stone-500 mt-0.5">{item.stay_period}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-stone-100 text-stone-700 border border-stone-200">
                          {getCategoryLabel(item.category)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-stone-700 font-mono tabular-nums">
                        {isComp ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                            Complimentary
                          </span>
                        ) : (
                          `₹${Number(item.rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center font-medium text-stone-800 tabular-nums">
                        {item.quantity}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-bold font-mono tabular-nums ${isDisc ? 'text-rose-700' : 'text-stone-900'}`}>
                        {isDisc ? '-' : ''}₹{Number(item.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-stone-50 border-t border-stone-200 font-semibold text-stone-800 text-[11px]">
                  <td colSpan={5} className="py-2 px-3 text-right uppercase tracking-wider text-stone-600">
                    Additional Services Subtotal:
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-stone-900">
                    ₹{servicesSubtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ─── 6. Bottom Split: Payment Ledger & Financial Totals ─── */}
      <div className="grid grid-cols-1 md:grid-cols-12 print:grid-cols-12 gap-5 print:gap-4 my-4 print:my-3 pt-3 border-t border-stone-200">
        
        {/* Left 7 cols: Client-Facing Payment Receipts & Stay Guidelines */}
        <div className="md:col-span-7 print:col-span-7 flex flex-col justify-between pr-0 md:pr-2 print:pr-2 space-y-4 print:space-y-3">
          
          {/* Payment Receipts Ledger */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] font-bold tracking-wider text-stone-500 uppercase flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-stone-600" />
                <span>RECORDED SETTLEMENT TRANSACTIONS ({paymentsList.length})</span>
              </h4>
              <span className="text-[10px] text-stone-500">
                Official Receipts
              </span>
            </div>
            
            {paymentsList.length > 0 ? (
              <div className="space-y-2">
                {paymentsList.map((p, idx) => {
                  const stageDetails = getPaymentStageDisplay(p.payment_stage, p.notes);
                  const cleanNotes = sanitizePaymentNotes(p.notes);
                  const receiptNo = p.receipt_number || formatReceiptNumber(p.created_at || new Date(), p.id);
                  const formattedMethod = formatMethodLabel(p.payment_method || "cash");
                  const timestampStr = p.created_at ? formatISTLedgerDateTime(p.created_at) : "Settled at Desk";

                  return (
                    <div 
                      key={p.id || idx}
                      className="p-3 bg-stone-50/70 border border-stone-200 rounded-xl text-xs break-inside-avoid print:break-inside-avoid space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${stageDetails.badgeClass}`}>
                            {stageDetails.label}
                          </span>
                          <span className="font-mono text-[11px] font-bold text-stone-800">
                            {receiptNo}
                          </span>
                        </div>
                        <span className="font-mono text-sm font-bold text-emerald-800">
                          ₹{Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-stone-600 pt-1 border-t border-stone-200/60">
                        <span className="flex items-center gap-1 font-medium">
                          <CreditCard className="w-3 h-3 text-stone-400" />
                          <span>{formattedMethod}</span>
                          {p.transaction_ref && (
                            <span className="text-stone-500 font-mono text-[10px]">({p.transaction_ref})</span>
                          )}
                        </span>
                        <span className="font-mono text-[10px] text-stone-500 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 text-stone-400" />
                          {timestampStr}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3.5 bg-stone-50/50 border border-stone-200 rounded-xl text-xs text-stone-500 break-inside-avoid print:break-inside-avoid">
                No pre-arrival advance payments recorded. Complete stay settlement is due at the front desk upon checkout.
              </div>
            )}
          </div>

          {/* Guest Stay Guidelines & Policies (NO INTERNAL NOTES) */}
          <div className="pt-1 break-inside-avoid print:break-inside-avoid">
            <div className="p-3 bg-stone-50/50 border border-stone-200 rounded-xl text-[11px] space-y-1">
              <strong className="text-stone-700 block text-[10px] uppercase font-bold tracking-wider">
                Stay Guidelines & Guest Information:
              </strong>
              <p className="text-stone-600 leading-relaxed whitespace-pre-line">
                {houseRulesClean}
              </p>
            </div>
          </div>
        </div>

        {/* Right 5 cols: Official Totals Ledger */}
        <div className="md:col-span-5 print:col-span-5 flex flex-col justify-between break-inside-avoid print:break-inside-avoid">
          <div className="space-y-1.5 text-xs border border-stone-200 rounded-xl p-4 print:p-3 bg-stone-50/50 shadow-xs break-inside-avoid print:break-inside-avoid">
            
            <div className="flex justify-between py-1 border-b border-stone-200/80">
              <span className="text-stone-600">Room Accommodation:</span>
              <span className="font-mono font-medium text-stone-900 tabular-nums">
                ₹{roomSubtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {additionalServices.length > 0 && (
              <div className="flex justify-between py-1 border-b border-stone-200/80">
                <span className="text-stone-600">Additional Services:</span>
                <span className="font-mono font-medium text-stone-900 tabular-nums">
                  ₹{servicesSubtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <div className="flex justify-between py-1 border-b border-stone-200/80 font-medium">
              <span className="text-stone-700">Subtotal:</span>
              <span className="font-mono font-semibold text-stone-900 tabular-nums">
                ₹{Number(invoice.subtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {Number(invoice.discount_amount) > 0 && (
              <div className="flex justify-between py-1 text-rose-700 border-b border-stone-200/80">
                <span>Special Concession / Discount:</span>
                <span className="font-mono font-semibold tabular-nums">
                  -₹{Number(invoice.discount_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {hasTax ? (
              <>
                <div className="flex justify-between py-0.5 text-stone-600 text-[11px]">
                  <span>CGST ({halfTaxRate}%):</span>
                  <span className="font-mono text-stone-900 tabular-nums">₹{halfTaxAmount}</span>
                </div>
                <div className="flex justify-between py-0.5 text-stone-600 text-[11px] border-b border-stone-200/80 pb-1">
                  <span>SGST ({halfTaxRate}%):</span>
                  <span className="font-mono text-stone-900 tabular-nums">₹{halfTaxAmount}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between py-1 text-stone-600 text-[11px] border-b border-stone-200/80">
                <span>Taxes & Service Levy:</span>
                <span className="font-mono text-stone-900 tabular-nums">₹0.00</span>
              </div>
            )}

            {/* Grand Total Highlight */}
            <div className="flex justify-between items-center py-2.5 px-3 bg-stone-900 text-white rounded-lg font-bold text-xs tracking-wide my-2 shadow-xs">
              <span className="uppercase text-[11px] font-bold tracking-wider text-stone-200">Grand Total:</span>
              <span className="font-mono text-base text-stone-100 tabular-nums font-black">
                ₹{Number(invoice.grand_total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex justify-between py-1 text-emerald-800 font-semibold">
              <span>Total Payments Received:</span>
              <span className="font-mono tabular-nums">
                ₹{Number(invoice.amount_paid).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex justify-between items-center py-2 border-t-2 border-stone-300 font-bold text-stone-900">
              <span className="uppercase text-[11px] tracking-wider text-stone-700">Remaining Balance:</span>
              <span className={`font-mono text-base tabular-nums font-black ${isSettled ? "text-emerald-700" : "text-rose-700"}`}>
                ₹{Number(invoice.balance_due).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 7. Footer: Formal Hospitality Sign-off ─── */}
      <div className="invoice-footer pt-4 mt-6 print:mt-4 print:pt-3 border-t border-stone-200 flex flex-col sm:flex-row print:flex-row justify-between items-center gap-2 text-[10px] text-stone-500 break-inside-avoid print:break-inside-avoid">
        <div>
          <span className="font-semibold text-stone-700">{propertyName}</span>
          <span> • Thank you for choosing to stay with us. We hope you enjoyed your time with us!</span>
        </div>
        <div className="text-right">
          <span>Official computer-generated tax invoice & guest folio. Valid without signature.</span>
        </div>
      </div>
    </div>
  );
}
