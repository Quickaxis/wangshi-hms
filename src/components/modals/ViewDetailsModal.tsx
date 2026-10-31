"use client";

import { formatISTDateTime, formatISTCompactDate } from "@/lib/dateUtils";

import { useState, useEffect } from "react";
import { GlassModal } from "../ui/GlassModal";
import { GlassButton } from "../ui/GlassButton";
import { Room, BookingFinancialSummary } from "@/lib/types";
import { getBookingPaymentsAction } from "@/app/actions/payments";
import { RecordPaymentModal } from "./RecordPaymentModal";
import {
  User,
  Phone,
  Calendar as CalendarIcon,
  Users,
  IndianRupee,
  NotebookPen,
  Briefcase,
  CheckCircle,
  LogOut,
  XCircle,
  AlertCircle,
  CreditCard,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  Clock,
  Receipt,
} from "lucide-react";
import { useHMSContext } from "../providers/HMSProvider";
import { cn } from "@/lib/utils";
import { DbInvoice, DbBooking } from "@/lib/types";
import { getInvoiceByBookingIdAction } from "@/app/actions/invoices";
import { InvoiceEditorModal } from "./InvoiceEditorModal";

interface ViewDetailsModalProps {
  room: Room | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ViewDetailsModal({ room, isOpen, onClose }: ViewDetailsModalProps) {
  const { rooms, updateBookingStatus, cancelBooking, selectedHomestayId } = useHMSContext();
  const [isUpdating, setIsUpdating] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Financial Ledger State
  const [financialSummary, setFinancialSummary] = useState<BookingFinancialSummary | null>(null);
  const [isLoadingFinancials, setIsLoadingFinancials] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);

  // Invoicing State
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [billingInvoice, setBillingInvoice] = useState<DbInvoice | null>(null);

  if (!room) return null;

  // Find fresh room from context
  const activeRoom = rooms.find((r) => r.id === room.id) || room;
  const booking = activeRoom.currentBooking;
  const isAvailable = activeRoom.status === "available";

  useEffect(() => {
    if (isOpen && booking?.id) {
      setIsLoadingFinancials(true);
      getBookingPaymentsAction(booking.id).then((res) => {
        setIsLoadingFinancials(false);
        if (res.success && res.summary) {
          setFinancialSummary(res.summary);
        }
      });
    } else {
      setFinancialSummary(null);
    }
  }, [isOpen, booking?.id]);

  const handleStatusUpdate = async (status: "confirmed" | "checked_in" | "checked_out") => {
    if (!booking) return;
    setIsUpdating(true);
    setFeedbackMsg(null);
    const result = await updateBookingStatus(booking.id, status);
    setIsUpdating(false);
    if (result.success) {
      setFeedbackMsg({ type: "success", text: `Status updated to ${status.replace("_", " ")}.` });
      if (status === "checked_out") {
        setTimeout(() => onClose(), 800);
      }
    } else {
      setFeedbackMsg({ type: "error", text: result.error || "Failed to update status." });
    }
  };

  const handleCancelBooking = async () => {
    if (!booking) return;
    const confirmed = window.confirm("Are you sure you want to cancel this booking?");
    if (!confirmed) return;

    setIsUpdating(true);
    setFeedbackMsg(null);
    const result = await cancelBooking(booking.id);
    setIsUpdating(false);
    if (result.success) {
      setFeedbackMsg({ type: "success", text: "Booking successfully cancelled." });
      setTimeout(() => onClose(), 800);
    } else {
      setFeedbackMsg({ type: "error", text: result.error || "Failed to cancel booking." });
    }
  };

