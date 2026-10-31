"use client";

import Link from "next/link";

import { useState, useEffect, useMemo, useCallback } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import {
  Calendar,
  Inbox,
  Users,
  IndianRupee,
  BedDouble,
  Search,
  Filter,
  CheckCircle,
  LogOut,
  XCircle,
  Eye,
  Loader2,
  CalendarIcon,
  Phone,
  User,
  Receipt,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BookingStatus, DbBooking, DbInvoice } from "@/lib/types";
import { updateBookingStatusAction, cancelBookingAction } from "@/app/actions/bookings";
import { getInvoiceByBookingIdAction } from "@/app/actions/invoices";
import { GlassModal } from "@/components/ui/GlassModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { InvoiceEditorModal } from "@/components/modals/InvoiceEditorModal";
import { useHMSContext } from "@/components/providers/HMSProvider";
import { cn } from "@/lib/utils";
import { formatISTDateTime, formatISTCompactDate, combineDateAndTime } from "@/lib/dateUtils";

export default function BookingsPage() {
  const { selectedHomestayId } = useHMSContext();
  const [bookings, setBookings] = useState<DbBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [selectedBooking, setSelectedBooking] = useState<DbBooking | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Billing Modal State
  const [billingBooking, setBillingBooking] = useState<DbBooking | null>(null);
  const [billingInvoice, setBillingInvoice] = useState<DbInvoice | null>(null);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const fetchBookings = useCallback(async () => {
    try {
      let query = supabase
        .from("bookings")
        .select(`
          id,
          room_id,
          partner_id,
          homestay_id,
          check_in,
          check_out,
          status,
          number_of_guests,
          nightly_rate,
          total_amount,
          notes,
          created_at,
          updated_at,
          rooms ( id, room_number, name, nightly_rate ),
          partners ( id, name, email ),
          guests ( id, name, phone, email, is_primary )
        `);

      if (selectedHomestayId) {
        query = query.eq("homestay_id", selectedHomestayId);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching bookings:", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code
        });
      } else if (data) {
        setBookings(data as unknown as DbBooking[]);
      }
    } catch (err) {
      console.error("Bookings query exception:", err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, selectedHomestayId]);

  useEffect(() => {
    fetchBookings();

    const channel = supabase
      .channel(`bookings-page-sync-${selectedHomestayId || "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => {
          fetchBookings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchBookings, selectedHomestayId]);

  const handleStatusChange = async (bookingId: string, newStatus: BookingStatus) => {
    setActionLoading(bookingId);
    try {
      const result = await updateBookingStatusAction(bookingId, newStatus);
      if (result.success) {
        await fetchBookings();
        if (selectedBooking && selectedBooking.id === bookingId) {
          setSelectedBooking((prev) => (prev ? { ...prev, status: newStatus } : null));
        }
      } else {
        alert(result.error || "Failed to update status");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (bookingId: string) => {
    if (!window.confirm("Are you sure you want to cancel this booking?")) return;
    setActionLoading(bookingId);
    try {
      const result = await cancelBookingAction(bookingId);
      if (result.success) {
        await fetchBookings();
        if (selectedBooking && selectedBooking.id === bookingId) {
          setSelectedBooking((prev) => (prev ? { ...prev, status: "cancelled" } : null));
        }
      } else {
        alert(result.error || "Failed to cancel booking");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateOrViewBill = async (booking: DbBooking) => {
    setActionLoading(booking.id);
    try {
      const res = await getInvoiceByBookingIdAction(booking.id);
      if (res.success && res.invoice) {
        setBillingInvoice(res.invoice);
        setBillingBooking(booking);
      } else {
        setBillingInvoice(null);
        setBillingBooking(booking);
      }
      setIsBillingModalOpen(true);
    } catch (e) {
      console.error("Error checking invoice for booking:", e);
      setBillingInvoice(null);
      setBillingBooking(booking);
      setIsBillingModalOpen(true);
    } finally {
      setActionLoading(null);
    }
  };

  // Dynamic room options extracted from bookings
  const availableRoomOptions = useMemo(() => {
    const roomMap = new Map<string, string>();
    bookings.forEach((b) => {
      const rId = b.room_id;
      const rName = b.rooms?.name || (b.rooms?.room_number ? `Room ${b.rooms.room_number}` : `Room ${rId}`);
      if (rId && !roomMap.has(rId)) {
        roomMap.set(rId, rName);
      }
    });
    return Array.from(roomMap.entries()).map(([id, name]) => ({ id, name }));
  }, [bookings]);

  // Filtered bookings
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // Status filter
      if (statusFilter !== "all" && b.status !== statusFilter) {
        return false;
      }

      // Room filter
      if (roomFilter !== "all") {
        const matches = b.room_id === roomFilter || b.rooms?.room_number === roomFilter || b.rooms?.id === roomFilter;
        if (!matches) return false;
      }

      // Date filter
      if (dateFilter) {
        if (b.check_in !== dateFilter && b.check_out !== dateFilter) {
          // Check if dateFilter falls inside [check_in, check_out)
          if (!(dateFilter >= b.check_in && dateFilter < b.check_out)) {
            return false;
          }
        }
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const bookingIdMatch = b.id.toLowerCase().includes(q);
        const roomNameMatch = b.rooms?.name.toLowerCase().includes(q);
        const partnerNameMatch = b.partners?.name.toLowerCase().includes(q);
        const guestMatch = b.guests?.some(
          (g) => g.name.toLowerCase().includes(q) || (g.phone && g.phone.includes(q))
        );
        if (!bookingIdMatch && !roomNameMatch && !partnerNameMatch && !guestMatch) {
          return false;
        }
      }

      return true;
    });
  }, [bookings, statusFilter, roomFilter, dateFilter, searchQuery]);

  return (
    <div className="flex flex-col h-full overflow-y-auto hide-scrollbar space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-[#24213A]">Booking Management</h2>
          <p className="text-[#77758F] mt-1 text-xs md:text-sm tracking-wide">
            View, search, and manage all reservations.
          </p>
        </div>

        {/* Stats Pills */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] md:text-xs">
          <Link
            href="/requests"
            className="px-3 py-1.5 rounded-full bg-[#F0EEFF] border border-[#E0DEF8] text-[#5146D8] hover:bg-[#E0DEF8] transition-colors font-medium flex items-center gap-1.5 shadow-sm"
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Website Requests</span>
          </Link>
          <span className="px-3 py-1.5 rounded-full bg-[#FFFFFF] border border-[#E8E7F2] text-[#77758F] font-medium shadow-sm">
            Total: <strong className="text-[#24213A]">{bookings.length}</strong>
          </span>
          <span className="px-3 py-1.5 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#059669] font-medium shadow-sm">
            Confirmed:{" "}
            <strong>{bookings.filter((b) => b.status === "confirmed").length}</strong>
          </span>
          <span className="px-3 py-1.5 rounded-full bg-[#FFFBEB] border border-[#FDE68A] text-[#D97706] font-medium shadow-sm">
            Checked In:{" "}
            <strong>{bookings.filter((b) => b.status === "checked_in").length}</strong>
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-3 md:p-4 rounded-[20px] md:rounded-2xl bg-[#FFFFFF] border border-[#E8E7F2] shadow-[0_2px_12px_rgba(36,33,58,0.03)] flex flex-wrap items-center gap-2.5 md:gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#77758F] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search bookings..."
            className="w-full bg-[#F7F7FC] border border-[#E8E7F2] rounded-xl pl-9 pr-4 py-2 md:py-2.5 text-xs font-medium text-[#24213A] placeholder-[#8F8CA4] outline-none focus:border-[#5146D8] transition-colors"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1 bg-[#F7F7FC] border border-[#E8E7F2] rounded-xl px-2 py-1.5 md:py-1">
          <Filter className="w-3.5 h-3.5 text-[#77758F] ml-1" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent text-[11px] md:text-xs font-medium text-[#24213A] outline-none cursor-pointer py-0.5 pr-1 md:pr-2"
          >
            <option value="all" className="bg-[#FFFFFF] text-[#24213A]">All Statuses</option>
            <option value="confirmed" className="bg-[#FFFFFF] text-[#24213A]">Confirmed</option>
            <option value="checked_in" className="bg-[#FFFFFF] text-[#24213A]">Checked In</option>
            <option value="checked_out" className="bg-[#FFFFFF] text-[#24213A]">Checked Out</option>
            <option value="cancelled" className="bg-[#FFFFFF] text-[#24213A]">Cancelled</option>
          </select>
        </div>

        {/* Room Filter */}
        <div className="flex items-center gap-1 bg-[#F7F7FC] border border-[#E8E7F2] rounded-xl px-2 py-1.5 md:py-1">
          <BedDouble className="w-3.5 h-3.5 text-[#77758F] ml-1" />
          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="bg-transparent text-[11px] md:text-xs font-medium text-[#24213A] outline-none cursor-pointer py-0.5 pr-1 md:pr-2"
          >
            <option value="all" className="bg-[#FFFFFF] text-[#24213A]">All Rooms</option>
            {availableRoomOptions.map((r) => (
              <option key={r.id} value={r.id} className="bg-[#FFFFFF] text-[#24213A]">
                {r.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-1.5 bg-[#F7F7FC] border border-[#E8E7F2] rounded-xl px-3 py-1.5 md:py-1">
          <CalendarIcon className="w-3.5 h-3.5 text-[#77758F]" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-transparent text-[11px] md:text-xs font-medium text-[#24213A] outline-none cursor-pointer py-0.5"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter("")}
              className="text-[10px] text-[#5146D8] hover:underline ml-1 font-bold"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Bookings Display */}
      <div className="p-0 md:p-1 rounded-[24px] bg-transparent border-transparent md:bg-[#FFFFFF] md:border md:border-[#E8E7F2] shadow-none md:shadow-[0_4px_24px_rgba(36,33,58,0.03)] overflow-hidden">
        
        {/* Mobile View (Cards) */}
        <div className="md:hidden flex flex-col gap-3 pb-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Loader2 className="w-6 h-6 text-[#5146D8] animate-spin" />
              <span className="text-[#77758F] text-xs">Loading bookings...</span>
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="bg-[#FFFFFF] border border-[#E8E7F2] rounded-[20px] p-8 flex flex-col items-center justify-center gap-2 text-center shadow-sm">
              <div className="w-12 h-12 rounded-full bg-[#F7F7FC] flex items-center justify-center mb-1">
                <Search className="w-5 h-5 text-[#77758F]" />
              </div>
              <div className="text-[#24213A] font-bold text-sm">No bookings found</div>
              <div className="text-xs text-[#77758F] font-medium">Try adjusting your filters or search criteria.</div>
            </div>
          ) : (
            filteredBookings.map((booking) => {
              const primaryGuest = booking.guests?.find((g) => g.is_primary) || booking.guests?.[0];
              const isCancelled = booking.status === "cancelled";
              return (
                <div 
                  key={booking.id} 
                  className={cn(
                    "bg-[#FFFFFF] rounded-[20px] p-4 flex flex-col gap-3 transition-all shadow-[0_2px_8px_rgba(36,33,58,0.02)]",
                    isCancelled 
                      ? "opacity-70 bg-[#FEF2F2]/30 border border-[#FECACA]" 
                      : "border border-[#E8E7F2]"
                  )}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border",
                        isCancelled 
                          ? "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]" 
                          : "bg-[#F0EEFF] border-[#E0DEF8] text-[#5146D8]"
                      )}>
                        {primaryGuest?.name?.substring(0, 1).toUpperCase() || "G"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className={cn(
                          "font-bold text-sm truncate",
                          isCancelled ? "text-[#77758F] line-through" : "text-[#24213A]"
                        )}>
                          {primaryGuest?.name || "Guest"}
                        </h4>
                        <div className="text-[11px] text-[#77758F] font-medium mt-0.5 truncate">
                          {booking.rooms?.name || `Room ${booking.room_id}`}
                        </div>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-bold tracking-widest uppercase border shrink-0",
                        booking.status === "confirmed" && "bg-[#FFFBEB] border-[#FDE68A] text-[#D97706]",
                        booking.status === "checked_in" && "bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]",
                        booking.status === "checked_out" && "bg-[#F7F7FC] border-[#E8E7F2] text-[#77758F]",
                        booking.status === "cancelled" && "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]"
                      )}
                    >
                      {booking.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-[#F7F7FC] rounded-xl p-3 border border-[#E8E7F2]">
                    <div>
                      <div className="text-[9px] text-[#77758F] font-bold uppercase tracking-wider mb-1">Stay Dates</div>
                      <div className="text-xs font-medium text-[#24213A] leading-relaxed">
                        {formatISTCompactDate(booking.check_in)}
                        <span className="text-[#77758F] mx-1">→</span>
                        {formatISTCompactDate(booking.check_out)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] text-[#77758F] font-bold uppercase tracking-wider mb-1">Total Amount</div>
                      <div className="text-sm font-bold text-[#5146D8]">₹{booking.total_amount.toLocaleString("en-IN")}</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedBooking(booking)}
                      className="flex-1 py-2.5 bg-[#FFFFFF] hover:bg-[#F7F7FC] border border-[#E8E7F2] rounded-xl text-xs font-bold text-[#24213A] active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => handleCreateOrViewBill(booking)}
                      className="px-4 py-2.5 bg-[#F0EEFF] hover:bg-[#E0DEF8] border border-[#E0DEF8] rounded-xl text-xs font-bold text-[#5146D8] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Bill</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View (Table) */}
        <div className="hidden md:block w-full overflow-x-auto hide-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-[#E8E7F2] bg-[#F7F7FC]/70 text-[10px] uppercase tracking-widest text-[#77758F]">
                <th className="px-6 py-4 font-semibold">Booking ID</th>
                <th className="px-6 py-4 font-semibold">Primary Guest</th>
                <th className="px-6 py-4 font-semibold">Room</th>
                <th className="px-6 py-4 font-semibold">Stay Dates</th>
                <th className="px-6 py-4 font-semibold">Amount</th>
                <th className="px-6 py-4 font-semibold">Booked By</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-[#77758F]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 text-[#5146D8] animate-spin" />
                      <span>Loading bookings from Supabase...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-[#77758F]">
                    No bookings match your current criteria.
                  </td>
                </tr>
              ) : (
                filteredBookings.map((booking, idx) => {
                  const primaryGuest =
                    booking.guests?.find((g) => g.is_primary) || booking.guests?.[0];
                  const isActionBusy = actionLoading === booking.id;

                  return (
                    <tr
                      key={booking.id}
                      className={`group transition-colors hover:bg-[#F7F7FC] ${
                        idx !== filteredBookings.length - 1
                          ? "border-b border-[#E8E7F2]"
                          : ""
                      }`}
                    >
                      <td className="px-6 py-4 font-mono text-xs text-[#77758F]">
                        {booking.id.slice(0, 8)}...
                      </td>

                      <td className="px-6 py-4">
                        <div className="font-medium text-[#24213A]">
                          {primaryGuest?.name || "Guest"}
                          {booking.guests && booking.guests.length > 1 && (
                            <span className="text-[#77758F] text-xs ml-1 font-normal">
                              +{booking.guests.length - 1}
                            </span>
                          )}
                        </div>
                        {primaryGuest?.phone && (
                          <div className="text-[11px] text-[#77758F] mt-0.5 flex items-center gap-1">
                            <Phone className="w-2.5 h-2.5" />
                            <span>{primaryGuest.phone}</span>
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <BedDouble className="w-4 h-4 text-[#77758F]" />
                          <span className="font-medium text-[#24213A]">
                            {booking.rooms?.name || `Room ${booking.room_id}`}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-[#77758F]" />
                          <div className="flex flex-col text-[#77758F] text-xs">
                            <span className="text-[#24213A] font-medium">
                              {formatISTCompactDate(booking.check_in)} • 12:00 PM
                            </span>
                            <span>
                              {formatISTCompactDate(booking.check_out)} • 11:00 AM
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 font-semibold text-[#24213A]">
                          <IndianRupee className="w-3.5 h-3.5 text-[#77758F]" />
                          {booking.total_amount.toLocaleString("en-IN")}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-[#77758F] text-xs">
                        {booking.partners?.name || "Partner"}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-widest uppercase border",
                            booking.status === "confirmed" &&
                              "bg-[#FFFBEB] border-[#FDE68A] text-[#D97706]",
                            booking.status === "checked_in" &&
                              "bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]",
                            booking.status === "checked_out" &&
                              "bg-[#F7F7FC] border-[#E8E7F2] text-[#77758F]",
                            booking.status === "cancelled" &&
                              "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]"
                          )}
                        >
                          {booking.status.replace("_", " ")}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleCreateOrViewBill(booking)}
                            title="Create Bill / Manage Folio"
                            className="p-1.5 rounded-lg bg-[#F0EEFF] hover:bg-[#E0DEF8] border border-[#E0DEF8] text-[#5146D8] transition-colors cursor-pointer"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setSelectedBooking(booking)}
                            title="View Full Details"
                            className="p-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#F7F7FC] border border-[#E8E7F2] text-[#77758F] hover:text-[#24213A] transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {booking.status === "confirmed" && (
                            <button
                              onClick={() => handleStatusChange(booking.id, "checked_in")}
                              disabled={isActionBusy}
                              title="Check In Guest"
                              className="p-1.5 rounded-lg bg-[#ECFDF5] hover:bg-[#D1FAE5] border border-[#A7F3D0] text-[#059669] transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {booking.status === "checked_in" && (
                            <button
                              onClick={() => handleStatusChange(booking.id, "checked_out")}
                              disabled={isActionBusy}
                              title="Check Out Guest"
                              className="p-1.5 rounded-lg bg-[#FFFBEB] hover:bg-[#FEF3C7] border border-[#FDE68A] text-[#D97706] transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {booking.status !== "cancelled" && booking.status !== "checked_out" && (
                            <button
                              onClick={() => handleCancel(booking.id)}
                              disabled={isActionBusy}
                              title="Cancel Booking"
                              className="p-1.5 rounded-lg bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] text-[#DC2626] transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Booking Details Modal */}
      {selectedBooking && (
        <GlassModal
          isOpen={!!selectedBooking}
          onClose={() => setSelectedBooking(null)}
          title={`Booking Details: ${selectedBooking.rooms?.name || "Room"}`}
          footer={
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
              <div className="flex flex-wrap items-center gap-2">
                <GlassButton
                  variant="primary"
                  onClick={() => handleCreateOrViewBill(selectedBooking)}
                  className="px-4 text-xs bg-[#5146D8] hover:bg-[#4338CA] text-white flex items-center gap-1.5"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Create / View Bill</span>
                </GlassButton>
                {selectedBooking.status === "confirmed" && (
                  <GlassButton
                    variant="primary"
                    onClick={() => handleStatusChange(selectedBooking.id, "checked_in")}
                    className="px-4 text-xs bg-[#ECFDF5] hover:bg-[#D1FAE5] border border-[#A7F3D0] text-[#059669]"
                  >
                    Check In
                  </GlassButton>
                )}
                {selectedBooking.status === "checked_in" && (
                  <GlassButton
                    variant="primary"
                    onClick={() => handleStatusChange(selectedBooking.id, "checked_out")}
                    className="px-4 text-xs bg-[#FFFBEB] hover:bg-[#FEF3C7] border border-[#FDE68A] text-[#D97706]"
                  >
                    Check Out
                  </GlassButton>
                )}
                {selectedBooking.status !== "cancelled" && selectedBooking.status !== "checked_out" && (
                  <GlassButton
                    variant="ghost"
                    onClick={() => handleCancel(selectedBooking.id)}
                    className="px-3 text-xs text-[#DC2626] hover:bg-[#FEF2F2]"
                  >
                    Cancel Booking
                  </GlassButton>
                )}
              </div>
              <GlassButton
                variant="ghost"
                onClick={() => setSelectedBooking(null)}
                className="px-6 text-xs text-[#24213A] hover:bg-[#F0EEFF]"
              >
                Close
              </GlassButton>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Status & ID */}
            <div className="flex justify-between items-center p-3 rounded-xl bg-[#F7F7FC] border border-[#E8E7F2]">
              <div>
                <p className="text-[10px] text-[#77758F] tracking-wider uppercase">Booking ID</p>
                <p className="text-xs font-mono text-[#24213A]">{selectedBooking.id}</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full uppercase border bg-[#FFFFFF] border-[#E8E7F2] text-[#24213A]">
                {selectedBooking.status.replace("_", " ")}
              </span>
            </div>

            {/* Stay Dates */}
            <div className="space-y-3">
              <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl flex justify-between items-center shadow-sm">
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#77758F] tracking-wider uppercase">Booked On</span>
                  <span className="font-medium text-[#24213A] mt-0.5">
                    {selectedBooking.created_at ? formatISTDateTime(selectedBooking.created_at) : 'Unknown'}
                  </span>
                </div>
              </div>

              <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl flex justify-between items-center shadow-sm">
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#77758F] tracking-wider uppercase">Check-in</span>
                  <span className="font-medium text-[#24213A] mt-0.5">{formatISTCompactDate(selectedBooking.check_in)}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-[#77758F] tracking-wider uppercase">Time</span>
                  <span className="font-medium text-[#24213A] mt-0.5">12:00 PM</span>
                </div>
              </div>

              <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl flex justify-between items-center shadow-sm">
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#77758F] tracking-wider uppercase">Check-out</span>
                  <span className="font-medium text-[#24213A] mt-0.5">{formatISTCompactDate(selectedBooking.check_out)}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-[#77758F] tracking-wider uppercase">Time</span>
                  <span className="font-medium text-[#24213A] mt-0.5">11:00 AM</span>
                </div>
              </div>
            </div>

            {/* Financial Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl shadow-sm">
                <p className="text-[10px] text-[#77758F] tracking-wider uppercase">Nightly Rate</p>
                <p className="text-sm font-medium text-[#24213A]">
                  ₹{selectedBooking.nightly_rate.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl shadow-sm">
                <p className="text-[10px] text-[#77758F] tracking-wider uppercase">Total Amount</p>
                <p className="text-sm font-medium text-[#5146D8]">
                  ₹{selectedBooking.total_amount.toLocaleString("en-IN")}
                </p>
              </div>
            </div>

            {/* Guest List */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold tracking-widest text-[#77758F] uppercase">
                Guests ({selectedBooking.guests?.length || 0})
              </p>
              <div className="space-y-1.5">
                {selectedBooking.guests?.map((guest, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-[#FFFFFF] border border-[#E8E7F2] flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-[#77758F]" />
                      <span className="font-medium text-[#24213A]">{guest.name}</span>
                      {guest.is_primary && (
                        <span className="text-[9px] text-[#5146D8] uppercase tracking-wider font-semibold bg-[#F0EEFF] border border-[#E0DEF8] px-1.5 py-0.5 rounded">
                          Primary
                        </span>
                      )}
                    </div>
                    {guest.phone && (
                      <span className="text-[#77758F] text-[11px]">{guest.phone}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Partner & Notes */}
            <div className="space-y-3">
              <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl shadow-sm">
                <p className="text-[10px] text-[#77758F] tracking-wider uppercase">Booked By</p>
                <p className="text-xs font-medium text-[#24213A] mt-0.5 break-words">
                  {selectedBooking.partners?.name || "Partner"} {selectedBooking.partners?.email && <span className="text-[#77758F]">({selectedBooking.partners.email})</span>}
                </p>
              </div>

              {selectedBooking.notes && (
                <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl shadow-sm">
                  <p className="text-[10px] text-[#77758F] tracking-wider uppercase">Notes</p>
                  <p className="text-xs text-[#24213A] mt-0.5">{selectedBooking.notes}</p>
                </div>
              )}
            </div>
          </div>
        </GlassModal>
      )}

      {/* Invoice Editor Modal */}
      {isBillingModalOpen && (
        <InvoiceEditorModal
          isOpen={isBillingModalOpen}
          onClose={() => setIsBillingModalOpen(false)}
          booking={billingBooking}
          existingInvoice={billingInvoice}
          onSaved={(_id, updatedInv, shouldClose = true) => {
            if (shouldClose) {
              setIsBillingModalOpen(false);
            }
            if (updatedInv) {
              setBillingInvoice(updatedInv);
            }
            fetchBookings();
          }}
        />
      )}
    </div>
  );
}
