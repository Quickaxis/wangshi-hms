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
  Plus,
  Layers,
  ArrowRight
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BookingStatus, DbBooking, DbInvoice, DbGuest } from "@/lib/types";
import {
  updateBookingStatusAction,
  cancelBookingAction,
  cancelGroupBookingAction,
  updateGroupBookingStatusAction
} from "@/app/actions/bookings";
import { getInvoiceByBookingIdAction, getOrCreateBookingFolioAction } from "@/app/actions/invoices";
import { GlassModal } from "@/components/ui/GlassModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { InvoiceEditorModal } from "@/components/modals/InvoiceEditorModal";
import { BookingModal } from "@/components/modals/BookingModal";
import { useHMSContext } from "@/components/providers/HMSProvider";
import { cn } from "@/lib/utils";
import { formatISTDateTime, formatISTCompactDate } from "@/lib/dateUtils";

export interface GroupedBookingRoom {
  bookingId: string;
  roomId: string;
  roomName: string;
  roomNumber: string;
  nightlyRate: number;
  totalAmount: number;
  status: BookingStatus;
  guests: DbGuest[];
}

export interface GroupedBookingItem {
  id: string; // group_id || booking.id
  isGroup: boolean;
  groupId: string | null;
  leadBooking: DbBooking;
  rooms: GroupedBookingRoom[];
  primaryGuest?: {
    name: string;
    phone?: string | null;
    email?: string | null;
  };
  totalGuests: number;
  roomNamesString: string;
  checkIn: string;
  checkOut: string;
  totalAmount: number;
  overallStatus: BookingStatus | "mixed";
  activeRoomsCount: number;
  totalRoomsCount: number;
  partnerName: string;
  createdAt: string;
  notes?: string;
  allBookings: DbBooking[];
}

