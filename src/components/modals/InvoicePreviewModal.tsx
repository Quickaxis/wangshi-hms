"use client";

import React, { useRef } from "react";
import { GlassModal } from "@/components/ui/GlassModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { DbInvoice, Homestay } from "@/lib/types";
import { InvoicePDFView } from "@/components/invoicing/InvoicePDFView";
import { InvoicePrintPortal, triggerBrowserPrint } from "@/components/invoicing/InvoicePrintPortal";
import { Printer, CheckCircle2, Clock } from "lucide-react";

interface InvoicePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: DbInvoice | null;
  homestay?: Homestay | null;
}

export function InvoicePreviewModal({
  isOpen,
  onClose,
  invoice,
  homestay
}: InvoicePreviewModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!invoice) return null;

  const handlePrint = async () => {
    await triggerBrowserPrint({
      targetContainerId: "hms-invoice-print-root",
      invoiceNumber: invoice.invoice_number
    });
  };

  const isPaid = Number(invoice.balance_due) <= 0;

  return (
    <>
      {/* Mount Dedicated Unconstrained Print Document directly to document.body */}
      {isOpen && (
        <InvoicePrintPortal invoice={invoice} homestay={homestay} />
      )}

      <GlassModal
        isOpen={isOpen}
        onClose={onClose}
        title={`Guest Folio: ${invoice.invoice_number}`}
        className="sm:max-w-4xl lg:max-w-5xl max-h-[94vh] flex flex-col"
        footer={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                isPaid 
                  ? "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]" 
                  : "bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]"
              }`}>
                {isPaid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                <span>{isPaid ? "Paid in Full" : `Balance Due: ₹${Number(invoice.balance_due).toLocaleString("en-IN")}`}</span>
              </span>
              <span className="text-[11px] text-[#77758F] hidden md:inline">
                Standard A4 Boutique Folio • {invoice.guest_name}
              </span>
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <GlassButton
                variant="secondary"
                onClick={onClose}
                className="px-4 py-2 text-xs w-full sm:w-auto justify-center"
              >
                Close Preview
              </GlassButton>
              <button
                type="button"
                onClick={handlePrint}
                className="px-5 py-2 rounded-full text-xs font-semibold flex items-center justify-center gap-2 bg-[#5146D8] hover:bg-[#4338CA] text-white shadow-md shadow-[#5146D8]/20 transition-all cursor-pointer active:scale-95 w-full sm:w-auto"
              >
                <Printer className="w-4 h-4 text-white" />
                <span>Print / Save as PDF</span>
              </button>
            </div>
          </div>
        }
      >
        <div className="overflow-y-auto max-h-[74vh] p-2 sm:p-6 bg-[#F6F5FC] rounded-2xl border border-[#E8E6F2] shadow-inner">
          <div id="printable-invoice" ref={printRef}>
            <InvoicePDFView invoice={invoice} homestay={homestay} />
          </div>
        </div>
      </GlassModal>
    </>
  );
}
