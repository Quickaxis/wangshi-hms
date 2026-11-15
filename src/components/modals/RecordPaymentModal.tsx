"use client";

import { useState, useEffect } from "react";
import { GlassModal } from "../ui/GlassModal";
import { GlassButton } from "../ui/GlassButton";
import { GlassInput } from "../ui/GlassInput";
import { 
  DbPayment, 
  PaymentType, 
  PaymentMethod, 
  PaymentStage,
  PaymentReceiptData,
  BookingFinancialSummary 
} from "@/lib/types";
import { recordPaymentAction, getPaymentReceiptDataAction } from "@/app/actions/payments";
import { PaymentReceiptModal } from "./PaymentReceiptModal";
import { 
  IndianRupee, 
  ArrowDownLeft, 
  ArrowUpRight, 
  RotateCcw, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  Receipt,
  Printer
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  financialSummary: BookingFinancialSummary | null;
  onPaymentRecorded: (updatedSummary: BookingFinancialSummary) => void;
}

export function RecordPaymentModal({
  isOpen,
  onClose,
  bookingId,
  financialSummary,
  onPaymentRecorded,
}: RecordPaymentModalProps) {
  const [activeType, setActiveType] = useState<PaymentType>('payment');
  const [paymentStage, setPaymentStage] = useState<PaymentStage>('advance');
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [parentPaymentId, setParentPaymentId] = useState<string>("");
  const [transactionRef, setTransactionRef] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  
  // Receipt modal state
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [currentReceiptData, setCurrentReceiptData] = useState<PaymentReceiptData | null>(null);
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);

  // Auto-suggest payment stage based on stay & payment status
  useEffect(() => {
    if (isOpen) {
      setErrorMsg("");
      setSuccessMsg("");
      setCurrentReceiptData(null);
      if (financialSummary) {
        const hasExistingPayments = financialSummary.payments.some(p => p.payment_type === 'payment');
        if (!hasExistingPayments) {
          setPaymentStage('advance');
        } else {
          setPaymentStage('partial');
        }
      }
    }
  }, [isOpen, financialSummary]);

  const originalPayments = financialSummary?.payments.filter(p => p.payment_type === 'payment') || [];

  const handleQuickBalanceFill = () => {
    if (activeType === 'payment' && financialSummary) {
      const balanceNum = parseFloat(financialSummary.balanceDue);
      if (balanceNum > 0) {
        setAmount(financialSummary.balanceDue);
        setPaymentStage('final');
      }
    } else if (activeType === 'refund' && financialSummary) {
      const netPaidNum = parseFloat(financialSummary.netPaid);
      if (netPaidNum > 0) {
        setAmount(financialSummary.netPaid);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg("Please enter a valid amount greater than 0.");
      return;
    }

    if (activeType === 'refund' && (!notes || !notes.trim())) {
      setErrorMsg("A clear reason is required for guest refunds.");
      return;
    }

    if (activeType === 'reversal') {
      if (!parentPaymentId) {
        setErrorMsg("Please select the original payment record you are reversing.");
        return;
      }
      if (!notes || !notes.trim()) {
        setErrorMsg("An audit reason is required for reversing a payment entry.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const result = await recordPaymentAction({
        bookingId,
        amount: amount.trim(),
        paymentType: activeType,
        paymentMethod: method,
        paymentStage: activeType === 'payment' ? paymentStage : undefined,
        parentPaymentId: parentPaymentId || null,
        transactionRef: transactionRef.trim() || null,
        notes: notes.trim() || null,
      });

      if (result.success && result.summary) {
        setSuccessMsg(
          activeType === 'payment' 
            ? "Payment recorded successfully in append-only ledger." 
            : activeType === 'refund' 
            ? "Guest refund recorded successfully." 
            : "Payment entry successfully reversed."
        );
        onPaymentRecorded(result.summary);

        if (activeType === 'payment' && result.paymentId) {
          // Fetch receipt for immediate display
          setIsLoadingReceipt(true);
          try {
            const rRes = await getPaymentReceiptDataAction(result.paymentId);
            if (rRes.success && rRes.receipt) {
              setCurrentReceiptData(rRes.receipt);
            }
          } catch (rErr) {
            console.warn("Could not load receipt data immediately:", rErr);
          } finally {
            setIsLoadingReceipt(false);
          }
        } else {
          setTimeout(() => {
            onClose();
            setAmount("");
            setTransactionRef("");
            setNotes("");
            setParentPaymentId("");
            setErrorMsg("");
            setSuccessMsg("");
          }, 1200);
        }
      } else {
        setErrorMsg(result.error || "Failed to record transaction.");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <GlassModal
        isOpen={isOpen}
        onClose={onClose}
        title="Record Financial Transaction"
        className="max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type Selector Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#F7F7FC] border border-[#E8E7F2] rounded-xl">
            <button
              type="button"
              onClick={() => { setActiveType('payment'); setErrorMsg(""); }}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-xs font-medium transition-all cursor-pointer",
                activeType === 'payment'
                  ? "bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0] shadow-sm font-semibold"
                  : "text-[#77758F] hover:text-[#24213A] hover:bg-white/60"
              )}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              Payment
            </button>

            <button
              type="button"
              onClick={() => { setActiveType('refund'); setErrorMsg(""); }}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-xs font-medium transition-all cursor-pointer",
                activeType === 'refund'
                  ? "bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA] shadow-sm font-semibold"
                  : "text-[#77758F] hover:text-[#24213A] hover:bg-white/60"
              )}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Refund
            </button>

            <button
              type="button"
              onClick={() => { setActiveType('reversal'); setErrorMsg(""); }}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-xs font-medium transition-all cursor-pointer",
                activeType === 'reversal'
                  ? "bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] shadow-sm font-semibold"
                  : "text-[#77758F] hover:text-[#24213A] hover:bg-white/60"
              )}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reversal
            </button>
          </div>

          {/* Payment Stage Selector (Only when activeType === 'payment') */}
          {activeType === 'payment' && (
            <div>
              <label className="block text-xs font-medium text-[#77758F] mb-1.5">
                Payment Lifecycle Stage <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentStage('advance')}
                  className={cn(
                    "px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all text-center cursor-pointer",
                    paymentStage === 'advance'
                      ? "bg-blue-50 text-blue-700 border-blue-300 shadow-xs ring-1 ring-blue-300"
                      : "bg-white text-[#77758F] border-[#E8E7F2] hover:bg-[#F6F5FC]"
                  )}
                >
                  <span className="block font-bold">Advance</span>
                  <span className="text-[10px] opacity-75 font-normal block">Pre-Arrival</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentStage('partial')}
                  className={cn(
                    "px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all text-center cursor-pointer",
                    paymentStage === 'partial'
                      ? "bg-amber-50 text-amber-700 border-amber-300 shadow-xs ring-1 ring-amber-300"
                      : "bg-white text-[#77758F] border-[#E8E7F2] hover:bg-[#F6F5FC]"
                  )}
                >
                  <span className="block font-bold">Partial</span>
                  <span className="text-[10px] opacity-75 font-normal block">During Stay</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentStage('final');
                    if (financialSummary && parseFloat(financialSummary.balanceDue) > 0) {
                      setAmount(financialSummary.balanceDue);
                    }
                  }}
                  className={cn(
                    "px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all text-center cursor-pointer",
                    paymentStage === 'final'
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs ring-1 ring-emerald-300"
                      : "bg-white text-[#77758F] border-[#E8E7F2] hover:bg-[#F6F5FC]"
                  )}
                >
                  <span className="block font-bold">Final</span>
                  <span className="text-[10px] opacity-75 font-normal block">Settlement</span>
                </button>
              </div>
            </div>
          )}

          {/* Current Balance Banner */}
          {financialSummary && (
            <div className="bg-[#F7F7FC] border border-[#E8E7F2] p-3 rounded-xl flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] text-[#77758F] uppercase tracking-wider block">
                  {activeType === 'payment' ? 'Balance Due' : 'Available to Refund'}
                </span>
                <span className="font-semibold text-sm text-[#24213A]">
                  {activeType === 'payment' ? financialSummary.formatted.balanceDue : financialSummary.formatted.netPaid}
                </span>
              </div>
              <button
                type="button"
                onClick={handleQuickBalanceFill}
                className="text-[11px] text-[#5146D8] font-semibold hover:underline cursor-pointer"
              >
                Fill exact amount
              </button>
            </div>
          )}

          {/* Feedback messages */}
          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl flex items-start gap-2.5 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-700 p-3 rounded-xl flex items-start gap-2.5 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />
              <div className="flex-1">
                <span>{successMsg}</span>
              </div>
            </div>
          )}

          {/* View Receipt Banner after successful payment */}
          {currentReceiptData && (
            <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-[#065F46]">
                <Receipt className="w-4 h-4 text-[#059669] shrink-0" />
                <span>
                  Receipt: <strong>{currentReceiptData.receiptNumber}</strong>
                </span>
              </div>

              <button
                type="button"
                onClick={() => setReceiptModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#059669] hover:bg-[#047857] text-white font-semibold text-xs transition-colors cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>
            </div>
          )}

          {/* Reversal Parent Payment Selector */}
          {activeType === 'reversal' && (
            <div>
              <label className="block text-xs font-medium text-[#77758F] mb-1">
                Select Payment to Reverse <span className="text-red-400">*</span>
              </label>
              <select
                value={parentPaymentId}
                onChange={(e) => {
                  setParentPaymentId(e.target.value);
                  const selected = originalPayments.find(p => p.id === e.target.value);
                  if (selected) {
                    setAmount(String(selected.amount));
                  }
                }}
                required
                className="w-full bg-[#FFFFFF] border border-[#E8E7F2] rounded-xl px-3 py-2 text-xs text-[#24213A] focus:outline-none focus:border-[#5146D8]"
              >
                <option value="" className="bg-[#FFFFFF] text-[#77758F]">-- Choose original payment --</option>
                {originalPayments.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#FFFFFF] text-[#24213A]">
                    ₹{Number(p.amount).toLocaleString('en-IN')} via {p.payment_method.toUpperCase()} ({new Date(p.created_at).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Amount Input */}
          <div>
            <label className="block text-xs font-medium text-[#77758F] mb-1">
              Amount (₹) <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <IndianRupee className="w-4 h-4 text-[#77758F] absolute left-3 top-1/2 -translate-y-1/2" />
              <GlassInput
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="pl-9 text-sm font-semibold"
              />
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-medium text-[#77758F] mb-1">
              Payment Method <span className="text-red-400">*</span>
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="w-full bg-[#FFFFFF] border border-[#E8E7F2] rounded-xl px-3 py-2 text-xs text-[#24213A] focus:outline-none focus:border-[#5146D8]"
            >
              <option value="cash" className="bg-[#FFFFFF] text-[#24213A]">Direct Cash</option>
              <option value="upi" className="bg-[#FFFFFF] text-[#24213A]">UPI / QR Code (GPay, PhonePe, Paytm)</option>
              <option value="bank_transfer" className="bg-[#FFFFFF] text-[#24213A]">Bank Transfer (NEFT/IMPS/RTGS)</option>
              <option value="card" className="bg-[#FFFFFF] text-[#24213A]">Credit / Debit Card</option>
              <option value="ota_payout" className="bg-[#FFFFFF] text-[#24213A]">OTA Payout / Travel Agent</option>
            </select>
          </div>

          {/* Transaction Reference (Optional) */}
          <div>
            <label className="block text-xs font-medium text-[#77758F] mb-1">
              Transaction Reference / UTR (Optional)
            </label>
            <GlassInput
              type="text"
              placeholder="e.g. UPI Ref / Bank UTR Number / Card Auth Code"
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              className="text-xs font-mono"
            />
          </div>

          {/* Notes / Reason */}
          <div>
            <label className="block text-xs font-medium text-[#77758F] mb-1">
              {activeType === 'payment' ? 'Notes (Optional)' : 'Audit Reason / Note '}
              {activeType !== 'payment' && <span className="text-red-400">*</span>}
            </label>
            <GlassInput
              type="text"
              placeholder={
                activeType === 'payment'
                  ? "e.g. 50% advance received, balance payable at checkout"
                  : activeType === 'refund'
                  ? "e.g. Early checkout refund for unused night"
                  : "e.g. Correcting mistaken cash entry"
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              required={activeType !== 'payment'}
              className="text-xs"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 w-full">
            <GlassButton
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-xs px-4 w-full sm:w-auto"
            >
              {currentReceiptData ? "Done" : "Cancel"}
            </GlassButton>

            <GlassButton
              type="submit"
              variant="primary"
              disabled={isSubmitting}
              className="text-xs px-5 flex items-center justify-center gap-1.5 w-full sm:w-auto"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {activeType === 'payment' ? 'Save Payment' : activeType === 'refund' ? 'Issue Refund' : 'Confirm Reversal'}
            </GlassButton>
          </div>
        </form>
      </GlassModal>

      {/* Standalone Receipt Modal */}
      <PaymentReceiptModal
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        receipt={currentReceiptData}
        isLoading={isLoadingReceipt}
      />
    </>
  );
}
