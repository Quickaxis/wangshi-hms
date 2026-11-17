"use client";

import { formatISTDateTime, formatISTCompactDate } from "@/lib/dateUtils";

import { useState, useEffect, useMemo } from "react";
import { GlassModal } from "../ui/GlassModal";
import { GlassButton } from "../ui/GlassButton";
import { Room, BookingFinancialSummary } from "@/lib/types";
import { getBookingPaymentsAction } from "@/app/actions/payments";
import { RecordPaymentModal } from "./RecordPaymentModal";
import { formatPhoneNumberForCall } from "@/lib/phoneUtils";
import { getGuestProfileAndHistoryAction } from "@/app/actions/guests";
import { createClient } from "@/lib/supabase/client";
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
  Mail,
  History,
  Building2,
  ChevronDown,
  ChevronUp,
  Layers,
} from "lucide-react";
import { useHMSContext } from "../providers/HMSProvider";
import { cn } from "@/lib/utils";
import { DbInvoice, DbBooking } from "@/lib/types";
import { getInvoiceByBookingIdAction, getOrCreateBookingFolioAction } from "@/app/actions/invoices";
import { InvoiceEditorModal } from "./InvoiceEditorModal";

interface ViewDetailsModalProps {
  room: Room | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ViewDetailsModal({ room, isOpen, onClose }: ViewDetailsModalProps) {
  const { rooms, updateBookingStatus, cancelBooking, selectedHomestayId, homestays } = useHMSContext();
  const [isUpdating, setIsUpdating] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Financial Ledger State
  const [financialSummary, setFinancialSummary] = useState<BookingFinancialSummary | null>(null);
  const [isLoadingFinancials, setIsLoadingFinancials] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);

  // Invoicing & Folio State
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [billingInvoice, setBillingInvoice] = useState<DbInvoice | null>(null);
  const [initialBillingTab, setInitialBillingTab] = useState<"items" | "payments">("items");

  // Guest Stay History State
  const [stayHistory, setStayHistory] = useState<any[]>([]);
  const [isLoadingStayHistory, setIsLoadingStayHistory] = useState(false);
  const [isStayHistoryOpen, setIsStayHistoryOpen] = useState(false);

  // Group Booking Primary Guest Fallback State
  const [groupLeadGuest, setGroupLeadGuest] = useState<{
    name: string;
    phone?: string | null;
    email?: string | null;
  } | null>(null);

  if (!room) return null;

  // Prioritize booking explicitly passed on room prop (e.g. from calendar click)
  const contextRoom = rooms.find((r) => r.id === room.id);
  const booking = room.currentBooking || contextRoom?.currentBooking;
  const activeRoom: Room = {
    ...(contextRoom || room),
    ...(booking ? { currentBooking: booking, status: "booked" as const } : {}),
  };
  const isAvailable = !booking && activeRoom.status === "available";

  const currentHomestay = homestays?.find((h) => h.id === (activeRoom.homestay_id || selectedHomestayId)) || homestays?.[0];

  const rawPrimaryGuest = booking?.guests?.find((g) => g.isPrimary) || booking?.guests?.[0];
  const hasValidOwnName = Boolean(
    rawPrimaryGuest?.name &&
    rawPrimaryGuest.name.trim() !== "" &&
    rawPrimaryGuest.name.trim().toLowerCase() !== "guest"
  );

  const effectivePrimaryName = hasValidOwnName
    ? rawPrimaryGuest!.name
    : (groupLeadGuest?.name || rawPrimaryGuest?.name || "Guest");

  const effectivePhone =
    (hasValidOwnName && rawPrimaryGuest?.phone) ||
    booking?.guestPhone ||
    rawPrimaryGuest?.phone ||
    groupLeadGuest?.phone ||
    null;

  const effectiveEmail =
    (hasValidOwnName && rawPrimaryGuest?.email) ||
    rawPrimaryGuest?.email ||
    groupLeadGuest?.email ||
    null;