  const handleOpenBilling = async () => {
    if (!booking) return;
    try {
      const res = await getInvoiceByBookingIdAction(booking.id);
      if (res.success && res.invoice) {
        setBillingInvoice(res.invoice);
      } else {
        setBillingInvoice(null);
      }
      setIsBillingModalOpen(true);
    } catch (err) {
      console.error("Failed to load invoice for room booking:", err);
      setBillingInvoice(null);
      setIsBillingModalOpen(true);
    }
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={isAvailable ? `Room Details: ${activeRoom.name}` : `Booking Details: ${activeRoom.name}`}
      footer={
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
          <div className="flex flex-wrap items-center gap-2">
            {!isAvailable && booking && (
              <>
                {booking.status === "confirmed" && (
                  <GlassButton
                    variant="primary"
                    onClick={() => handleStatusUpdate("checked_in")}
                    disabled={isUpdating}
                    className="px-4 text-xs flex items-center gap-1.5 bg-[#ECFDF5] hover:bg-[#D1FAE5] border-[#A7F3D0] text-[#059669]"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Check In
                  </GlassButton>
                )}
                {booking.status === "checked_in" && (
                  <GlassButton
                    variant="primary"
                    onClick={() => handleStatusUpdate("checked_out")}
                    disabled={isUpdating}
                    className="px-4 text-xs flex items-center gap-1.5 bg-[#FFFBEB] hover:bg-[#FEF3C7] border-[#FDE68A] text-[#D97706]"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Check Out
                  </GlassButton>
                )}
                <GlassButton
                  variant="ghost"
                  onClick={handleCancelBooking}
                  disabled={isUpdating}
                  className="px-3 text-xs flex items-center gap-1 text-[#DC2626] hover:bg-[#FEF2F2]"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel Stay
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  onClick={() => setIsPaymentModalOpen(true)}
                  disabled={isUpdating}
                  className="px-3 text-xs flex items-center gap-1.5 bg-[#F0EEFF] hover:bg-[#E0DEF8] border-[#E0DEF8] text-[#5146D8]"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  Record Payment
                </GlassButton>
                <GlassButton
                  variant="primary"
                  onClick={handleOpenBilling}
                  disabled={isUpdating}
                  className="px-3 text-xs flex items-center gap-1.5 bg-[#5146D8] hover:bg-[#4338CA] text-white border-transparent"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  Bill / Invoice
                </GlassButton>
              </>
            )}
          </div>
          <GlassButton variant="ghost" onClick={onClose} className="px-6 text-xs w-full sm:w-auto">
            Close
          </GlassButton>
        </div>
      }
    >
      <div className="space-y-6">
        {feedbackMsg && (
          <div
            className={cn(
              "p-3 rounded-xl flex items-center gap-2.5 text-xs border",
              feedbackMsg.type === "success"
                ? "bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]"
                : "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]"
            )}
          >
            {feedbackMsg.type === "success" ? (
              <CheckCircle className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {isAvailable ? (
          <div className="space-y-4">
            <h3 className="text-xs font-semibold tracking-widest text-[#77758F] uppercase">
              Room Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl flex items-center gap-3 shadow-[0_2px_8px_rgba(36,33,58,0.02)]">
                <Users className="w-4 h-4 text-[#5146D8]" />
                <div>
                  <p className="text-[10px] text-[#77758F] tracking-wider uppercase">Capacity</p>
                  <p className="text-sm font-medium text-[#24213A]">Max {activeRoom.maxCapacity} Guests</p>
                </div>
              </div>

              <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl flex items-center gap-3 shadow-[0_2px_8px_rgba(36,33,58,0.02)]">
                <IndianRupee className="w-4 h-4 text-[#5146D8]" />
                <div>
                  <p className="text-[10px] text-[#77758F] tracking-wider uppercase">Price</p>
                  <p className="text-sm font-medium text-[#24213A]">
                    ₹{activeRoom.pricePerNight.toLocaleString("en-IN")}/night
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl flex items-center gap-3 shadow-[0_2px_8px_rgba(36,33,58,0.02)]">
                <NotebookPen className="w-4 h-4 text-[#5146D8]" />
                <div>
                  <p className="text-[10px] text-[#77758F] tracking-wider uppercase">Bathroom</p>
                  <p className="text-sm font-medium text-[#24213A]">{activeRoom.bathroomInfo}</p>
                </div>
              </div>

              <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl flex items-center gap-3 shadow-[0_2px_8px_rgba(36,33,58,0.02)]">
                <NotebookPen className="w-4 h-4 text-[#5146D8]" />
                <div>
                  <p className="text-[10px] text-[#77758F] tracking-wider uppercase">Breakfast</p>
                  <p className="text-sm font-medium text-[#24213A]">{activeRoom.breakfastInfo}</p>
                </div>
              </div>
            </div>
          </div>
        ) : booking ? (
          <>
            {/* Status Badge */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-widest text-[#77758F] uppercase">
                Booking Status
              </span>
              <span
                className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-semibold tracking-widest uppercase border",
                  booking.status === "checked_in"
                    ? "bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]"
                    : booking.status === "confirmed"
                    ? "bg-[#FFFBEB] border-[#FDE68A] text-[#D97706]"
                    : "bg-[#F7F7FC] border-[#E8E7F2] text-[#77758F]"
                )}
              >
                {booking.status.replace("_", " ")}
              </span>
            </div>

            {/* Guest List Section */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-semibold tracking-widest text-[#77758F] uppercase">
                  Guests ({booking.guests.length}/{activeRoom.maxCapacity})
                </h3>
              </div>

              <div className="bg-[#F7F7FC] border border-[#E8E7F2] p-4 rounded-xl space-y-2">
                {booking.guests.length === 0 ? (
                  <p className="text-xs text-[#77758F] italic">No guests currently attached.</p>
                ) : (
                  booking.guests.map((guest, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center p-2 rounded-lg bg-[#FFFFFF] border border-[#E8E7F2]"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                            guest.isPrimary
                              ? "bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8]"
                              : "bg-[#F7F7FC] text-[#77758F] border border-[#E8E7F2]"
                          )}
                        >
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#24213A]">{guest.name}</p>
                          {guest.isPrimary && (
                            <p className="text-[10px] text-[#5146D8] font-semibold tracking-wider uppercase">
                              Primary Guest
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Phone & Booking Info */}
            <div className="space-y-4 pt-1">
              {/* Stay Dates */}
              <div className="space-y-3">
                <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-[#77758F] tracking-wider uppercase">Booked On</span>
                    <span className="font-medium text-[#24213A] mt-0.5">
                      {booking.createdAt ? formatISTDateTime(booking.createdAt) : 'Unknown'}
                    </span>
                  </div>
                </div>

                <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-[#77758F] tracking-wider uppercase">Check-in</span>
                    <span className="font-medium text-[#24213A] mt-0.5">{formatISTCompactDate(booking.checkIn)}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-[#77758F] tracking-wider uppercase">Time</span>
                    <span className="font-medium text-[#24213A] mt-0.5">12:00 PM</span>
                  </div>
                </div>

                <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-[#77758F] tracking-wider uppercase">Check-out</span>
                    <span className="font-medium text-[#24213A] mt-0.5">{formatISTCompactDate(booking.checkOut)}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-[#77758F] tracking-wider uppercase">Time</span>
                    <span className="font-medium text-[#24213A] mt-0.5">11:00 AM</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl flex items-center gap-3">
                  <Phone className="w-4 h-4 text-[#77758F] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-[#77758F] tracking-wider uppercase">Phone</p>
                    <p className="text-sm font-medium text-[#24213A] truncate">{booking.guestPhone || "N/A"}</p>
                  </div>
                </div>
              </div>

              {/* Financial Ledger & Payment Status Overview */}
              <div className="bg-[#F7F7FC] border border-[#E8E7F2] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <IndianRupee className="w-4 h-4 text-[#5146D8]" />
                    <span className="text-xs font-semibold tracking-wider uppercase text-[#24213A]">
                      Payment & Balance Overview
                    </span>
                  </div>
                  {financialSummary && (
                    <span
                      className={cn(
                        "px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase border",
                        financialSummary.paymentStatus === "paid" && "bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]",
                        financialSummary.paymentStatus === "partially_paid" && "bg-[#FFFBEB] border-[#FDE68A] text-[#D97706]",
                        financialSummary.paymentStatus === "unpaid" && "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]",
                        financialSummary.paymentStatus === "refunded" && "bg-[#F5F3FF] border-[#DDD6FE] text-[#7C3AED]",
                        financialSummary.paymentStatus === "overpaid" && "bg-[#EFF6FF] border-[#BFDBFE] text-[#2563EB]"
                      )}
                    >
                      {financialSummary.paymentStatus.replace("_", " ")}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-2.5 rounded-lg">
                    <span className="text-[9px] text-[#77758F] uppercase tracking-wider block">Total Stay</span>
                    <span className="text-xs sm:text-sm font-semibold text-[#24213A]">
                      {financialSummary ? financialSummary.formatted.totalContracted : `₹${booking.bookingAmount.toLocaleString("en-IN")}.00`}
                    </span>
                  </div>

                  <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-2.5 rounded-lg">
                    <span className="text-[9px] text-[#77758F] uppercase tracking-wider block">Net Paid</span>
                    <span className={cn(
                      "text-xs sm:text-sm font-semibold",
                      financialSummary && parseFloat(financialSummary.netPaid) > 0 ? "text-[#059669]" : "text-[#77758F]"
                    )}>
                      {financialSummary ? financialSummary.formatted.netPaid : "₹0.00"}
                    </span>
                  </div>

                  <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-2.5 rounded-lg">
                    <span className="text-[9px] text-[#77758F] uppercase tracking-wider block">Balance Due</span>
                    <span className={cn(
                      "text-xs sm:text-sm font-semibold",
                      financialSummary && parseFloat(financialSummary.balanceDue) <= 0 ? "text-[#059669]" : "text-[#DC2626]"
                    )}>
                      {financialSummary ? financialSummary.formatted.balanceDue : `₹${booking.bookingAmount.toLocaleString("en-IN")}.00`}
                    </span>
                  </div>
                </div>

                {/* Transaction History Accordion */}
                <div className="pt-2 border-t border-[#E8E7F2]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-[#77758F] uppercase tracking-wider font-medium">
                      Transaction Ledger ({financialSummary?.payments.length || 0})
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsPaymentModalOpen(true)}
                      className="text-[11px] text-[#5146D8] font-medium hover:underline flex items-center gap-1"
                    >
                      + Record Entry
                    </button>
                  </div>

                  {isLoadingFinancials ? (
                    <p className="text-xs text-[#77758F] italic">Loading transactions...</p>
                  ) : !financialSummary || financialSummary.payments.length === 0 ? (
                    <p className="text-xs text-[#77758F] italic">No payment transactions recorded yet.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto hide-scrollbar pr-1">
                      {financialSummary.payments.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-[#FFFFFF] border border-[#E8E7F2] text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {p.payment_type === 'payment' && (
                              <ArrowDownLeft className="w-3.5 h-3.5 text-[#059669] shrink-0" />
                            )}
                            {p.payment_type === 'refund' && (
                              <ArrowUpRight className="w-3.5 h-3.5 text-[#DC2626] shrink-0" />
                            )}
                            {p.payment_type === 'reversal' && (
                              <RotateCcw className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-[#24213A] truncate">
                                {p.payment_type === 'payment' && `Payment via ${p.payment_method.toUpperCase()}`}
                                {p.payment_type === 'refund' && `Guest Refund (${p.payment_method.toUpperCase()})`}
                                {p.payment_type === 'reversal' && `Reversal / Void Entry`}
                              </p>
                              <p className="text-[10px] text-[#77758F] truncate">
                                {formatISTDateTime(p.created_at)}
                                {p.notes ? ` • ${p.notes}` : ""}
                              </p>
                            </div>
                          </div>
                          <span
                            className={cn(
                              "font-semibold whitespace-nowrap ml-2",
                              p.payment_type === 'payment' && "text-[#059669]",
                              p.payment_type === 'refund' && "text-[#DC2626]",
                              p.payment_type === 'reversal' && "text-[#77758F] line-through"
                            )}
                          >
                            {p.payment_type === 'payment' ? '+' : p.payment_type === 'refund' ? '-' : '↺'} ₹{Number(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Partner & Notes */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl flex items-start gap-3 col-span-1 md:col-span-2">
                  <NotebookPen className="w-4 h-4 text-[#77758F] mt-0.5" />
                  <div>
                    <p className="text-[10px] text-[#77758F] tracking-wider uppercase">Special Notes</p>
                    <p className="text-[13px] text-[#24213A] mt-1">{booking.notes || "None"}</p>
                  </div>
                </div>

                <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl flex items-center gap-3 col-span-1 md:col-span-2">
                  <Briefcase className="w-4 h-4 text-[#77758F]" />
                  <div>
                    <p className="text-[10px] text-[#77758F] tracking-wider uppercase">Booked By Partner</p>
                    <p className="text-[13px] font-medium text-[#24213A]">{booking.bookedBy}</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Record Payment / Refund / Reversal Sub-Modal */}
      {booking && isPaymentModalOpen && (
        <RecordPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          bookingId={booking.id}
          financialSummary={financialSummary}
          onPaymentRecorded={(newSummary) => {
            setFinancialSummary(newSummary);
            setFeedbackMsg({ type: "success", text: "Transaction recorded in ledger." });
          }}
        />
      )}

      {/* Invoice Editor Modal */}
      {booking && isBillingModalOpen && (
        <InvoiceEditorModal
          isOpen={isBillingModalOpen}
          onClose={() => setIsBillingModalOpen(false)}
          existingInvoice={billingInvoice}
          booking={{
            id: booking.id,
            room_id: activeRoom.id,
            partner_id: booking.partnerId || '',
            homestay_id: activeRoom.homestay_id || selectedHomestayId || '',
            check_in: booking.checkIn,
            check_out: booking.checkOut,
            status: booking.status,
            number_of_guests: booking.guests?.length || 1,
            nightly_rate: activeRoom.nightly_rate || activeRoom.pricePerNight,
            total_amount: booking.bookingAmount,
            notes: booking.notes || null,
            created_at: booking.createdAt || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            rooms: {
              id: activeRoom.id,
              room_number: activeRoom.room_number || '',
              name: activeRoom.name,
              nightly_rate: activeRoom.nightly_rate || activeRoom.pricePerNight,
            } as any,
            guests: (booking.guests || []).map((g, idx) => ({
              id: g.id || `guest-${idx}`,
              booking_id: booking.id,
              name: g.name,
              phone: g.phone || null,
              email: g.email || null,
              is_primary: g.isPrimary,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })),
          }}
          onSaved={(_id, _inv, shouldClose = true) => {
            if (shouldClose) {
              setIsBillingModalOpen(false);
            }
            if (booking?.id) {
              getBookingPaymentsAction(booking.id).then((res) => {
                if (res.success && res.summary) setFinancialSummary(res.summary);
              });
            }
          }}
        />
      )}
    </GlassModal>
  );
}