export default function BookingsPage() {
  const { selectedHomestayId, createBooking } = useHMSContext();
  const [bookings, setBookings] = useState<DbBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [selectedGroup, setSelectedGroup] = useState<GroupedBookingItem | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // New Booking Modal State
  const [isNewBookingModalOpen, setIsNewBookingModalOpen] = useState(false);

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
          group_id,
          is_group_lead,
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

  // Aggregate bookings by group_id
  const groupedBookings = useMemo<GroupedBookingItem[]>(() => {
    const map = new Map<string, DbBooking[]>();

    bookings.forEach((b) => {
      const key = b.group_id || b.id;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(b);
    });

    const list: GroupedBookingItem[] = [];

    map.forEach((groupList, key) => {
      const lead = groupList.find((b) => b.is_group_lead) || groupList[0];
      const isGroup = groupList.length > 1 || !!lead.group_id;

      // Extract primary guest across group
      let primaryGuest: any = undefined;
      for (const b of groupList) {
        const pg = b.guests?.find((g) => g.is_primary);
        if (pg) {
          primaryGuest = pg;
          break;
        }
      }
      if (!primaryGuest && lead.guests && lead.guests.length > 0) {
        primaryGuest = lead.guests[0];
      }

      const totalGuests = groupList.reduce(
        (sum, b) => sum + (b.guests?.length || b.number_of_guests || 1),
        0
      );

      const rooms: GroupedBookingRoom[] = groupList.map((b) => ({
        bookingId: b.id,
        roomId: b.room_id,
        roomName: b.rooms?.name || `Room ${b.rooms?.room_number || b.room_id}`,
        roomNumber: b.rooms?.room_number ? String(b.rooms.room_number) : "",
        nightlyRate: b.nightly_rate,
        totalAmount: b.total_amount,
        status: b.status,
        guests: b.guests || [],
      }));

      const roomNamesString = Array.from(new Set(rooms.map((r) => r.roomName))).join(", ");
      const totalAmount = groupList.reduce((sum, b) => sum + (b.total_amount || 0), 0);

      const statuses = groupList.map((b) => b.status);
      const activeRooms = groupList.filter((b) => b.status !== "cancelled");
      let overallStatus: BookingStatus | "mixed" = lead.status;

      if (statuses.every((s) => s === "cancelled")) {
        overallStatus = "cancelled";
      } else if (statuses.every((s) => s === "checked_out")) {
        overallStatus = "checked_out";
      } else if (statuses.every((s) => s === "checked_in")) {
        overallStatus = "checked_in";
      } else if (statuses.every((s) => s === "confirmed")) {
        overallStatus = "confirmed";
      } else {
        overallStatus = "mixed";
      }

      list.push({
        id: key,
        isGroup,
        groupId: lead.group_id || null,
        leadBooking: lead,
        rooms,
        primaryGuest,
        totalGuests,
        roomNamesString,
        checkIn: lead.check_in,
        checkOut: lead.check_out,
        totalAmount,
        overallStatus,
        activeRoomsCount: activeRooms.length,
        totalRoomsCount: groupList.length,
        partnerName: lead.partners?.name || "Partner",
        createdAt: lead.created_at,
        notes: lead.notes || undefined,
        allBookings: groupList,
      });
    });

    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [bookings]);

  // Keep selectedGroup state in sync when bookings refresh
  useEffect(() => {
    if (selectedGroup) {
      const refreshed = groupedBookings.find((g) => g.id === selectedGroup.id);
      if (refreshed) {
        setSelectedGroup(refreshed);
      }
    }
  }, [groupedBookings, selectedGroup]);

  // Status handlers
  const handleSingleRoomStatusChange = async (bookingId: string, newStatus: BookingStatus) => {
    setActionLoading(bookingId);
    try {
      const result = await updateBookingStatusAction(bookingId, newStatus);
      if (result.success) {
        await fetchBookings();
      } else {
        alert(result.error || "Failed to update room status");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelSingleRoom = async (bookingId: string, roomName: string) => {
    if (!window.confirm(`Are you sure you want to cancel the reservation for ${roomName}?`)) return;
    setActionLoading(bookingId);
    try {
      const result = await cancelBookingAction(bookingId);
      if (result.success) {
        await fetchBookings();
      } else {
        alert(result.error || "Failed to cancel reservation");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleGroupStatusChange = async (groupId: string, targetStatus: BookingStatus) => {
    setActionLoading(groupId);
    try {
      const result = await updateGroupBookingStatusAction(groupId, targetStatus);
      if (result.success) {
        await fetchBookings();
      } else {
        alert(result.error || "Failed to update group status");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelEntireGroup = async (groupId: string) => {
    if (!window.confirm("Are you sure you want to cancel ALL active rooms in this group booking?")) return;
    setActionLoading(groupId);
    try {
      const result = await cancelGroupBookingAction(groupId);
      if (result.success) {
        await fetchBookings();
      } else {
        alert(result.error || "Failed to cancel group booking");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateOrViewBill = async (leadBooking: DbBooking) => {
    setActionLoading(leadBooking.id);
    try {
      const res = await getOrCreateBookingFolioAction(leadBooking.id);
      if (res.success && res.invoice) {
        setBillingInvoice(res.invoice);
        setBillingBooking(leadBooking);
      } else {
        setBillingInvoice(null);
        setBillingBooking(leadBooking);
      }
      setIsBillingModalOpen(true);
    } catch (e) {
      console.error("Error loading folio for booking:", e);
      setBillingInvoice(null);
      setBillingBooking(leadBooking);
      setIsBillingModalOpen(true);
    } finally {
      setActionLoading(null);
    }
  };

  // Dynamic room filter options
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

  // Filtered grouped bookings
  const filteredGroupedBookings = useMemo(() => {
    return groupedBookings.filter((group) => {
      // Status filter
      if (statusFilter !== "all") {
        const matchesStatus =
          group.overallStatus === statusFilter ||
          group.rooms.some((r) => r.status === statusFilter);
        if (!matchesStatus) return false;
      }

      // Room filter
      if (roomFilter !== "all") {
        const matchesRoom = group.rooms.some(
          (r) => r.roomId === roomFilter || r.roomNumber === roomFilter
        );
        if (!matchesRoom) return false;
      }

      // Date filter
      if (dateFilter) {
        if (group.checkIn !== dateFilter && group.checkOut !== dateFilter) {
          if (!(dateFilter >= group.checkIn && dateFilter < group.checkOut)) {
            return false;
          }
        }
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const idMatch =
          group.id.toLowerCase().includes(q) ||
          group.rooms.some((r) => r.bookingId.toLowerCase().includes(q));
        const roomNameMatch = group.roomNamesString.toLowerCase().includes(q);
        const partnerNameMatch = group.partnerName.toLowerCase().includes(q);
        const guestMatch =
          (group.primaryGuest?.name && group.primaryGuest.name.toLowerCase().includes(q)) ||
          (group.primaryGuest?.phone && group.primaryGuest.phone.includes(q)) ||
          group.rooms.some((r) =>
            r.guests.some((g) => g.name.toLowerCase().includes(q) || (g.phone && g.phone.includes(q)))
          );

        if (!idMatch && !roomNameMatch && !partnerNameMatch && !guestMatch) {
          return false;
        }
      }

      return true;
    });
  }, [groupedBookings, statusFilter, roomFilter, dateFilter, searchQuery]);

  return (
    <div className="flex flex-col w-full space-y-6 pb-12 min-w-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-[#24213A]">Booking Management</h2>
          <p className="text-[#77758F] mt-1 text-xs md:text-sm tracking-wide">
            View, search, and manage individual and group reservations with consolidated billing.
          </p>
        </div>

        {/* Action Controls & Stats */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] md:text-xs">
          <button
            onClick={() => setIsNewBookingModalOpen(true)}
            className="px-4 py-2 rounded-full bg-[#5146D8] hover:bg-[#4338CA] text-white font-semibold flex items-center gap-1.5 shadow-md shadow-[#5146D8]/20 transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New / Group Booking</span>
          </button>

          <Link
            href="/requests"
            className="px-3 py-2 rounded-full bg-[#F0EEFF] border border-[#E0DEF8] text-[#5146D8] hover:bg-[#E0DEF8] transition-colors font-medium flex items-center gap-1.5 shadow-sm"
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Website Requests</span>
          </Link>

          <span className="px-3 py-2 rounded-full bg-[#FFFFFF] border border-[#E8E7F2] text-[#77758F] font-medium shadow-sm">
            Total Bookings: <strong className="text-[#24213A]">{groupedBookings.length}</strong>
          </span>
          <span className="px-3 py-2 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#059669] font-medium shadow-sm">
            Confirmed:{" "}
            <strong>
              {groupedBookings.filter((g) => g.overallStatus === "confirmed").length}
            </strong>
          </span>
          <span className="px-3 py-2 rounded-full bg-[#FFFBEB] border border-[#FDE68A] text-[#D97706] font-medium shadow-sm">
            Checked In:{" "}
            <strong>
              {groupedBookings.filter((g) => g.overallStatus === "checked_in").length}
            </strong>
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
            placeholder="Search by guest name, room, phone, or group ID..."
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
              className="text-[10px] text-[#5146D8] hover:underline ml-1 font-bold cursor-pointer"
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
          ) : filteredGroupedBookings.length === 0 ? (
            <div className="bg-[#FFFFFF] border border-[#E8E7F2] rounded-[20px] p-8 flex flex-col items-center justify-center gap-2 text-center shadow-sm">
              <div className="w-12 h-12 rounded-full bg-[#F7F7FC] flex items-center justify-center mb-1">
                <Search className="w-5 h-5 text-[#77758F]" />
              </div>
              <div className="text-[#24213A] font-bold text-sm">No bookings found</div>
              <div className="text-xs text-[#77758F] font-medium">Try adjusting your filters or search criteria.</div>
            </div>
          ) : (
            filteredGroupedBookings.map((group) => {
              const isCancelled = group.overallStatus === "cancelled";
              return (
                <div
                  key={group.id}
                  className={cn(
                    "bg-[#FFFFFF] rounded-[20px] p-4 flex flex-col gap-3 transition-all shadow-[0_2px_8px_rgba(36,33,58,0.02)]",
                    isCancelled
                      ? "opacity-70 bg-[#FEF2F2]/30 border border-[#FECACA]"
                      : "border border-[#E8E7F2]"
                  )}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border",
                          group.isGroup
                            ? "bg-[#F0EEFF] border-[#E0DEF8] text-[#5146D8]"
                            : isCancelled
                            ? "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]"
                            : "bg-[#F7F7FC] border-[#E8E7F2] text-[#24213A]"
                        )}
                      >
                        {group.isGroup ? (
                          <Layers className="w-4 h-4" />
                        ) : (
                          group.primaryGuest?.name?.substring(0, 1).toUpperCase() || "G"
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4
                            className={cn(
                              "font-bold text-sm truncate",
                              isCancelled ? "text-[#77758F] line-through" : "text-[#24213A]"
                            )}
                          >
                            {group.primaryGuest?.name || "Guest"}
                          </h4>
                          {group.isGroup && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8]">
                              Group · {group.rooms.length} Rooms
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#77758F] font-medium mt-0.5 truncate">
                          {group.roomNamesString}
                        </div>
                      </div>
                    </div>

                    <span
                      className={cn(
                        "inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-bold tracking-widest uppercase border shrink-0",
                        group.overallStatus === "confirmed" && "bg-[#FFFBEB] border-[#FDE68A] text-[#D97706]",
                        group.overallStatus === "checked_in" && "bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]",
                        group.overallStatus === "checked_out" && "bg-[#F7F7FC] border-[#E8E7F2] text-[#77758F]",
                        group.overallStatus === "cancelled" && "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]",
                        group.overallStatus === "mixed" && "bg-[#F0EEFF] border-[#E0DEF8] text-[#5146D8]"
                      )}
                    >
                      {group.overallStatus === "mixed"
                        ? `${group.activeRoomsCount}/${group.totalRoomsCount} Active`
                        : group.overallStatus.replace("_", " ")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-[#F7F7FC] rounded-xl p-3 border border-[#E8E7F2]">
                    <div>
                      <div className="text-[9px] text-[#77758F] font-bold uppercase tracking-wider mb-1">Stay Dates</div>
                      <div className="text-xs font-medium text-[#24213A] leading-relaxed">
                        {formatISTCompactDate(group.checkIn)}
                        <span className="text-[#77758F] mx-1">→</span>
                        {formatISTCompactDate(group.checkOut)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] text-[#77758F] font-bold uppercase tracking-wider mb-1">
                        {group.isGroup ? "Combined Total" : "Total Amount"}
                      </div>
                      <div className="text-sm font-bold text-[#5146D8]">₹{group.totalAmount.toLocaleString("en-IN")}</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedGroup(group)}
                      className="flex-1 py-2.5 bg-[#FFFFFF] hover:bg-[#F7F7FC] border border-[#E8E7F2] rounded-xl text-xs font-bold text-[#24213A] active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => handleCreateOrViewBill(group.leadBooking)}
                      className="px-4 py-2.5 bg-[#F0EEFF] hover:bg-[#E0DEF8] border border-[#E0DEF8] rounded-xl text-xs font-bold text-[#5146D8] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>{group.isGroup ? "Group Folio" : "Folio"}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View (Table) */}
        <div className="hidden md:block w-full overflow-x-auto hms-editor-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-[#E8E7F2] bg-[#F7F7FC]/70 text-[10px] uppercase tracking-widest text-[#77758F]">
                <th className="px-6 py-4 font-semibold">Booking ID</th>
                <th className="px-6 py-4 font-semibold">Primary Guest</th>
                <th className="px-6 py-4 font-semibold">Rooms</th>
                <th className="px-6 py-4 font-semibold">Stay Dates</th>
                <th className="px-6 py-4 font-semibold">Amount</th>
                <th className="px-6 py-4 font-semibold">Booked By</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E7F2] text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-[#77758F]">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 text-[#5146D8] animate-spin" />
                      <span>Loading reservations...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredGroupedBookings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-[#77758F]">
                    No reservations match your current criteria.
                  </td>
                </tr>
              ) : (
                filteredGroupedBookings.map((group, idx) => {
                  const isActionBusy = actionLoading === group.id || actionLoading === group.leadBooking.id;

                  return (
                    <tr
                      key={group.id}
                      className={`group transition-colors hover:bg-[#F7F7FC] ${
                        idx !== filteredGroupedBookings.length - 1 ? "border-b border-[#E8E7F2]" : ""
                      }`}
                    >
                      <td className="px-6 py-4 font-mono text-xs text-[#77758F]">
                        {group.isGroup ? (
                          <div className="flex items-center gap-1.5 font-bold text-[#5146D8]">
                            <Layers className="w-3.5 h-3.5" />
                            <span>GRP-{group.id.slice(0, 6)}</span>
                          </div>
                        ) : (
                          <span>{group.id.slice(0, 8)}...</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="font-semibold text-[#24213A] flex items-center gap-1.5">
                          <span>{group.primaryGuest?.name || "Guest"}</span>
                          {group.totalGuests > 1 && (
                            <span className="text-[#77758F] text-[11px] font-normal">
                              ({group.totalGuests} guests)
                            </span>
                          )}
                        </div>
                        {group.primaryGuest?.phone && (
                          <div className="text-[11px] text-[#77758F] mt-0.5 flex items-center gap-1">
                            <Phone className="w-2.5 h-2.5" />
                            <span>{group.primaryGuest.phone}</span>
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <BedDouble className="w-4 h-4 text-[#77758F] shrink-0" />
                          <span className="font-medium text-[#24213A]">
                            {group.roomNamesString}
                          </span>
                          {group.isGroup && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8]">
                              {group.rooms.length} Rooms
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-[#77758F] shrink-0" />
                          <div className="flex flex-col text-[#77758F] text-xs">
                            <span className="text-[#24213A] font-medium">
                              {formatISTCompactDate(group.checkIn)}
                            </span>
                            <span>
                              {formatISTCompactDate(group.checkOut)}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 font-bold text-[#24213A]">
                          <IndianRupee className="w-3.5 h-3.5 text-[#5146D8]" />
                          <span>{group.totalAmount.toLocaleString("en-IN")}</span>
                        </div>
                        {group.isGroup && (
                          <div className="text-[10px] text-[#77758F] font-medium">
                            Combined Total
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4 text-[#77758F] text-xs">
                        {group.partnerName}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-widest uppercase border",
                            group.overallStatus === "confirmed" && "bg-[#FFFBEB] border-[#FDE68A] text-[#D97706]",
                            group.overallStatus === "checked_in" && "bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]",
                            group.overallStatus === "checked_out" && "bg-[#F7F7FC] border-[#E8E7F2] text-[#77758F]",
                            group.overallStatus === "cancelled" && "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]",
                            group.overallStatus === "mixed" && "bg-[#F0EEFF] border-[#E0DEF8] text-[#5146D8]"
                          )}
                        >
                          {group.overallStatus === "mixed"
                            ? `${group.activeRoomsCount}/${group.totalRoomsCount} Active`
                            : group.overallStatus.replace("_", " ")}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleCreateOrViewBill(group.leadBooking)}
                            title={group.isGroup ? "Consolidated Group Folio" : "Guest Folio"}
                            className="p-1.5 rounded-lg bg-[#F0EEFF] hover:bg-[#E0DEF8] border border-[#E0DEF8] text-[#5146D8] transition-colors cursor-pointer"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setSelectedGroup(group)}
                            title="View Group / Reservation Details"
                            className="p-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#F7F7FC] border border-[#E8E7F2] text-[#77758F] hover:text-[#24213A] transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
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

      {/* Group / Booking Details Modal */}
      {selectedGroup && (
        <GlassModal
          isOpen={!!selectedGroup}
          onClose={() => setSelectedGroup(null)}
          title={
            selectedGroup.isGroup
              ? `Group Booking Details (${selectedGroup.rooms.length} Rooms)`
              : `Reservation Details: ${selectedGroup.rooms[0]?.roomName || "Room"}`
          }
          className="sm:max-w-2xl max-h-[94dvh] sm:max-h-[90vh]"
          footer={
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
              <div className="flex flex-wrap items-center gap-2">
                <GlassButton
                  variant="primary"
                  onClick={() => handleCreateOrViewBill(selectedGroup.leadBooking)}
                  className="px-4 text-xs bg-[#5146D8] hover:bg-[#4338CA] text-white flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>{selectedGroup.isGroup ? "Consolidated Folio & Billing" : "Guest Folio & Billing"}</span>
                </GlassButton>

                {selectedGroup.isGroup && selectedGroup.rooms.some((r) => r.status === "confirmed") && (
                  <GlassButton
                    variant="primary"
                    onClick={() => handleGroupStatusChange(selectedGroup.id, "checked_in")}
                    className="px-3.5 text-xs bg-[#ECFDF5] hover:bg-[#D1FAE5] border border-[#A7F3D0] text-[#059669] cursor-pointer"
                  >
                    Check In All
                  </GlassButton>
                )}

                {selectedGroup.isGroup && selectedGroup.rooms.some((r) => r.status === "checked_in") && (
                  <GlassButton
                    variant="primary"
                    onClick={() => handleGroupStatusChange(selectedGroup.id, "checked_out")}
                    className="px-3.5 text-xs bg-[#FFFBEB] hover:bg-[#FEF3C7] border border-[#FDE68A] text-[#D97706] cursor-pointer"
                  >
                    Check Out All
                  </GlassButton>
                )}

                {selectedGroup.isGroup && selectedGroup.activeRoomsCount > 0 && (
                  <GlassButton
                    variant="ghost"
                    onClick={() => handleCancelEntireGroup(selectedGroup.id)}
                    className="px-3 text-xs text-[#DC2626] hover:bg-[#FEF2F2] cursor-pointer"
                  >
                    Cancel Entire Group
                  </GlassButton>
                )}
              </div>
              <GlassButton
                variant="ghost"
                onClick={() => setSelectedGroup(null)}
                className="px-6 text-xs text-[#24213A] hover:bg-[#F0EEFF] cursor-pointer"
              >
                Close
              </GlassButton>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Group Header Info */}
            <div className="flex justify-between items-center p-3 rounded-xl bg-[#F7F7FC] border border-[#E8E7F2]">
              <div>
                <p className="text-[10px] text-[#77758F] tracking-wider uppercase font-semibold">
                  {selectedGroup.isGroup ? "Group Booking ID" : "Reservation ID"}
                </p>
                <p className="text-xs font-mono font-bold text-[#24213A]">
                  {selectedGroup.isGroup ? `GRP-${selectedGroup.id.slice(0, 8)}` : selectedGroup.id}
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full uppercase border bg-[#FFFFFF] border-[#E8E7F2] text-[#24213A]">
                {selectedGroup.overallStatus === "mixed"
                  ? `${selectedGroup.activeRoomsCount}/${selectedGroup.totalRoomsCount} Rooms Active`
                  : selectedGroup.overallStatus.replace("_", " ")}
              </span>
            </div>

            {/* Stay Dates & Financial Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl shadow-sm">
                <span className="text-[10px] text-[#77758F] tracking-wider uppercase font-semibold">Stay Period</span>
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#24213A] mt-1">
                  <span>{formatISTCompactDate(selectedGroup.checkIn)}</span>
                  <span className="text-[#77758F]">→</span>
                  <span>{formatISTCompactDate(selectedGroup.checkOut)}</span>
                </div>
                <div className="text-[11px] text-[#77758F] mt-0.5">
                  Check-in: 12:00 PM · Check-out: 11:00 AM
                </div>
              </div>

              <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl shadow-sm">
                <span className="text-[10px] text-[#77758F] tracking-wider uppercase font-semibold">
                  {selectedGroup.isGroup ? "Combined Group Total" : "Reservation Total"}
                </span>
                <div className="text-base font-bold text-[#5146D8] mt-0.5 font-mono">
                  ₹{selectedGroup.totalAmount.toLocaleString("en-IN")}
                </div>
                <div className="text-[11px] text-[#77758F]">
                  {selectedGroup.rooms.length} {selectedGroup.rooms.length === 1 ? "room" : "rooms"} reserved
                </div>
              </div>
            </div>

            {/* Individual Room Reservations Section */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <p className="text-[11px] font-bold tracking-wider text-[#77758F] uppercase flex items-center gap-1.5">
                  <BedDouble className="w-3.5 h-3.5 text-[#5146D8]" />
                  <span>Reserved Rooms ({selectedGroup.rooms.length})</span>
                </p>
                <span className="text-[10px] text-[#77758F]">
                  Manage each room reservation individually
                </span>
              </div>

              <div className="space-y-2">
                {selectedGroup.rooms.map((roomItem, rIdx) => {
                  const isRoomCancelled = roomItem.status === "cancelled";
                  const isBusy = actionLoading === roomItem.bookingId;

                  return (
                    <div
                      key={roomItem.bookingId}
                      className={cn(
                        "p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3",
                        isRoomCancelled
                          ? "bg-rose-50/40 border-rose-200 opacity-75"
                          : "bg-[#FFFFFF] border-[#E8E7F2] shadow-sm"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-[#F0EEFF] text-[#5146D8] font-bold text-xs flex items-center justify-center shrink-0 border border-[#E0DEF8]">
                          {rIdx + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-xs text-[#24213A] truncate flex items-center gap-1.5">
                            <span>{roomItem.roomName}</span>
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border",
                                roomItem.status === "confirmed" && "bg-[#FFFBEB] border-[#FDE68A] text-[#D97706]",
                                roomItem.status === "checked_in" && "bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]",
                                roomItem.status === "checked_out" && "bg-[#F7F7FC] border-[#E8E7F2] text-[#77758F]",
                                roomItem.status === "cancelled" && "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]"
                              )}
                            >
                              {roomItem.status.replace("_", " ")}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#77758F] font-mono mt-0.5">
                            ₹{roomItem.nightlyRate.toLocaleString("en-IN")}/nt · Subtotal: ₹{roomItem.totalAmount.toLocaleString("en-IN")}
                          </div>
                        </div>
                      </div>

                      {/* Individual Room Status Controls */}
                      <div className="flex items-center gap-1.5 self-end sm:self-center">
                        {roomItem.status === "confirmed" && (
                          <button
                            onClick={() => handleSingleRoomStatusChange(roomItem.bookingId, "checked_in")}
                            disabled={isBusy}
                            className="px-2.5 py-1 rounded-lg bg-[#ECFDF5] hover:bg-[#D1FAE5] border border-[#A7F3D0] text-[#059669] text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50"
                          >
                            Check In
                          </button>
                        )}

                        {roomItem.status === "checked_in" && (
                          <button
                            onClick={() => handleSingleRoomStatusChange(roomItem.bookingId, "checked_out")}
                            disabled={isBusy}
                            className="px-2.5 py-1 rounded-lg bg-[#FFFBEB] hover:bg-[#FEF3C7] border border-[#FDE68A] text-[#D97706] text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50"
                          >
                            Check Out
                          </button>
                        )}

                        {roomItem.status !== "cancelled" && roomItem.status !== "checked_out" && (
                          <button
                            onClick={() => handleCancelSingleRoom(roomItem.bookingId, roomItem.roomName)}
                            disabled={isBusy}
                            className="px-2.5 py-1 rounded-lg bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] text-[#DC2626] text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50"
                          >
                            Cancel Room
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Guest Profiles */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold tracking-wider text-[#77758F] uppercase flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#5146D8]" />
                <span>Primary Guest Contact</span>
              </p>
              <div className="p-3 rounded-xl bg-[#FFFFFF] border border-[#E8E7F2] shadow-sm flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#F0EEFF] text-[#5146D8] font-bold flex items-center justify-center text-xs">
                    {selectedGroup.primaryGuest?.name?.slice(0, 1).toUpperCase() || "G"}
                  </div>
                  <div>
                    <div className="font-semibold text-[#24213A]">{selectedGroup.primaryGuest?.name || "Guest"}</div>
                    {selectedGroup.primaryGuest?.phone && (
                      <div className="text-[11px] text-[#77758F] flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />
                        <span>{selectedGroup.primaryGuest.phone}</span>
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-[9px] text-[#5146D8] uppercase tracking-wider font-bold bg-[#F0EEFF] border border-[#E0DEF8] px-2 py-0.5 rounded-full">
                  Primary Contact
                </span>
              </div>
            </div>

            {/* Partner & Notes */}
            <div className="space-y-2">
              <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl shadow-sm text-xs">
                <p className="text-[10px] text-[#77758F] tracking-wider uppercase font-semibold">Booked By Staff</p>
                <p className="font-semibold text-[#24213A] mt-0.5">{selectedGroup.partnerName}</p>
                {selectedGroup.notes && (
                  <div className="mt-2 pt-2 border-t border-[#E8E7F2]">
                    <p className="text-[10px] text-[#77758F] tracking-wider uppercase font-semibold">Booking Source & Notes</p>
                    <p className="text-[#24213A] mt-0.5">{selectedGroup.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </GlassModal>
      )}

      {/* New / Group Booking Modal */}
      {isNewBookingModalOpen && (
        <BookingModal
          isOpen={isNewBookingModalOpen}
          onClose={() => setIsNewBookingModalOpen(false)}
          onConfirm={async (data) => {
            const res = await createBooking(data);
            if (res.success) {
              await fetchBookings();
            }
            return res;
          }}
        />
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