  const callInfo = formatPhoneNumberForCall(effectivePhone);

  const nights = useMemo(() => {
    if (!booking?.checkIn || !booking?.checkOut) return 1;
    try {
      const diff = new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime();
      return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
    } catch {
      return 1;
    }
  }, [booking?.checkIn, booking?.checkOut]);

  useEffect(() => {
    if (!isOpen || !booking?.id) {
      setFinancialSummary(null);
      setGroupLeadGuest(null);
      return;
    }

    setIsLoadingFinancials(true);
    getBookingPaymentsAction(booking.id).then((res) => {
      setIsLoadingFinancials(false);
      if (res.success && res.summary) {
        setFinancialSummary(res.summary);
      }
    });

    // If booking belongs to a group and child room has no valid own guest name/phone, query group lead
    if (booking.groupId && (!hasValidOwnName || !booking.guestPhone)) {
      const supabase = createClient();
      supabase
        .from("bookings")
        .select(`
          id,
          is_group_lead,
          guests ( id, name, phone, email, is_primary )
        `)
        .eq("group_id", booking.groupId)
        .then(({ data }) => {
          if (data && data.length > 0) {
            let found: any = undefined;
            const lead = data.find((b: any) => b.is_group_lead);
            if (lead?.guests && lead.guests.length > 0) {
              found =
                lead.guests.find((g: any) => g.is_primary && g.name?.trim().toLowerCase() !== "guest") ||
                lead.guests.find((g: any) => g.name && g.name.trim().toLowerCase() !== "guest") ||
                lead.guests[0];
            }
            if (!found) {
              for (const b of data) {
                const candidate = b.guests?.find((g: any) => g.name && g.name.trim().toLowerCase() !== "guest");
                if (candidate) {
                  found = candidate;
                  break;
                }
              }
            }
            if (found && found.name && found.name.trim().toLowerCase() !== "guest") {
              setGroupLeadGuest({
                name: found.name.trim(),
                phone: found.phone || null,
                email: found.email || null,
              });
            }
          }
        });
    } else {
      setGroupLeadGuest(null);
    }
  }, [isOpen, booking?.id, booking?.groupId, hasValidOwnName, booking?.guestPhone]);

  // Load guest stay history using effective contact
  useEffect(() => {
    if (isOpen && booking?.id && (effectivePhone || effectiveEmail)) {
      setIsLoadingStayHistory(true);
      getGuestProfileAndHistoryAction(effectivePhone, activeRoom.homestay_id || selectedHomestayId || undefined, effectiveEmail)
        .then((res) => {
          if (res.success && res.data) {
            setStayHistory(res.data);
          } else {
            setStayHistory([]);
          }
        })
        .catch((err) => {
          console.error("Failed to load stay history:", err);
          setStayHistory([]);
        })
        .finally(() => {
          setIsLoadingStayHistory(false);
        });
    } else {
      setStayHistory([]);
    }
  }, [isOpen, booking?.id, effectivePhone, effectiveEmail, activeRoom.homestay_id, selectedHomestayId]);

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

