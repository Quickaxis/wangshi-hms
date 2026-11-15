"use client";

import React from "react";
import { PaymentReceiptData, PaymentStage } from "@/lib/types";
import { getStageBadgeDetails, formatMethodLabel } from "@/lib/receipts";
export { getStageBadgeDetails, formatMethodLabel };
import { 
  Building2, 
  User, 
  Calendar, 
  CreditCard, 
  CheckCircle2, 
  IndianRupee, 
  Clock, 
  Receipt,
  ShieldCheck
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PaymentReceiptViewProps {
  receipt: PaymentReceiptData;
  isPrintVersion?: boolean;
}

export function PaymentReceiptView({ receipt, isPrintVersion = false }: PaymentReceiptViewProps) {
  const stageInfo = getStageBadgeDetails(receipt.stage);
  const amountNum = Number(receipt.amount || 0);
  const totalNum = Number(receipt.totalContracted || 0);
  const balanceNum = Number(receipt.balanceDue || 0);
  const isSettled = balanceNum <= 0;

  return (
    <div 
      className={cn(
        "receipt-container bg-white text-[#24213A] rounded-2xl border border-[#E8E6F2] shadow-sm overflow-hidden",
        isPrintVersion ? "p-8 max-w-2xl mx-auto shadow-none border-none" : "p-6 sm:p-8"
      )}
    >
      {/* ─── Header: Homestay Identity & Receipt Badge ─── */}
      <div className="border-b border-[#E8E6F2] pb-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[#5146D8]/10 text-[#5146D8]">
                <Building2 className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-[#24213A]">
                {receipt.homestay.name}
              </h1>
            </div>
            {receipt.homestay.location && (
              <p className="text-xs text-[#77758F] mt-1 pl-9">
                {receipt.homestay.location}
              </p>
            )}
            {(receipt.homestay.phone || receipt.homestay.email) && (
              <p className="text-[11px] text-[#77758F] mt-0.5 pl-9">
                {receipt.homestay.phone && `Tel: ${receipt.homestay.phone}`}
                {receipt.homestay.phone && receipt.homestay.email && " • "}
                {receipt.homestay.email && `Email: ${receipt.homestay.email}`}
              </p>
            )}
          </div>

          <div className="sm:text-right">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#5146D8]/10 text-[#5146D8] border border-[#5146D8]/20">
              <Receipt className="w-3.5 h-3.5" />
              Official Receipt
            </span>
            <div className="mt-2">
              <span className="text-[10px] text-[#77758F] uppercase tracking-wider block">Receipt Number</span>
              <span className="text-sm font-mono font-bold text-[#24213A]">{receipt.receiptNumber}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Payment Stage Banner & Exact Server Timestamp ─── */}
      <div className="my-5 p-4 rounded-xl bg-[#F6F5FC] border border-[#E8E6F2] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn(
            "px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide border shadow-xs",
            stageInfo.badgeClass
          )}>
            {stageInfo.label}
          </span>
          <span className="text-xs text-[#77758F]">
            {stageInfo.description}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-[#77758F]">
          <Clock className="w-3.5 h-3.5 text-[#5146D8]" />
          <span className="font-mono font-medium text-[#24213A]">{receipt.formattedTimestamp}</span>
        </div>
      </div>

      {/* ─── Guest, Stay & Booking Info Grid ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-b border-[#E8E6F2] text-xs">
        {/* Guest Details */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-[#77758F] text-[10px]">
            <User className="w-3.5 h-3.5 text-[#5146D8]" />
            <span>Guest Details</span>
          </div>
          <div className="pl-5 space-y-0.5">
            <p className="font-bold text-sm text-[#24213A]">{receipt.guestName}</p>
            {receipt.guestPhone && <p className="text-[#77758F]">Phone: {receipt.guestPhone}</p>}
            {receipt.guestEmail && <p className="text-[#77758F]">Email: {receipt.guestEmail}</p>}
          </div>
        </div>

        {/* Stay & Reservation Details */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-[#77758F] text-[10px]">
            <Calendar className="w-3.5 h-3.5 text-[#5146D8]" />
            <span>Stay & Reservation Details</span>
          </div>
          <div className="pl-5 space-y-0.5 text-[#24213A]">
            <p>
              <span className="text-[#77758F]">Room / Allocation: </span>
              <span className="font-semibold">{receipt.roomName || "Standard Accommodation"}</span>
            </p>
            <p>
              <span className="text-[#77758F]">Stay Dates: </span>
              <span className="font-medium">{receipt.checkIn} to {receipt.checkOut}</span>
            </p>
            {receipt.groupId && (
              <p className="text-[11px] text-[#5146D8] font-medium">
                Part of Group Reservation ({receipt.groupId.slice(0, 8)}...)
              </p>
            )}
            {receipt.invoiceNumber && (
              <p className="text-[11px] text-[#77758F]">
                Folio / Invoice: <span className="font-mono">{receipt.invoiceNumber}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ─── Prominent Payment Amount Card ─── */}
      <div className="my-6 p-5 rounded-2xl bg-gradient-to-br from-[#ECFDF5] to-[#F0FDF4] border border-[#A7F3D0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#065F46] block">
            Amount Received
          </span>
          <div className="flex items-center gap-1 text-2xl sm:text-3xl font-extrabold text-[#065F46] mt-0.5">
            <span>₹</span>
            <span>{amountNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          <p className="text-xs text-[#047857] mt-1 font-medium">
            Paid via {formatMethodLabel(receipt.paymentMethod)}
            {receipt.transactionRef && ` • Ref: ${receipt.transactionRef}`}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center px-3 py-1.5 rounded-xl bg-white/80 border border-[#A7F3D0] text-[#065F46] text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-[#059669]" />
          <span>Payment Verified</span>
        </div>
      </div>

      {/* ─── Folio Financial Ledger Breakdown ─── */}
      <div className="space-y-2 py-4 border-b border-[#E8E6F2] text-xs">
        <h4 className="font-semibold uppercase tracking-wider text-[#77758F] text-[10px]">
          Folio Financial Summary
        </h4>

        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-[#77758F]">
            <span>Total Contracted Stay Charges:</span>
            <span className="font-mono font-medium text-[#24213A]">
              ₹{totalNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex justify-between text-[#77758F]">
            <span>Cumulative Payments Received:</span>
            <span className="font-mono font-medium text-[#059669]">
              ₹{Number(receipt.grossCollected || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex justify-between pt-2 border-t border-[#E8E6F2] font-semibold">
            <span className="text-[#24213A]">Remaining Balance Due:</span>
            <span className={cn(
              "font-mono text-sm",
              isSettled ? "text-[#059669]" : "text-[#D97706]"
            )}>
              {isSettled ? "₹0.00 (Settled in Full)" : `₹${balanceNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Notes (if any) ─── */}
      {receipt.notes && (
        <div className="py-3 border-b border-[#E8E6F2] text-xs">
          <span className="text-[10px] uppercase tracking-wider text-[#77758F] font-semibold block">Notes / Reason:</span>
          <p className="text-[#24213A] mt-0.5">{receipt.notes}</p>
        </div>
      )}

      {/* ─── Cashier & Authenticity Footer ─── */}
      <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-[11px] text-[#77758F]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#5146D8]" />
          <span>Received & Recorded by: <strong className="text-[#24213A]">{receipt.cashierName}</strong></span>
        </div>

        <div className="sm:text-right">
          <p>This is a computer-generated receipt.</p>
          <p className="font-medium text-[#5146D8]">Thank you for staying at {receipt.homestay.name}!</p>
        </div>
      </div>
    </div>
  );
}
