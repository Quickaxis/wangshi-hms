"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PaymentReceiptData } from "@/lib/types";
import { PaymentReceiptView } from "../payments/PaymentReceiptView";
import { Printer, Download, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: PaymentReceiptData | null;
  isLoading?: boolean;
}

export function triggerReceiptPrint(receiptNumber: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const originalOverflow = document.body.style.overflow;
  const originalTitle = document.title;
  const sanitizedTitle = receiptNumber.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-");

  document.body.classList.add("hms-printing-receipt");
  document.body.style.overflow = "visible";
  document.title = sanitizedTitle;

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    document.body.classList.remove("hms-printing-receipt");
    document.body.style.overflow = originalOverflow;
    document.title = originalTitle;
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);

  requestAnimationFrame(() => {
    window.print();
    setTimeout(cleanup, 2000);
  });
}

export function PaymentReceiptModal({
  isOpen,
  onClose,
  receipt,
  isLoading = false,
}: PaymentReceiptModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const handlePrint = () => {
    if (receipt) {
      triggerReceiptPrint(receipt.receiptNumber);
    }
  };

  return createPortal(
    <>
      {/* ─── Screen Modal Overlay ─── */}
      <div 
        className="fixed inset-0 z-50 bg-[#24213A]/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div 
          className="relative w-full max-w-2xl bg-[#F6F5FC] rounded-3xl border border-[#E8E6F2] shadow-2xl overflow-hidden my-8"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Control Bar */}
          <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#E8E6F2]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#059669]" />
              <h2 className="text-sm font-bold text-[#24213A] uppercase tracking-wider">
                Payment Receipt
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {receipt && (
                <>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#5146D8] hover:bg-[#4338CA] text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Receipt</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#F0EEFF] text-[#5146D8] border border-[#E8E6F2] text-xs font-semibold transition-all cursor-pointer"
                    title="Download as PDF using Print dialog"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Save PDF</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-[#77758F] hover:text-[#24213A] hover:bg-[#F6F5FC] transition-colors cursor-pointer"
                title="Close receipt"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="p-6 max-h-[80vh] overflow-y-auto">
            {isLoading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-xs text-[#77758F]">
                <Loader2 className="w-6 h-6 animate-spin text-[#5146D8]" />
                <span>Loading receipt details...</span>
              </div>
            ) : receipt ? (
              <PaymentReceiptView receipt={receipt} isPrintVersion={false} />
            ) : (
              <div className="py-12 text-center text-xs text-[#77758F]">
                Receipt details could not be loaded.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Dedicated Print Portal Document (Only visible when printing) ─── */}
      {receipt && (
        <div id="hms-receipt-print-root" className="hms-receipt-print-only">
          <PaymentReceiptView receipt={receipt} isPrintVersion={true} />
        </div>
      )}
    </>,
    document.body
  );
}