  const handleOpenBilling = async (tab: "items" | "payments" = "items") => {
    if (!booking) return;
    setInitialBillingTab(tab);
    try {
      const res = await getOrCreateBookingFolioAction(booking.id);
      if (res.success && res.invoice) {
        setBillingInvoice(res.invoice);
      } else {
        setBillingInvoice(null);
      }
      setIsBillingModalOpen(true);
    } catch (err) {
      console.error("Failed to load folio for room booking:", err);
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
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 w-full">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            {!isAvailable && booking && (
              <>
                {booking.status === "confirmed" && (
                  <GlassButton
                    variant="primary"
                    onClick={() => handleStatusUpdate("checked_in")}
                    disabled={isUpdating}
                    className="px-3 py-1.5 text-xs flex items-center justify-center gap-1.5 bg-[#ECFDF5] hover:bg-[#D1FAE5] border-[#A7F3D0] text-[#059669]"
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
                    className="px-3 py-1.5 text-xs flex items-center justify-center gap-1.5 bg-[#FFFBEB] hover:bg-[#FEF3C7] border-[#FDE68A] text-[#D97706]"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Check Out
                  </GlassButton>
                )}
                {callInfo && (
                  <a
                    href={callInfo.telHref}
                    className="px-3 py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 bg-[#059669] hover:bg-[#047857] text-white rounded-xl shadow-sm transition-all"
                    title={`Call guest on ${callInfo.displayPhone}`}
                  >
                    <Phone className="w-3.5 h-3.5" />
                    Call Guest
                  </a>
                )}
                <GlassButton
                  variant="primary"
                  onClick={() => handleOpenBilling("items")}
                  disabled={isUpdating}
                  className="px-3.5 py-1.5 text-xs flex items-center justify-center gap-1.5 bg-[#5146D8] hover:bg-[#4338CA] text-white border-transparent shadow-sm"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  Guest Folio & Billing
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  onClick={() => handleOpenBilling("payments")}
                  disabled={isUpdating}
                  className="px-2.5 py-1.5 text-xs flex items-center justify-center gap-1.5 bg-[#F0EEFF] hover:bg-[#E0DEF8] border-[#E0DEF8] text-[#5146D8]"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  Record Payment
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  onClick={handleCancelBooking}
                  disabled={isUpdating}
                  className="px-2.5 py-1.5 text-xs flex items-center justify-center gap-1 text-[#DC2626] hover:bg-[#FEF2F2]"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel Stay
                </GlassButton>
              </>
            )}
          </div>
          <GlassButton variant="ghost" onClick={onClose} className="px-5 py-1.5 text-xs w-full sm:w-auto shrink-0">
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
            {/* 1. Property, Room & Status Banner */}
            <div className="p-3.5 rounded-2xl bg-[#F7F7FC] border border-[#E8E7F2] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#F0EEFF] border border-[#E0DEF8] flex items-center justify-center text-[#5146D8] shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#77758F] block">
                    {currentHomestay?.name || "Homestay"}
                  </span>
                  <div className="text-xs sm:text-sm font-bold text-[#24213A] truncate flex items-center gap-1.5">
                    <span>{activeRoom.name}</span>
                    {activeRoom.room_number && (
                      <span className="text-[10px] font-semibold text-[#5146D8] bg-[#FFFFFF] px-1.5 py-0.5 rounded-md border border-[#E0DEF8]">
                        #{activeRoom.room_number}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <span
                  className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border",
                    booking.status === "checked_in"
                      ? "bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]"
                      : booking.status === "confirmed"
                      ? "bg-[#FFFBEB] border-[#FDE68A] text-[#D97706]"
                      : booking.status === "checked_out"
                      ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#2563EB]"
                      : "bg-[#F7F7FC] border-[#E8E7F2] text-[#77758F]"
                  )}
                >
                  {booking.status.replace("_", " ")}
                </span>
              </div>
            </div>

