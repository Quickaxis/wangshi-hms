"use client";

import React from "react";
import Image from "next/image";
import { DbInvoice, Homestay } from "@/lib/types";
import { formatISTCompactDate } from "@/lib/dateUtils";
import { Mountain, Phone, Mail, Globe, Clock, CheckCircle2, ShieldCheck, MapPin } from "lucide-react";

interface InvoicePDFViewProps {
  invoice: DbInvoice;
  homestay?: Homestay | null;
  className?: string;
  isPrintVersion?: boolean;
}

export function InvoicePDFView({ invoice, homestay, className = "", isPrintVersion = false }: InvoicePDFViewProps) {
  const currentHomestay = homestay || invoice.homestay;
  const propertyName = currentHomestay?.name || "Wangshi Homestay";
  const propertyLocation = currentHomestay?.location || "";
  const propertyPhone = currentHomestay?.phone || "";
  const propertyEmail = currentHomestay?.email || "";
  const propertyWebsite = currentHomestay?.slug 
    ? `${currentHomestay.slug}.wangshihms.in` 
    : (currentHomestay?.slug ? `${currentHomestay.slug}` : "");
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

  // Determine payment settlement status
  const isSettled = Number(invoice.balance_due) <= 0;
  const paymentsList = invoice.payments || [];
  const paymentMethodsList = paymentsList
    .map(p => p.payment_method?.toUpperCase().replace('_', ' '))
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(" • ") || "Direct Settlement";

  // Tax breakdown (CGST + SGST 50/50 split if tax is present)
  const hasTax = Number(invoice.tax_rate) > 0 && Number(invoice.tax_amount) > 0;
  const halfTaxRate = (Number(invoice.tax_rate) / 2).toFixed(1);
  const halfTaxAmount = (Number(invoice.tax_amount) / 2).toFixed(2);

  // Check if house rules or remarks exist to avoid rendering empty sections
  const hasNotes = Boolean(invoice.notes && invoice.notes.trim());
  const hasHouseRules = Boolean(invoice.house_rules && invoice.house_rules.trim());

  return (
    <div 
      className={`invoice-print-container bg-white text-stone-900 font-sans ${isPrintVersion ? "p-0 max-w-none w-full shadow-none border-none min-h-0" : "p-8 sm:p-10 md:p-12 max-w-[850px] mx-auto shadow-xl rounded-sm min-h-[1050px]"} print:shadow-none print:p-0 print:m-0 print:max-w-none print:w-full print:border-none print:min-h-0 ${className}`}
      style={{ minHeight: isPrintVersion ? "auto" : undefined }}
    >
      {/* Top Refined Brand Accent Line */}
      <div className="h-1 w-full bg-stone-900 rounded-full mb-6 print:mb-4" />

      {/* 1. Header: Property Identity & Folio Title */}
      <div className="invoice-header flex flex-col sm:flex-row print:flex-row justify-between items-start print:items-start gap-4 pb-6 print:pb-4 border-b border-stone-200 break-inside-avoid print:break-inside-avoid">
        <div className="flex items-start gap-3.5">
          <div className="w-14 h-14 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center overflow-hidden shrink-0">
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
                <span className="text-[7px] font-sans font-semibold tracking-wider text-stone-300 mt-0.5 uppercase">WNG</span>
              </div>
            )}
          </div>
          <div>
            <h1 className="text-xl font-serif font-bold tracking-tight text-stone-900">
              {propertyName}
            </h1>
            {propertyLocation && (
              <p className="text-xs text-stone-600 font-medium flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span>{propertyLocation}</span>
              </p>
            )}
            {(propertyWebsite || propertyPhone) && (
              <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-stone-500 mt-1">
                {propertyWebsite && (
                  <span className="flex items-center gap-1">
                    <Globe className="w-3 h-3 text-stone-400" />
                    <span className="font-medium text-stone-700">{propertyWebsite}</span>
                  </span>
                )}
                {propertyWebsite && propertyPhone && <span>•</span>}
                {propertyPhone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-stone-400" />
                    <span>{propertyPhone}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Invoice Title & Number */}
        <div className="text-left sm:text-right print:text-right shrink-0">
          <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-0.5">
            GUEST FOLIO & TAX INVOICE
          </div>
          <div className="text-xl font-mono font-bold tracking-tight text-stone-900">
            {invoice.invoice_number}
          </div>
          <div className="text-xs text-stone-600 mt-0.5">
            Date: <span className="font-medium text-stone-900">{formatISTCompactDate(invoice.invoice_date)}</span>
          </div>
          {invoice.booking_id && (
            <div className="text-[11px] text-stone-500 mt-0.5">
              Booking Ref: <span className="font-mono font-medium text-stone-800">WNG-{invoice.booking_id.slice(0, 8).toUpperCase()}</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Settlement Status Banner */}
      <div className="invoice-settlement-banner my-5 print:my-3 flex flex-col sm:flex-row print:flex-row items-center justify-between gap-3 p-3.5 print:py-2.5 rounded-lg border bg-stone-50/70 border-stone-200 break-inside-avoid print:break-inside-avoid">
        <div className="flex items-center gap-3">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
            isSettled 
              ? "bg-emerald-100 text-emerald-800 border border-emerald-200" 
              : "bg-amber-100 text-amber-800 border border-amber-200"
          }`}>
            {isSettled ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
          </div>
          <div>
            <div className="text-xs font-semibold text-stone-900 flex items-center gap-2">
              <span>Status:</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                isSettled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
              }`}>
                {isSettled ? "PAID IN FULL" : "BALANCE OUTSTANDING"}
              </span>
            </div>
            <div className="text-[11px] text-stone-500 mt-0.5">
              Payment channels: <span className="font-medium text-stone-700">{paymentMethodsList}</span>
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] uppercase font-semibold text-stone-500 tracking-wider">
            Balance Due
          </div>
          <div className={`text-base font-mono font-bold tabular-nums ${isSettled ? "text-emerald-700" : "text-rose-700"}`}>
            ₹{Number(invoice.balance_due).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* 3. Stay Summary Ribbon */}
      <div className="invoice-stay-ribbon grid grid-cols-2 md:grid-cols-4 print:grid-cols-4 gap-2.5 bg-stone-50/60 p-3 print:py-2.5 rounded-lg border border-stone-200 mb-5 print:mb-3 text-xs break-inside-avoid print:break-inside-avoid">
        <div className="border-r border-stone-200 pr-2">
          <span className="block text-[10px] font-semibold tracking-wider text-stone-500 uppercase">ACCOMMODATION</span>
          <span className="font-semibold text-stone-900 mt-0.5 block truncate" title={invoice.room_name || "Room"}>
            {invoice.room_name || "Assigned Room"}
          </span>
        </div>
        <div className="border-r border-transparent md:border-stone-200 print:border-stone-200 px-2">
          <span className="block text-[10px] font-semibold tracking-wider text-stone-500 uppercase">CHECK-IN</span>
          <span className="font-medium text-stone-800 mt-0.5 block text-[11px]">{checkInFormatted}</span>
        </div>
        <div className="border-r border-stone-200 px-2">
          <span className="block text-[10px] font-semibold tracking-wider text-stone-500 uppercase">CHECK-OUT</span>
          <span className="font-medium text-stone-800 mt-0.5 block text-[11px]">{checkOutFormatted}</span>
        </div>
        <div className="pl-2">
          <span className="block text-[10px] font-semibold tracking-wider text-stone-500 uppercase">TOTAL DURATION</span>
          <span className="font-semibold text-stone-900 mt-0.5 block">
            {stayNights} {stayNights === 1 ? 'Night' : 'Nights'}
          </span>
        </div>
      </div>

      {/* 4. Guest & Reservation Details Grid */}
      <div className="invoice-guest-details grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-4 print:gap-3 mb-5 print:mb-3 text-xs break-inside-avoid print:break-inside-avoid">
        {/* Guest Details */}
        <div className="p-3.5 print:p-3 bg-stone-50/40 border border-stone-200 rounded-lg space-y-1.5">
          <div className="text-[10px] font-semibold tracking-wider text-stone-500 uppercase border-b border-stone-200 pb-1 mb-2">
            BILLED TO GUEST
          </div>
          <div className="flex">
            <span className="w-24 text-stone-500 font-medium">Guest Name:</span>
            <span className="font-semibold text-stone-900">{invoice.guest_name}</span>
          </div>
          {invoice.guest_phone && (
            <div className="flex">
              <span className="w-24 text-stone-500 font-medium">Phone:</span>
              <span className="text-stone-800 font-mono">{invoice.guest_phone}</span>
            </div>
          )}
          {invoice.guest_email && (
            <div className="flex">
              <span className="w-24 text-stone-500 font-medium">Email:</span>
              <span className="text-stone-800">{invoice.guest_email}</span>
            </div>
          )}
          <div className="flex">
            <span className="w-24 text-stone-500 font-medium">Billing Address:</span>
            <span className="text-stone-800">{invoice.guest_address ? invoice.guest_address : "—"}</span>
          </div>
        </div>

        {/* Property Metadata */}
        <div className="p-3.5 print:p-3 bg-stone-50/40 border border-stone-200 rounded-lg space-y-1.5">
          <div className="text-[10px] font-semibold tracking-wider text-stone-500 uppercase border-b border-stone-200 pb-1 mb-2">
            FOLIO SPECIFICATIONS
          </div>
          <div className="flex">
            <span className="w-28 text-stone-500 font-medium">Currency:</span>
            <span className="text-stone-800">INR (Indian Rupee - ₹)</span>
          </div>
          <div className="flex">
            <span className="w-28 text-stone-500 font-medium">Host Property:</span>
            <span className="text-stone-800 font-medium">{propertyName}</span>
          </div>
          {propertyEmail && (
            <div className="flex">
              <span className="w-28 text-stone-500 font-medium">Contact:</span>
              <span className="text-stone-800">{propertyEmail}</span>
            </div>
          )}
        </div>
      </div>

      {/* 5. Itemized Charges Table (Independent Custom Items Supported) */}
      <div className="invoice-items-table mb-5 print:mb-4 rounded-lg border border-stone-200 overflow-hidden print:overflow-visible">
        <table className="w-full text-left border-collapse text-xs print:text-[11px]">
          <thead className="print:table-header-group">
            <tr className="bg-stone-900 text-stone-100 text-[10px] tracking-wider uppercase font-semibold break-inside-avoid print:break-inside-avoid">
              <th className="py-2.5 px-3 w-10 text-center">#</th>
              <th className="py-2.5 px-3">ITEM / SERVICE DESCRIPTION</th>
              <th className="py-2.5 px-3">CATEGORY</th>
              <th className="py-2.5 px-3 text-right">RATE / UNIT</th>
              <th className="py-2.5 px-2 text-center">QTY</th>
              <th className="py-2.5 px-3 text-right">AMOUNT (INR)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {(invoice.items && invoice.items.length > 0) ? (
              invoice.items.map((item, idx) => (
                <tr key={item.id || idx} className={`break-inside-avoid print:break-inside-avoid ${idx % 2 === 0 ? "bg-white" : "bg-stone-50/50"}`}>
                  <td className="py-2.5 px-3 text-center text-stone-400 font-mono text-[11px]">{idx + 1}</td>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-stone-900">{item.description}</div>
                    {item.stay_period && (
                      <div className="text-[11px] text-stone-500 mt-0.5">{item.stay_period}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-stone-100 text-stone-700 border border-stone-200">
                      {item.category ? item.category.replace('_', ' ') : 'SERVICE'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-stone-700 font-mono tabular-nums">
                    {Number(item.rate) === 0 ? (
                      <span className="text-emerald-700 font-medium">Complimentary</span>
                    ) : (
                      `₹${Number(item.rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-center font-medium text-stone-800 tabular-nums">
                    {item.quantity}
                  </td>
                  <td className={`py-2.5 px-3 text-right font-semibold font-mono tabular-nums ${item.category === 'discount' ? 'text-rose-700' : 'text-stone-900'}`}>
                    {item.category === 'discount' ? '-' : ''}₹{Number(item.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))
            ) : (
              <tr className="break-inside-avoid print:break-inside-avoid">
                <td className="py-2.5 px-3 text-center text-stone-400 font-mono text-[11px]">1</td>
                <td className="py-2.5 px-3">
                  <div className="font-semibold text-stone-900">Room Accommodation Charge</div>
                </td>
                <td className="py-2.5 px-3">
                  <span className="px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-stone-100 text-stone-700 border border-stone-200">
                    ROOM
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right text-stone-700 font-mono tabular-nums">
                  ₹{Number(invoice.subtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2.5 px-2 text-center font-medium text-stone-800 tabular-nums">1</td>
                <td className="py-2.5 px-3 text-right font-semibold text-stone-900 font-mono tabular-nums">
                  ₹{Number(invoice.subtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 6. Split Bottom Section: Payment Ledger & Financial Totals */}
      <div className="grid grid-cols-1 md:grid-cols-12 print:grid-cols-12 gap-5 print:gap-4 my-5 print:my-3 pt-3 border-t border-stone-200">
        {/* Left 7 cols: Payment Ledger & Optional Notes */}
        <div className="md:col-span-7 print:col-span-7 flex flex-col justify-between pr-0 md:pr-2 print:pr-2 space-y-4 print:space-y-3">
          {/* Payment Receipts Audit */}
          <div>
            <h4 className="text-[10px] font-semibold tracking-wider text-stone-500 uppercase mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-stone-600" />
              <span>RECORDED SETTLEMENT TRANSACTIONS ({paymentsList.length})</span>
            </h4>
            
            {paymentsList.length > 0 ? (
              <div className="space-y-1.5">
                {paymentsList.map((p, idx) => (
                  <div 
                    key={p.id || idx}
                    className="flex items-center justify-between p-2.5 bg-stone-50/60 border border-stone-200 rounded-lg text-xs break-inside-avoid print:break-inside-avoid"
                  >
                    <div>
                      <div className="font-semibold text-stone-900">
                        ₹{Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })} via {p.payment_method?.toUpperCase()}
                      </div>
                      <div className="text-[10px] text-stone-500 mt-0.5">
                        {p.created_at ? formatISTCompactDate(p.created_at) : "Confirmed"} 
                        {p.transaction_ref ? ` • Ref: ${p.transaction_ref}` : ""}
                        {p.notes ? ` • ${p.notes}` : ""}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                      CONFIRMED
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 bg-stone-50/50 border border-stone-200 rounded-lg text-xs text-stone-500 break-inside-avoid print:break-inside-avoid">
                No payment transactions recorded yet. Settlement due at front desk upon check-out.
              </div>
            )}
          </div>

          {/* Optional Notes & House Rules (Only rendered when present) */}
          {(hasNotes || hasHouseRules) && (
            <div className="pt-2 space-y-2 break-inside-avoid print:break-inside-avoid">
              {hasNotes && (
                <div className="p-2.5 bg-stone-50/60 border border-stone-200 rounded-lg text-xs break-inside-avoid print:break-inside-avoid">
                  <strong className="text-stone-700 block text-[10px] uppercase font-semibold tracking-wider mb-0.5">
                    Remarks:
                  </strong>
                  <span className="text-stone-600">{invoice.notes}</span>
                </div>
              )}

              {hasHouseRules && (
                <div className="p-2.5 bg-stone-50/60 border border-stone-200 rounded-lg text-xs break-inside-avoid print:break-inside-avoid">
                  <strong className="text-stone-700 block text-[10px] uppercase font-semibold tracking-wider mb-0.5">
                    Stay Guidelines & Policies:
                  </strong>
                  <span className="text-stone-600">{invoice.house_rules}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right 5 cols: Official Totals Ledger */}
        <div className="md:col-span-5 print:col-span-5 flex flex-col justify-between break-inside-avoid print:break-inside-avoid">
          <div className="space-y-1.5 text-xs border border-stone-200 rounded-lg p-3.5 print:p-3 bg-stone-50/40 break-inside-avoid print:break-inside-avoid">
            <div className="flex justify-between py-1 border-b border-stone-200/80">
              <span className="text-stone-600">Subtotal:</span>
              <span className="font-mono font-medium text-stone-900 tabular-nums">
                ₹{Number(invoice.subtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {Number(invoice.discount_amount) > 0 && (
              <div className="flex justify-between py-1 text-rose-700 border-b border-stone-200/80">
                <span>Concession / Discount:</span>
                <span className="font-mono font-medium tabular-nums">
                  -₹{Number(invoice.discount_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {hasTax ? (
              <>
                <div className="flex justify-between py-0.5 text-stone-600">
                  <span>CGST ({halfTaxRate}%):</span>
                  <span className="font-mono text-stone-900 tabular-nums">₹{halfTaxAmount}</span>
                </div>
                <div className="flex justify-between py-0.5 text-stone-600 border-b border-stone-200/80 pb-1">
                  <span>SGST ({halfTaxRate}%):</span>
                  <span className="font-mono text-stone-900 tabular-nums">₹{halfTaxAmount}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between py-1 text-stone-600 border-b border-stone-200/80">
                <span>Taxes & Service Levy:</span>
                <span className="font-mono text-stone-900 tabular-nums">₹0.00</span>
              </div>
            )}

            {/* Grand Total Highlight */}
            <div className="flex justify-between items-center py-2 px-2.5 bg-stone-900 text-white rounded-md font-bold text-xs tracking-wide my-1.5">
              <span className="uppercase text-[11px] font-semibold tracking-wider text-stone-200">Grand Total:</span>
              <span className="font-mono text-sm text-stone-100 tabular-nums">
                ₹{Number(invoice.grand_total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex justify-between py-1 text-emerald-700 font-medium">
              <span>Amount Paid:</span>
              <span className="font-mono tabular-nums">
                ₹{Number(invoice.amount_paid).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex justify-between py-1.5 border-t border-stone-300 font-bold text-stone-900">
              <span className="uppercase text-[10px] tracking-wider text-stone-600">Balance Due:</span>
              <span className={`font-mono text-sm tabular-nums ${isSettled ? "text-emerald-700" : "text-rose-700"}`}>
                ₹{Number(invoice.balance_due).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 7. Footer: Minimal Property Sign-off */}
      <div className="invoice-footer pt-4 mt-6 print:mt-4 print:pt-3 border-t border-stone-200 flex flex-col sm:flex-row print:flex-row justify-between items-center gap-2 text-[10px] text-stone-500 break-inside-avoid print:break-inside-avoid">
        <div>
          <span>{propertyName} • Guest Folio</span>
        </div>
        {propertyEmail && (
          <div>
            <span>Direct Inquiries: {propertyEmail}</span>
          </div>
        )}
      </div>
    </div>
  );
}
