"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import {
  Calendar,
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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BookingStatus, DbBooking } from "@/lib/types";
import { updateBookingStatusAction, cancelBookingAction } from "@/app/actions/bookings";
import { GlassModal } from "@/components/ui/GlassModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { cn } from "@/lib/utils";
import { formatISTDateTime, formatISTCompactDate, combineDateAndTime } from "@/lib/dateUtils";

export default function BookingsPage() {
  const [bookings, setBookings] = useState<DbBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [selectedBooking, setSelectedBooking] = useState<DbBooking | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchBookings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id,
          room_id,
          partner_id,
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
        `)
        .order("created_at", { ascending: false });

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
  }, [supabase]);

  useEffect(() => {
    fetchBookings();

    const channel = supabase
      .channel("bookings-page-sync")
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
  }, [supabase, fetchBookings]);

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

  // Filtered bookings
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // Status filter
      if (statusFilter !== "all" && b.status !== statusFilter) {
        return false;
      }

      // Room filter
      if (roomFilter !== "all") {
        const rNum = b.rooms?.room_number;
        if (rNum !== roomFilter && b.room_id !== roomFilter) return false;
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
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 md:text-[#F5F1E8]">Booking Management</h2>
          <p className="text-gray-500 md:text-[#96928A] mt-1 text-xs md:text-sm tracking-wide">
            View, search, and manage all reservations.
          </p>
        </div>

        {/* Stats Pills */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] md:text-xs">
          <span className="px-3 py-1.5 rounded-full bg-gray-100 md:bg-[rgba(255,255,255,0.03)] border border-gray-200 md:border-[rgba(255,255,255,0.08)] text-gray-600 md:text-[#C7C3BA] font-medium">
            Total: <strong className="text-gray-900 md:text-white">{bookings.length}</strong>
          </span>
          <span className="px-3 py-1.5 rounded-full bg-emerald-50 md:bg-[rgba(79,231,123,0.1)] border border-emerald-100 md:border-[rgba(79,231,123,0.2)] text-emerald-600 md:text-[#4FE77B] font-medium">
            Confirmed:{" "}
            <strong>{bookings.filter((b) => b.status === "confirmed").length}</strong>
          </span>
          <span className="px-3 py-1.5 rounded-full bg-amber-50 md:bg-[rgba(245,158,11,0.1)] border border-amber-100 md:border-[rgba(245,158,11,0.2)] text-amber-600 md:text-[#F59E0B] font-medium">
            Checked In:{" "}
            <strong>{bookings.filter((b) => b.status === "checked_in").length}</strong>
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <GlassPanel className="p-3 md:p-4 rounded-[20px] md:rounded-2xl bg-white md:glass-panel-secondary border border-gray-100 md:border-[rgba(255,255,255,0.05)] shadow-[0_2px_10px_rgba(0,0,0,0.03)] md:shadow-none flex flex-wrap items-center gap-2.5 md:gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-gray-400 md:text-[#96928A] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search bookings..."
            className="w-full bg-gray-50 md:bg-[rgba(0,0,0,0.2)] border border-gray-200 md:border-[rgba(255,255,255,0.08)] rounded-xl pl-9 pr-4 py-2 md:py-2.5 text-xs font-medium text-gray-900 md:text-[#F5F1E8] placeholder-gray-400 md:placeholder-[#96928A] outline-none focus:border-gray-300 md:focus:border-[rgba(255,255,255,0.2)] transition-colors"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1 bg-gray-50 md:bg-[rgba(0,0,0,0.2)] border border-gray-200 md:border-[rgba(255,255,255,0.08)] rounded-xl px-2 py-1.5 md:py-1">
          <Filter className="w-3.5 h-3.5 text-gray-400 md:text-[#96928A] ml-1" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent text-[11px] md:text-xs font-medium text-gray-700 md:text-[#F5F1E8] outline-none cursor-pointer py-0.5 pr-1 md:pr-2"
          >
            <option value="all">All Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="checked_in">Checked In</option>
            <option value="checked_out">Checked Out</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Room Filter */}
        <div className="flex items-center gap-1 bg-gray-50 md:bg-[rgba(0,0,0,0.2)] border border-gray-200 md:border-[rgba(255,255,255,0.08)] rounded-xl px-2 py-1.5 md:py-1">
          <BedDouble className="w-3.5 h-3.5 text-gray-400 md:text-[#96928A] ml-1" />
          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="bg-transparent text-[11px] md:text-xs font-medium text-gray-700 md:text-[#F5F1E8] outline-none cursor-pointer py-0.5 pr-1 md:pr-2"
          >
            <option value="all">All Rooms</option>
            <option value="1">Room 1</option>
            <option value="2">Room 2</option>
            <option value="3">Room 3</option>
            <option value="4">Room 4</option>
          </select>
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-1.5 bg-gray-50 md:bg-[rgba(0,0,0,0.2)] border border-gray-200 md:border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-1.5 md:py-1">
          <CalendarIcon className="w-3.5 h-3.5 text-gray-400 md:text-[#96928A]" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-transparent text-[11px] md:text-xs font-medium text-gray-700 md:text-[#F5F1E8] outline-none cursor-pointer py-0.5"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter("")}
              className="text-[10px] text-gray-400 hover:text-gray-600 md:text-[#96928A] md:hover:text-white ml-1 font-bold"
            >
              Clear
            </button>
          )}
        </div>
      </GlassPanel>

      {/* Bookings Display */}
      <GlassPanel className="p-0 md:p-1 rounded-[24px] bg-transparent border-transparent md:bg-[rgba(255,255,255,0.02)] md:border-[rgba(255,255,255,0.05)] shadow-none md:shadow-lg overflow-hidden">
        
        {/* Mobile View (Cards) */}
        <div className="md:hidden flex flex-col gap-3 pb-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Loader2 className="w-6 h-6 text-[#F59E0B] animate-spin" />
              <span className="text-gray-500 text-xs">Loading bookings...</span>
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="bg-white border border-gray-100 shadow-sm rounded-[20px] p-8 flex flex-col items-center justify-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-1">
                <Search className="w-5 h-5 text-gray-400" />
              </div>
              <div className="text-gray-700 font-bold text-sm">No bookings found</div>
              <div className="text-xs text-gray-400 font-medium">Try adjusting your filters or search criteria.</div>
            </div>
          ) : (
            filteredBookings.map((booking) => {
              const primaryGuest = booking.guests?.find((g) => g.is_primary) || booking.guests?.[0];
              return (
                <div key={booking.id} className="bg-white border border-gray-100 shadow-sm rounded-[20px] p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-700 text-xs shrink-0">
                        {primaryGuest?.name?.substring(0, 1) || "G"}
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-sm truncate max-w-[140px]">
                          {primaryGuest?.name || "Guest"}
                        </h4>
                        <div className="text-[10px] text-gray-500 font-medium">
                          {booking.rooms?.name || `Room ${booking.room_id}`}
                        </div>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold tracking-widest uppercase border",
                        booking.status === "confirmed" && "bg-amber-50 border-amber-200 text-amber-600",
                        booking.status === "checked_in" && "bg-emerald-50 border-emerald-200 text-emerald-600",
                        booking.status === "checked_out" && "bg-gray-50 border-gray-200 text-gray-500",
                        booking.status === "cancelled" && "bg-rose-50 border-rose-200 text-rose-600"
                      )}
                    >
                      {booking.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-xl p-2.5 mt-1 border border-gray-100">
                    <div>
                      <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Stay Dates</div>
                      <div className="text-[11px] font-medium text-gray-700">
                        {formatISTCompactDate(booking.check_in)} • 12:00 PM
                        <br />
                        {formatISTCompactDate(booking.check_out)} • 11:00 AM
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Amount</div>
                      <div className="text-sm font-bold text-gray-900">₹{booking.total_amount.toLocaleString("en-IN")}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedBooking(booking)}
                    className="w-full py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 active:scale-[0.98] transition-transform"
                  >
                    VIEW DETAILS
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View (Table) */}
        <div className="hidden md:block w-full overflow-x-auto hide-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.05)] text-[10px] uppercase tracking-widest text-[#96928A]">
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
                  <td colSpan={8} className="px-6 py-16 text-center text-[#96928A]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 text-[#F59E0B] animate-spin" />
                      <span>Loading bookings from Supabase...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-[#96928A]">
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
                      className={`group transition-colors hover:bg-[rgba(255,255,255,0.02)] ${
                        idx !== filteredBookings.length - 1
                          ? "border-b border-[rgba(255,255,255,0.03)]"
                          : ""
                      }`}
                    >
                      <td className="px-6 py-4 font-mono text-xs text-[#96928A]">
                        {booking.id.slice(0, 8)}...
                      </td>

                      <td className="px-6 py-4">
                        <div className="font-medium text-[#F5F1E8]">
                          {primaryGuest?.name || "Guest"}
                          {booking.guests && booking.guests.length > 1 && (
                            <span className="text-[#96928A] text-xs ml-1">
                              +{booking.guests.length - 1}
                            </span>
                          )}
                        </div>
                        {primaryGuest?.phone && (
                          <div className="text-[11px] text-[#96928A] mt-0.5 flex items-center gap-1">
                            <Phone className="w-2.5 h-2.5" />
                            <span>{primaryGuest.phone}</span>
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <BedDouble className="w-4 h-4 text-[#96928A]" />
                          <span className="font-medium text-[#F2EEE3]">
                            {booking.rooms?.name || `Room ${booking.room_id}`}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-[#96928A]" />
                          <div className="flex flex-col text-[#C7C3BA] text-xs">
                            <span>
                              {formatISTCompactDate(booking.check_in)} • 12:00 PM
                            </span>
                            <span>
                              {formatISTCompactDate(booking.check_out)} • 11:00 AM
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 font-medium text-[#F5F1E8]">
                          <IndianRupee className="w-3.5 h-3.5 text-[#96928A]" />
                          {booking.total_amount.toLocaleString("en-IN")}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-[#C7C3BA] text-xs">
                        {booking.partners?.name || "Partner"}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-widest uppercase border",
                            booking.status === "confirmed" &&
                              "bg-[rgba(245,158,11,0.15)] border-[rgba(245,158,11,0.3)] text-[#F59E0B]",
                            booking.status === "checked_in" &&
                              "bg-[rgba(79,231,123,0.15)] border-[rgba(79,231,123,0.3)] text-[#4FE77B]",
                            booking.status === "checked_out" &&
                              "bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)] text-[#96928A]",
                            booking.status === "cancelled" &&
                              "bg-[rgba(255,105,120,0.15)] border-[rgba(255,105,120,0.3)] text-[#FF6978]"
                          )}
                        >
                          {booking.status.replace("_", " ")}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedBooking(booking)}
                            title="View Full Details"
                            className="p-1.5 rounded-lg bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.05)] text-[#C7C3BA] hover:text-white transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {booking.status === "confirmed" && (
                            <button
                              onClick={() => handleStatusChange(booking.id, "checked_in")}
                              disabled={isActionBusy}
                              title="Check In Guest"
                              className="p-1.5 rounded-lg bg-[rgba(79,231,123,0.1)] hover:bg-[rgba(79,231,123,0.2)] border border-[rgba(79,231,123,0.25)] text-[#4FE77B] transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {booking.status === "checked_in" && (
                            <button
                              onClick={() => handleStatusChange(booking.id, "checked_out")}
                              disabled={isActionBusy}
                              title="Check Out Guest"
                              className="p-1.5 rounded-lg bg-[rgba(245,158,11,0.1)] hover:bg-[rgba(245,158,11,0.2)] border border-[rgba(245,158,11,0.25)] text-[#F59E0B] transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {booking.status !== "cancelled" && booking.status !== "checked_out" && (
                            <button
                              onClick={() => handleCancel(booking.id)}
                              disabled={isActionBusy}
                              title="Cancel Booking"
                              className="p-1.5 rounded-lg bg-[rgba(255,105,120,0.1)] hover:bg-[rgba(255,105,120,0.2)] border border-[rgba(255,105,120,0.25)] text-[#FF6978] transition-colors cursor-pointer disabled:opacity-50"
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
      </GlassPanel>

      {/* Booking Details Modal */}
      {selectedBooking && (
        <GlassModal
          isOpen={!!selectedBooking}
          onClose={() => setSelectedBooking(null)}
          title={`Booking Details: ${selectedBooking.rooms?.name || "Room"}`}
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {selectedBooking.status === "confirmed" && (
                  <GlassButton
                    variant="primary"
                    onClick={() => handleStatusChange(selectedBooking.id, "checked_in")}
                    className="px-4 text-xs bg-[rgba(79,231,123,0.15)] text-[#4FE77B]"
                  >
                    Check In
                  </GlassButton>
                )}
                {selectedBooking.status === "checked_in" && (
                  <GlassButton
                    variant="primary"
                    onClick={() => handleStatusChange(selectedBooking.id, "checked_out")}
                    className="px-4 text-xs bg-[rgba(245,158,11,0.15)] text-[#F59E0B]"
                  >
                    Check Out
                  </GlassButton>
                )}
                {selectedBooking.status !== "cancelled" && selectedBooking.status !== "checked_out" && (
                  <GlassButton
                    variant="ghost"
                    onClick={() => handleCancel(selectedBooking.id)}
                    className="px-3 text-xs text-[#FF6978]"
                  >
                    Cancel Booking
                  </GlassButton>
                )}
              </div>
              <GlassButton
                variant="ghost"
                onClick={() => setSelectedBooking(null)}
                className="px-6 text-xs"
              >
                Close
              </GlassButton>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Status & ID */}
            <div className="flex justify-between items-center p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
              <div>
                <p className="text-[10px] text-[#96928A] tracking-wider uppercase">Booking ID</p>
                <p className="text-xs font-mono text-[#F5F1E8]">{selectedBooking.id}</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full uppercase border bg-[rgba(255,255,255,0.05)] text-[#F5F1E8]">
                {selectedBooking.status.replace("_", " ")}
              </span>
            </div>

            {/* Stay Dates */}
            <div className="col-span-1 md:col-span-2 space-y-3">
              <div className="glass-panel-secondary p-3 rounded-xl flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#96928A] tracking-wider uppercase">Booked On</span>
                  <span className="font-medium text-[#F5F1E8] mt-0.5">
                    {selectedBooking.created_at ? formatISTDateTime(selectedBooking.created_at) : 'Unknown'}
                  </span>
                </div>
              </div>

              <div className="glass-panel-secondary p-3 rounded-xl flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#96928A] tracking-wider uppercase">Check-in</span>
                  <span className="font-medium text-[#F5F1E8] mt-0.5">{formatISTCompactDate(selectedBooking.check_in)}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-[#96928A] tracking-wider uppercase">Time</span>
                  <span className="font-medium text-[#F5F1E8] mt-0.5">12:00 PM</span>
                </div>
              </div>

              <div className="glass-panel-secondary p-3 rounded-xl flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#96928A] tracking-wider uppercase">Check-out</span>
                  <span className="font-medium text-[#F5F1E8] mt-0.5">{formatISTCompactDate(selectedBooking.check_out)}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-[#96928A] tracking-wider uppercase">Time</span>
                  <span className="font-medium text-[#F5F1E8] mt-0.5">11:00 AM</span>
                </div>
              </div>
            </div>

            {/* Financial Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-panel-secondary p-3 rounded-xl">
                <p className="text-[10px] text-[#96928A] tracking-wider uppercase">Nightly Rate</p>
                <p className="text-sm font-medium text-[#F5F1E8]">
                  ₹{selectedBooking.nightly_rate.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="glass-panel-secondary p-3 rounded-xl">
                <p className="text-[10px] text-[#96928A] tracking-wider uppercase">Total Amount</p>
                <p className="text-sm font-medium text-[#F59E0B]">
                  ₹{selectedBooking.total_amount.toLocaleString("en-IN")}
                </p>
              </div>
            </div>

            {/* Guest List */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold tracking-widest text-[#96928A] uppercase">
                Guests ({selectedBooking.guests?.length || 0})
              </p>
              <div className="space-y-1.5">
                {selectedBooking.guests?.map((guest, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-[#96928A]" />
                      <span className="font-medium text-[#F5F1E8]">{guest.name}</span>
                      {guest.is_primary && (
                        <span className="text-[9px] text-[#F59E0B] uppercase tracking-wider font-semibold">
                          Primary
                        </span>
                      )}
                    </div>
                    {guest.phone && (
                      <span className="text-[#96928A] text-[11px]">{guest.phone}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Partner & Notes */}
            <div className="space-y-3">
              <div className="glass-panel-secondary p-3 rounded-xl">
                <p className="text-[10px] text-[#96928A] tracking-wider uppercase">Booked By</p>
                <p className="text-xs font-medium text-[#F5F1E8] mt-0.5">
                  {selectedBooking.partners?.name || "Partner"} ({selectedBooking.partners?.email})
                </p>
              </div>

              {selectedBooking.notes && (
                <div className="glass-panel-secondary p-3 rounded-xl">
                  <p className="text-[10px] text-[#96928A] tracking-wider uppercase">Notes</p>
                  <p className="text-xs text-[#C7C3BA] mt-0.5">{selectedBooking.notes}</p>
                </div>
              )}
            </div>
          </div>
        </GlassModal>
      )}
    </div>
  );
}
