"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { GlassModal } from "@/components/ui/GlassModal";
import { 
  User, Phone, Search, Loader2, 
  ChevronDown, ChevronUp, Clock, CalendarCheck, CheckCircle2, 
  Users, Download
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatISTCompactDate } from "@/lib/dateUtils";
import { useHMSContext } from "@/components/providers/HMSProvider";
import { cn } from "@/lib/utils";
import { exportGuestRegisterToExcel, GuestRegisterBookingItem } from "@/lib/excelExport";
import { getGuestProfileAndHistoryAction } from "@/app/actions/guests";

interface Guest {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
}

interface BookingDirectoryItem {
  id: string;
  check_in: string;
  check_out: string;
  status: string;
  total_amount: number;
  created_at: string;
  room_name: string;
  partner_name: string;
  guests: Guest[];
}

export default function GuestsPage() {
  const { selectedHomestayId, homestays } = useHMSContext();
  const currentHomestay = homestays.find(h => h.id === selectedHomestayId) || homestays[0];

  const [bookings, setBookings] = useState<BookingDirectoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [roomFilter, setRoomFilter] = useState("All");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [sortBy, setSortBy] = useState("Newest");
  
  // UI State
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  
  // Profile Drawer State
  const [profileGuest, setProfileGuest] = useState<Guest | null>(null);
  const [profileStayHistory, setProfileStayHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Excel Export Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'daily' | 'monthly' | 'custom' | 'filtered'>('filtered');
  const [exportDate, setExportDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");

  const supabase = useMemo(() => createClient(), []);

  const fetchBookings = useCallback(async () => {
    try {
      let query = supabase
        .from("bookings")
        .select(`
          id,
          homestay_id,
          check_in,
          check_out,
          status,
          total_amount,
          created_at,
          rooms ( name ),
          partners ( name ),
          guests ( id, name, phone, email, is_primary )
        `);

      if (selectedHomestayId) {
        query = query.eq("homestay_id", selectedHomestayId);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        console.error("Fetch error:", error);
        setFetchError(error.message || "Unable to load guest register");
      } else if (data) {
        setFetchError(null);
        const mapped: BookingDirectoryItem[] = data.map((item: any) => ({
          id: item.id,
          check_in: item.check_in,
          check_out: item.check_out,
          status: item.status,
          total_amount: item.total_amount,
          created_at: item.created_at,
          room_name: item.rooms?.name || "Unknown Room",
          partner_name: item.partners?.name || "Reception",
          guests: (item.guests || []).map((g: any) => ({
            id: g.id,
            name: g.name,
            phone: g.phone || null,
            email: g.email || null,
            is_primary: Boolean(g.is_primary),
          }))
        }));
        setBookings(mapped);
      }
    } catch (err: any) {
      console.error("Fetch exception:", err);
      setFetchError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, selectedHomestayId]);

  useEffect(() => {
    fetchBookings();

    const channel = supabase
      .channel(`guests-register-sync-${selectedHomestayId || "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "guests" }, () => fetchBookings())
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => fetchBookings())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchBookings, selectedHomestayId]);

  // Derived Summary Counts
  const totalBookings = bookings.length;
  const activeBookings = bookings.filter(b => b.status !== "cancelled");
  const activeGuestsCount = activeBookings.reduce((sum, b) => sum + (b.guests?.length || 0), 0);
  const checkedInCount = bookings.filter(b => b.status === "checked_in").length;
  const upcomingCount = bookings.filter(b => b.status === "confirmed").length;

  const uniqueRooms = useMemo(() => Array.from(new Set(bookings.map(b => b.room_name))).sort(), [bookings]);

  // Filtering & Sorting
  const filteredBookings = useMemo(() => {
    let result = [...bookings];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(b => {
        const matchesRoom = b.room_name.toLowerCase().includes(q);
        const matchesGuest = b.guests.some(g => 
          g.name.toLowerCase().includes(q) || 
          (g.phone && g.phone.includes(q)) ||
          (g.email && g.email.toLowerCase().includes(q))
        );
        return matchesRoom || matchesGuest;
      });
    }

    // Booking Status Filter
    if (statusFilter !== "All") {
      result = result.filter(b => b.status.replace("_", " ").toLowerCase() === statusFilter.toLowerCase());
    }

    // Room Filter
    if (roomFilter !== "All") {
      result = result.filter(b => b.room_name === roomFilter);
    }

    // Date Range Filters
    if (startDateFilter) {
      result = result.filter(b => b.check_in >= startDateFilter);
    }
    if (endDateFilter) {
      result = result.filter(b => b.check_in <= endDateFilter);
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === "Newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "Oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "Check-in") return new Date(a.check_in).getTime() - new Date(b.check_in).getTime();
      if (sortBy === "Amount") return b.total_amount - a.total_amount;
      return 0;
    });

    return result;
  }, [bookings, searchQuery, statusFilter, roomFilter, startDateFilter, endDateFilter, sortBy]);

  const toggleExpand = (id: string) => {
    setExpandedBookingId(prev => prev === id ? null : id);
  };

  const getPrimaryGuest = (guests: Guest[]): Guest => {
    return guests.find(g => g.is_primary) || guests[0] || { id: "unknown", name: "Unknown", phone: null, email: null, is_primary: true };
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case "confirmed": return "text-[#D97706] border-[#FDE68A] bg-[#FFFBEB]";
      case "checked_in": return "text-[#059669] border-[#A7F3D0] bg-[#ECFDF5]";
      case "checked_out": return "text-[#2563EB] border-[#BFDBFE] bg-[#EFF6FF]";
      case "cancelled": return "text-[#DC2626] border-[#FECACA] bg-[#FEF2F2]";
      default: return "text-[#77758F] border-[#E8E7F2] bg-[#F7F7FC]";
    }
  };

  const calculateNights = (inDate: string, outDate: string) => {
    const diff = new Date(outDate).getTime() - new Date(inDate).getTime();
    return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
  };

  // Open Guest Profile Drawer & load stay history (matching via phone or email)
  const handleOpenGuestProfile = async (guest: Guest) => {
    setProfileGuest(guest);
    setIsLoadingHistory(true);
    setProfileStayHistory([]);
    try {
      if (guest.phone || guest.email) {
        const res = await getGuestProfileAndHistoryAction(guest.phone, currentHomestay?.id, guest.email);
        if (res.success && res.data) {
          setProfileStayHistory(res.data);
        }
      }
    } catch (err) {
      console.error("Error loading stay history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Excel Export Execution
  const handleExecuteExport = () => {
    const homestayName = currentHomestay?.name || "Homestay";

    if (exportMode === 'daily') {
      const dayBookings = bookings.filter(b => b.check_in === exportDate || (b.check_in <= exportDate && b.check_out > exportDate));
      exportGuestRegisterToExcel(dayBookings as GuestRegisterBookingItem[], {
        title: `Daily Guest Register (${exportDate})`,
        homestayName,
        sheetName: `Daily_${exportDate}`,
        fileName: `${homestayName.replace(/\s+/g, '_')}_Daily_Register_${exportDate}.xlsx`
      });
    } else if (exportMode === 'monthly') {
      const monthBookings = bookings.filter(b => b.check_in.startsWith(exportMonth));
      exportGuestRegisterToExcel(monthBookings as GuestRegisterBookingItem[], {
        title: `Monthly Guest Register (${exportMonth})`,
        homestayName,
        sheetName: `Month_${exportMonth}`,
        fileName: `${homestayName.replace(/\s+/g, '_')}_Monthly_Register_${exportMonth}.xlsx`
      });
    } else if (exportMode === 'custom') {
      let customBookings = bookings;
      if (exportStartDate) customBookings = customBookings.filter(b => b.check_in >= exportStartDate);
      if (exportEndDate) customBookings = customBookings.filter(b => b.check_in <= exportEndDate);
      exportGuestRegisterToExcel(customBookings as GuestRegisterBookingItem[], {
        title: `Guest Register (${exportStartDate || 'Start'} to ${exportEndDate || 'End'})`,
        homestayName,
        sheetName: "Custom_Register",
        fileName: `${homestayName.replace(/\s+/g, '_')}_Guest_Register_Export.xlsx`
      });
    } else {
      // Current filtered view
      exportGuestRegisterToExcel(filteredBookings as GuestRegisterBookingItem[], {
        title: "Guest Register (Current Filtered View)",
        homestayName,
        sheetName: "Guest_Register",
        fileName: `${homestayName.replace(/\s+/g, '_')}_Guest_Register.xlsx`
      });
    }

    setIsExportModalOpen(false);
  };

  return (
    <div className="flex flex-col w-full space-y-6 pb-12 min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-[#24213A]">Reception Guest Register</h2>
          <p className="text-[#77758F] mt-1 text-xs md:text-sm tracking-wide">
            Guest directory, stay records, repeat visit history, and verified exports.
          </p>
        </div>

        {/* Export Excel Action */}
        <button
          onClick={() => setIsExportModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
        >
          <Download className="w-4 h-4" /> Export Excel (.xlsx)
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-[20px] flex flex-col justify-center bg-[#FFFFFF] border border-[#E8E6F2] shadow-sm">
          <div className="flex items-center gap-2 mb-1.5">
            <CalendarCheck className="w-4 h-4 text-[#77758F]" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-[#77758F]">Total Bookings</span>
          </div>
          <span className="text-xl font-bold text-[#24213A]">{totalBookings}</span>
        </div>

        <div className="p-4 rounded-[20px] flex flex-col justify-center bg-[#FFFFFF] border border-[#E8E6F2] shadow-sm">
          <div className="flex items-center gap-2 mb-1.5">
            <Users className="w-4 h-4 text-[#5146D8]" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-[#77758F]">Active Guests</span>
          </div>
          <span className="text-xl font-bold text-[#24213A]">{activeGuestsCount}</span>
        </div>

        <div className="p-4 rounded-[20px] flex flex-col justify-center bg-[#FFFFFF] border border-[#E8E6F2] shadow-sm">
          <div className="flex items-center gap-2 mb-1.5">
            <CheckCircle2 className="w-4 h-4 text-[#059669]" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-[#77758F]">Checked In</span>
          </div>
          <span className="text-xl font-bold text-[#24213A]">{checkedInCount}</span>
        </div>

        <div className="p-4 rounded-[20px] flex flex-col justify-center bg-[#FFFFFF] border border-[#E8E6F2] shadow-sm">
          <div className="flex items-center gap-2 mb-1.5">
            <Clock className="w-4 h-4 text-[#D97706]" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-[#77758F]">Upcoming</span>
          </div>
          <span className="text-xl font-bold text-[#24213A]">{upcomingCount}</span>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E8E6F2] shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-2.5">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#77758F] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by guest name, phone, email, or room..."
              className="w-full bg-[#F7F7FC] border border-[#E8E6F2] rounded-xl pl-9 pr-4 py-2 text-xs text-[#24213A] placeholder-[#8F8CA4] outline-none focus:border-[#5146D8] transition-colors"
            />
          </div>

          {/* Quick Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#F7F7FC] border border-[#E8E6F2] rounded-xl px-2.5 py-2 text-xs text-[#24213A] outline-none focus:border-[#5146D8] truncate cursor-pointer"
            >
              <option value="All">All Status</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Checked In">Checked In</option>
              <option value="Checked Out">Checked Out</option>
              <option value="Cancelled">Cancelled</option>
            </select>

            <select 
              value={roomFilter} 
              onChange={(e) => setRoomFilter(e.target.value)}
              className="bg-[#F7F7FC] border border-[#E8E6F2] rounded-xl px-2.5 py-2 text-xs text-[#24213A] outline-none focus:border-[#5146D8] truncate cursor-pointer"
            >
              <option value="All">All Rooms</option>
              {uniqueRooms.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-[#F7F7FC] border border-[#E8E6F2] rounded-xl px-2.5 py-2 text-xs text-[#24213A] outline-none focus:border-[#5146D8] truncate cursor-pointer"
            >
              <option value="Newest">Newest First</option>
              <option value="Oldest">Oldest First</option>
              <option value="Check-in">Check-in Date</option>
              <option value="Amount">Amount</option>
            </select>
          </div>
        </div>

        {/* Date Filter Range */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E8E6F2] text-xs text-[#77758F]">
          <span className="font-bold text-[#24213A]">Stay Dates:</span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              className="bg-[#F7F7FC] border border-[#E8E6F2] rounded-lg px-2.5 py-1 text-xs text-[#24213A] outline-none focus:border-[#5146D8]"
            />
            <span>to</span>
            <input
              type="date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
              className="bg-[#F7F7FC] border border-[#E8E6F2] rounded-lg px-2.5 py-1 text-xs text-[#24213A] outline-none focus:border-[#5146D8]"
            />
            {(startDateFilter || endDateFilter) && (
              <button
                onClick={() => { setStartDateFilter(""); setEndDateFilter(""); }}
                className="text-[11px] font-bold text-[#DC2626] hover:underline ml-1"
              >
                Clear Dates
              </button>
            )}
          </div>
          <span className="ml-auto text-[11px] font-bold text-[#5146D8]">
            Showing {filteredBookings.length} of {bookings.length} reservations
          </span>
        </div>
      </div>

      {/* Main Register List */}
      <div className="p-0 md:p-1 rounded-[24px] bg-transparent md:bg-[#FFFFFF] md:border md:border-[#E8E6F2] shadow-sm overflow-hidden">
        
        {/* Mobile View (Cards) */}
        <div className="md:hidden flex flex-col gap-3 pb-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Loader2 className="w-6 h-6 text-[#5146D8] animate-spin" />
              <span className="text-[#77758F] text-xs">Loading guest register...</span>
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="bg-[#FFFFFF] border border-[#E8E6F2] rounded-2xl p-8 flex flex-col items-center justify-center gap-2 text-center">
              <User className="w-6 h-6 text-[#77758F] mb-1" />
              <div className="text-[#24213A] font-bold text-sm">No reservations found</div>
              <p className="text-xs text-[#77758F]">Try adjusting your search query or filters.</p>
            </div>
          ) : (
            filteredBookings.map((booking) => {
              const primaryGuest = getPrimaryGuest(booking.guests);
              const nights = calculateNights(booking.check_in, booking.check_out);
              const isExpanded = expandedBookingId === booking.id;

              return (
                <div key={booking.id} className="bg-[#FFFFFF] border border-[#E8E6F2] rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <h4 className="font-bold text-[#24213A] text-sm truncate">{primaryGuest.name}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] text-[#5146D8] font-bold bg-[#F0EEFF] px-2 py-0.5 rounded-full border border-[#E0DEF8]">
                          Primary
                        </span>
                        <span className="text-[10px] text-[#77758F]">
                          {booking.guests.length > 1 ? `+${booking.guests.length - 1} guests` : '1 guest'}
                        </span>
                      </div>
                    </div>
                    <span className={cn("px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase border shrink-0", getStatusColor(booking.status))}>
                      {booking.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-[#F7F7FC] rounded-xl p-3 border border-[#E8E6F2] text-xs">
                    <div>
                      <span className="text-[9px] font-bold uppercase text-[#77758F] block mb-0.5">Room & Stay</span>
                      <div className="font-bold text-[#24213A]">{booking.room_name}</div>
                      <div className="text-[10px] text-[#77758F]">
                        {formatISTCompactDate(booking.check_in)} → {formatISTCompactDate(booking.check_out)}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-bold uppercase text-[#77758F] block mb-0.5">Amount</span>
                      <div className="font-bold text-[#5146D8]">₹{booking.total_amount.toLocaleString("en-IN")}</div>
                      <div className="text-[10px] text-[#77758F]">{nights} {nights === 1 ? 'Night' : 'Nights'}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#E8E6F2]/60">
                    <div className="flex items-center gap-1.5 text-xs text-[#77758F] min-w-0">
                      <Phone className="w-3.5 h-3.5 shrink-0 text-[#77758F]" />
                      <span className="truncate">{primaryGuest.phone || primaryGuest.email || "No contact"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleOpenGuestProfile(primaryGuest)}
                        className="px-3 py-1.5 bg-[#F0EEFF] hover:bg-[#E0DEF8] text-[#5146D8] border border-[#E0DEF8] rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        Profile
                      </button>
                      {booking.guests.length > 1 && (
                        <button
                          onClick={() => toggleExpand(booking.id)}
                          className="p-1.5 rounded-lg border border-[#E8E6F2] text-[#77758F] hover:bg-[#F7F7FC] transition-colors cursor-pointer"
                          title={isExpanded ? "Collapse Guests" : "View All Guests"}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="pt-2 border-t border-[#E8E6F2] space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#77758F] block">
                        Guests in this reservation ({booking.guests.length})
                      </span>
                      <div className="space-y-1.5">
                        {booking.guests.map((g, idx) => (
                          <div key={g.id || idx} className="p-2.5 rounded-xl bg-[#F7F7FC] border border-[#E8E6F2] flex items-center justify-between gap-2 text-xs">
                            <div className="min-w-0">
                              <div className="font-bold text-[#24213A] flex items-center gap-1.5 truncate">
                                <span className="truncate">{g.name}</span>
                                {g.is_primary && (
                                  <span className="text-[9px] font-bold bg-[#F0EEFF] text-[#5146D8] px-1.5 py-0.2 rounded border border-[#E0DEF8] shrink-0">
                                    Primary
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#77758F] truncate">
                                {g.phone || g.email || "No contact"}
                              </div>
                            </div>
                            <button
                              onClick={() => handleOpenGuestProfile(g)}
                              className="px-2.5 py-1 rounded-lg bg-[#FFFFFF] border border-[#E0DEF8] text-[#5146D8] font-bold text-[11px] shrink-0 cursor-pointer"
                            >
                              Profile
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View (Table) */}
        <div className="hidden md:block w-full overflow-x-auto hms-editor-scrollbar">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="border-b border-[#E8E6F2] bg-[#F7F7FC] text-[10px] font-bold uppercase tracking-wider text-[#77758F]">
                <th className="px-5 py-3.5 w-[28%]">Guest / Contact</th>
                <th className="px-5 py-3.5 w-[16%]">Room</th>
                <th className="px-5 py-3.5 w-[18%]">Stay Dates</th>
                <th className="px-5 py-3.5 w-[13%]">Status</th>
                <th className="px-5 py-3.5 w-[13%]">Total Amount</th>
                <th className="px-5 py-3.5 w-[12%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E6F2] text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-[#77758F]">
                    <Loader2 className="w-6 h-6 text-[#5146D8] animate-spin mx-auto mb-2" />
                    <span>Loading guest register...</span>
                  </td>
                </tr>
              ) : filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-[#77758F]">
                    No guest bookings found matching the current filters.
                  </td>
                </tr>
              ) : (
                filteredBookings.map((booking) => {
                  const primaryGuest = getPrimaryGuest(booking.guests);
                  const nights = calculateNights(booking.check_in, booking.check_out);
                  const isExpanded = expandedBookingId === booking.id;

                  return (
                    <React.Fragment key={booking.id}>
                      <tr className="hover:bg-[#F7F7FC]/70 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#F0EEFF] flex items-center justify-center shrink-0">
                              <User className="w-4 h-4 text-[#5146D8]" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-[#24213A] truncate">{primaryGuest.name}</div>
                              <div className="text-[11px] text-[#77758F] flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <Phone className="w-3 h-3 text-[#77758F] shrink-0" />
                                <span>{primaryGuest.phone || primaryGuest.email || "No contact"}</span>
                                {booking.guests.length > 1 && (
                                  <span className="text-[10px] text-[#5146D8] font-bold ml-1">
                                    (+{booking.guests.length - 1} more)
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-3.5 font-bold text-[#24213A]">
                          {booking.room_name}
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="text-[#24213A] font-medium">
                            {formatISTCompactDate(booking.check_in)} → {formatISTCompactDate(booking.check_out)}
                          </div>
                          <div className="text-[10px] text-[#77758F] mt-0.5">
                            {nights} {nights === 1 ? 'Night' : 'Nights'}
                          </div>
                        </td>

                        <td className="px-5 py-3.5">
                          <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border", getStatusColor(booking.status))}>
                            {booking.status.replace("_", " ")}
                          </span>
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="font-bold text-[#24213A]">
                            ₹{booking.total_amount.toLocaleString("en-IN")}
                          </div>
                          <div className="text-[10px] text-[#77758F] mt-0.5">Ref #{booking.id.slice(0, 8).toUpperCase()}</div>
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenGuestProfile(primaryGuest)}
                              className="px-2.5 py-1 rounded-lg bg-[#F0EEFF] hover:bg-[#E0DEF8] border border-[#E0DEF8] text-[#5146D8] font-bold text-xs transition-colors cursor-pointer"
                              title="View Guest Stay Profile"
                            >
                              Profile
                            </button>
                            <button
                              onClick={() => toggleExpand(booking.id)}
                              className="p-1 rounded-lg border border-[#E8E6F2] text-[#77758F] hover:bg-[#F7F7FC] transition-colors cursor-pointer"
                              title={isExpanded ? "Collapse Guests" : "View All Guests"}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Guest List */}
                      {isExpanded && (
                        <tr className="bg-[#F7F7FC]/50">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="space-y-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#77758F] block">
                                Guests in this reservation ({booking.guests.length})
                              </span>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                {booking.guests.map((g, idx) => (
                                  <div key={g.id || idx} className="p-3 rounded-xl bg-[#FFFFFF] border border-[#E8E6F2] flex items-center justify-between gap-2">
                                    <div className="space-y-0.5 min-w-0">
                                      <div className="font-bold text-[#24213A] flex items-center gap-1.5">
                                        <span className="truncate">{g.name}</span>
                                        {g.is_primary && (
                                          <span className="text-[9px] font-bold bg-[#F0EEFF] text-[#5146D8] px-1.5 py-0.2 rounded border border-[#E0DEF8] shrink-0">
                                            Primary
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-[#77758F] truncate">
                                        {g.phone || g.email || "No contact"}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handleOpenGuestProfile(g)}
                                      className="px-2.5 py-1 rounded-lg bg-[#F0EEFF] hover:bg-[#E0DEF8] border border-[#E0DEF8] text-[#5146D8] font-bold text-[11px] transition-colors cursor-pointer shrink-0"
                                    >
                                      Profile
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* GUEST PROFILE & STAY HISTORY MODAL */}
      {/* ===================================================================== */}
      {profileGuest && (
        <GlassModal
          isOpen={!!profileGuest}
          onClose={() => setProfileGuest(null)}
          title="Guest Stay History"
        >
          <div className="p-6 md:p-8 flex flex-col gap-6 w-full max-w-2xl mx-auto overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg md:text-xl font-bold text-[#24213A]">{profileGuest.name}</h3>
                <p className="text-xs text-[#77758F] mt-0.5">Reception Guest Folio & Stay History</p>
              </div>
            </div>

            {/* Profile Contact Card */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 rounded-xl bg-[#F7F7FC] border border-[#E8E6F2] text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase text-[#77758F] block mb-0.5">Phone</span>
                <span className="font-bold text-[#24213A]">{profileGuest.phone || "Not recorded"}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-[#77758F] block mb-0.5">Email</span>
                <span className="font-bold text-[#24213A] truncate block">{profileGuest.email || "Not recorded"}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-[#77758F] block mb-0.5">Total Visits</span>
                <span className="font-bold text-[#5146D8]">
                  {isLoadingHistory
                    ? "Loading..."
                    : `${profileStayHistory.length} ${profileStayHistory.length === 1 ? "Visit" : "Visits"}`}
                </span>
              </div>
            </div>

            {/* Stay Records */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#77758F]">Stay History</h4>
                {!isLoadingHistory && profileStayHistory.length > 0 && (
                  <span className="text-[11px] font-bold text-[#5146D8]">
                    {profileStayHistory.length} {profileStayHistory.length === 1 ? "stay" : "stays"} found
                  </span>
                )}
              </div>
              
              {isLoadingHistory ? (
                <div className="py-8 text-center text-[#77758F] text-xs">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1 text-[#5146D8]" />
                  <span>Loading stay records...</span>
                </div>
              ) : profileStayHistory.length === 0 ? (
                <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E8E6F2] text-center text-xs text-[#77758F]">
                  No prior stay records found for this phone number or email address.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto hide-scrollbar">
                  {profileStayHistory.map((rec: any, idx: number) => {
                    const booking = rec.bookings;
                    if (!booking) return null;
                    return (
                      <div key={idx} className="p-3 rounded-xl bg-[#FFFFFF] border border-[#E8E6F2] flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-[#24213A]">
                            {booking.rooms?.name || "Room"} (Room #{booking.rooms?.room_number || "—"})
                          </div>
                          <div className="text-[11px] text-[#77758F]">
                            {formatISTCompactDate(booking.check_in)} → {formatISTCompactDate(booking.check_out)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-[#5146D8]">₹{booking.total_amount?.toLocaleString("en-IN")}</div>
                          <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border", getStatusColor(booking.status))}>
                            {booking.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E8E6F2]">
              <button
                onClick={() => setProfileGuest(null)}
                className="px-5 py-2 bg-[#5146D8] hover:bg-[#4338CA] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </GlassModal>
      )}

      {/* ===================================================================== */}
      {/* EXCEL EXPORT MODAL */}
      {/* ===================================================================== */}
      {isExportModalOpen && (
        <GlassModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          title="Export Guest Register (.xlsx)"
        >
          <div className="p-6 md:p-8 flex flex-col gap-5 w-full max-w-lg mx-auto overflow-hidden">
            <div>
              <h3 className="text-lg md:text-xl font-bold text-[#24213A]">Export Guest Register</h3>
              <p className="text-xs text-[#77758F] mt-0.5">
                Generate a native Microsoft Excel (.xlsx) spreadsheet formatted for reception records.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-2">
                  Select Export Scope
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'filtered', label: 'Current Filtered View' },
                    { id: 'daily', label: 'Daily Register' },
                    { id: 'monthly', label: 'Monthly Register' },
                    { id: 'custom', label: 'Custom Date Range' }
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setExportMode(m.id as any)}
                      className={cn(
                        "p-2.5 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer",
                        exportMode === m.id 
                          ? "bg-[#F0EEFF] border-[#5146D8] text-[#5146D8]" 
                          : "bg-[#FFFFFF] border-[#E8E6F2] text-[#77758F] hover:bg-[#F7F7FC]"
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {exportMode === 'daily' && (
                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1">
                    Select Day
                  </label>
                  <input
                    type="date"
                    value={exportDate}
                    onChange={(e) => setExportDate(e.target.value)}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-3 py-2 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8]"
                  />
                </div>
              )}

              {exportMode === 'monthly' && (
                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1">
                    Select Month
                  </label>
                  <input
                    type="month"
                    value={exportMonth}
                    onChange={(e) => setExportMonth(e.target.value)}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-3 py-2 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8]"
                  />
                </div>
              )}

              {exportMode === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1">
                      From Date
                    </label>
                    <input
                      type="date"
                      value={exportStartDate}
                      onChange={(e) => setExportStartDate(e.target.value)}
                      className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-3 py-2 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1">
                      To Date
                    </label>
                    <input
                      type="date"
                      value={exportEndDate}
                      onChange={(e) => setExportEndDate(e.target.value)}
                      className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-3 py-2 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8]"
                    />
                  </div>
                </div>
              )}

              <div className="p-3 rounded-xl bg-[#F7F7FC] border border-[#E8E6F2] text-[11px] text-[#77758F] space-y-1">
                <span className="font-bold text-[#24213A] block">Included Columns:</span>
                <p>Guest Name, Phone Number, Booking Reference, Room Name, Check-in Date, Check-out Date, Guests Count, Booking Status, and Source.</p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E8E6F2]">
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#77758F] hover:bg-[#F7F7FC] border border-[#E8E6F2] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteExport}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-[#059669] hover:bg-[#047857] text-white transition-all shadow-sm cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Download .xlsx
                </button>
              </div>
            </div>
          </div>
        </GlassModal>
      )}

    </div>
  );
}