            {/* 2. Guest Information & Direct Calling */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold tracking-widest text-[#77758F] uppercase flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#5146D8]" />
                  Guest Details ({booking.guests.length}/{activeRoom.maxCapacity} Guests)
                </h3>
                {callInfo && (
                  <a
                    href={callInfo.telHref}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                    title={`Call ${effectivePrimaryName}`}
                  >
                    <Phone className="w-3 h-3" />
                    <span>Call Guest</span>
                  </a>
                )}
              </div>

              {/* Primary Contact Card */}
              <div className="bg-[#FFFFFF] border border-[#E8E7F2] rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E8E7F2]/70 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#5146D8] block">
                        Primary Guest
                      </span>
                      {booking.groupId && (
                        <span className="text-[9px] font-bold text-[#5146D8] bg-[#F0EEFF] px-2 py-0.2 rounded-md border border-[#E0DEF8] flex items-center gap-1">
                          <Layers className="w-2.5 h-2.5" />
                          Group Lead
                        </span>
                      )}
                    </div>
                    <h4 className="text-base font-bold text-[#24213A] mt-0.5">
                      {effectivePrimaryName}
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-[#77758F] bg-[#F7F7FC] px-2.5 py-1 rounded-xl border border-[#E8E7F2]">
                      {booking.guests.length || 1} {booking.guests.length === 1 ? "Guest" : "Guests"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Phone & Direct Call Link */}
                  <div className="bg-[#F7F7FC] border border-[#E8E7F2] p-3 rounded-xl flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#77758F] block">
                        Phone Number
                      </span>
                      <span className="font-semibold text-[#24213A] truncate block mt-0.5">
                        {callInfo ? callInfo.displayPhone : (effectivePhone || "Not recorded")}
                      </span>
                    </div>
                    {callInfo ? (
                      <a
                        href={callInfo.telHref}
                        className="px-2.5 py-1.5 bg-[#059669] hover:bg-[#047857] text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors shadow-sm"
                        title="Click to dial"
                      >
                        <Phone className="w-3 h-3" />
                        Call
                      </a>
                    ) : (
                      <span className="text-[10px] text-[#77758F] bg-[#FFFFFF] px-2 py-1 rounded border border-[#E8E7F2] shrink-0">
                        No Phone
                      </span>
                    )}
                  </div>

                  {/* Email */}
                  <div className="bg-[#F7F7FC] border border-[#E8E7F2] p-3 rounded-xl flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#77758F] block">
                        Email Address
                      </span>
                      {effectiveEmail ? (
                        <a
                          href={`mailto:${effectiveEmail}`}
                          className="font-semibold text-[#5146D8] hover:underline truncate block mt-0.5"
                          title="Send email"
                        >
                          {effectiveEmail}
                        </a>
                      ) : (
                        <span className="text-xs text-[#77758F] italic block mt-0.5">Not recorded</span>
                      )}
                    </div>
                    {effectiveEmail && (
                      <a
                        href={`mailto:${effectiveEmail}`}
                        className="p-1.5 rounded-lg bg-[#FFFFFF] border border-[#E8E7F2] text-[#5146D8] hover:bg-[#F0EEFF] shrink-0"
                        title="Email guest"
                      >
                        <Mail className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Additional Attached Guests (if > 1) */}
                {booking.guests.length > 1 && (
                  <div className="pt-2 border-t border-[#E8E7F2]/60">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#77758F] block mb-1.5">
                      Accompanying Guests ({booking.guests.length - 1})
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {booking.guests
                        .filter((g) => !g.isPrimary)
                        .map((guest, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 p-2 rounded-lg bg-[#F7F7FC] border border-[#E8E7F2] text-xs"
                          >
                            <span className="w-5 h-5 rounded-full bg-[#FFFFFF] border border-[#E8E7F2] text-[10px] font-bold flex items-center justify-center text-[#77758F]">
                              {idx + 2}
                            </span>
                            <span className="font-medium text-[#24213A] truncate">{guest.name}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* 3. Guest Stay History Integration */}
                <div className="pt-2 border-t border-[#E8E7F2]/60">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setIsStayHistoryOpen((prev) => !prev)}
                      className="flex items-center gap-1.5 text-xs font-bold text-[#5146D8] hover:text-[#4338CA] transition-colors cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>
                        Stay History {stayHistory.length > 0 ? `(${stayHistory.length} Stays)` : ""}
                      </span>
                      {isStayHistoryOpen ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <span className="text-[10px] font-semibold text-[#77758F]">
                      {isLoadingStayHistory ? (
                        "Loading history..."
                      ) : stayHistory.length > 1 ? (
                        <span className="text-[#059669] font-bold">Returning Guest ({stayHistory.length} Visits)</span>
                      ) : stayHistory.length === 1 ? (
                        <span>First Visit</span>
                      ) : (
                        <span>No prior records</span>
                      )}
                    </span>
                  </div>

                  {isStayHistoryOpen && (
                    <div className="mt-2.5 p-3 rounded-xl bg-[#F7F7FC] border border-[#E8E7F2] space-y-2">
                      {isLoadingStayHistory ? (
                        <p className="text-xs text-[#77758F] italic py-2 text-center">Loading past stays...</p>
                      ) : stayHistory.length === 0 ? (
                        <p className="text-xs text-[#77758F] italic py-1 text-center">
                          No other stays recorded for this phone or email.
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto hide-scrollbar">
                          {stayHistory.map((rec: any, idx: number) => {
                            const b = rec.bookings;
                            if (!b) return null;
                            const isCurrentStay = b.id === booking.id;
                            return (
                              <div
                                key={idx}
                                className={cn(
                                  "flex items-center justify-between p-2 rounded-lg border text-xs",
                                  isCurrentStay
                                    ? "bg-[#F0EEFF] border-[#E0DEF8]"
                                    : "bg-[#FFFFFF] border-[#E8E7F2]"
                                )}
                              >
                                <div className="min-w-0">
                                  <div className="font-bold text-[#24213A] flex items-center gap-1.5">
                                    <span>{b.rooms?.name || "Room"}</span>
                                    {b.rooms?.room_number && <span>(#{b.rooms.room_number})</span>}
                                    {isCurrentStay && (
                                      <span className="text-[9px] bg-[#5146D8] text-white px-1.5 py-0.2 rounded font-semibold">
                                        Current
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-[#77758F]">
                                    {formatISTCompactDate(b.check_in)} → {formatISTCompactDate(b.check_out)}
                                  </div>
                                </div>
                                <div className="text-right shrink-0 ml-2">
                                  <span className="font-bold text-[#5146D8] block">
                                    ₹{Number(b.total_amount || 0).toLocaleString("en-IN")}
                                  </span>
                                  <span className="text-[9px] uppercase font-bold text-[#77758F]">
                                    {b.status}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 4. Stay Information */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold tracking-widest text-[#77758F] uppercase flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-[#5146D8]" />
                Stay Information
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl">
                  <span className="text-[9px] text-[#77758F] uppercase tracking-wider block font-bold">
                    Check-in
                  </span>
                  <span className="font-bold text-xs sm:text-sm text-[#24213A] mt-0.5 block">
                    {formatISTCompactDate(booking.checkIn)}
                  </span>
                  <span className="text-[10px] text-[#77758F]">12:00 PM</span>
                </div>

                <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl">
                  <span className="text-[9px] text-[#77758F] uppercase tracking-wider block font-bold">
                    Check-out
                  </span>
                  <span className="font-bold text-xs sm:text-sm text-[#24213A] mt-0.5 block">
                    {formatISTCompactDate(booking.checkOut)}
                  </span>
                  <span className="text-[10px] text-[#77758F]">11:00 AM</span>
                </div>

                <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl">
                  <span className="text-[9px] text-[#77758F] uppercase tracking-wider block font-bold">
                    Duration
                  </span>
                  <span className="font-bold text-xs sm:text-sm text-[#5146D8] mt-0.5 block">
                    {nights} {nights === 1 ? "Night" : "Nights"}
                  </span>
                  <span className="text-[10px] text-[#77758F]">Total Stay</span>
                </div>

                <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl">
                  <span className="text-[9px] text-[#77758F] uppercase tracking-wider block font-bold">
                    Booking ID
                  </span>
                  <span className="font-bold text-xs text-[#24213A] mt-0.5 block truncate">
                    #{booking.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span className="text-[10px] text-[#77758F] truncate block">
                    {booking.createdAt ? formatISTDateTime(booking.createdAt).split("·")[0] : "Direct"}
                  </span>
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

      {/* Invoice / Folio Editor Modal */}
      {booking && isBillingModalOpen && (
        <InvoiceEditorModal
          isOpen={isBillingModalOpen}
          onClose={() => setIsBillingModalOpen(false)}
          existingInvoice={billingInvoice}
          initialTab={initialBillingTab}
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
