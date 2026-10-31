"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { GlassModal } from "@/components/ui/GlassModal";
import { 
  User, Phone, Calendar, IndianRupee, BedDouble, Search, Loader2, 
  ChevronDown, ChevronUp, Clock, CalendarCheck, CheckCircle2, UserCircle2, Info, Users 
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatISTCompactDate } from "@/lib/dateUtils";
import { useHMSContext } from "@/components/providers/HMSProvider";

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
  const { selectedHomestayId } = useHMSContext();
  const [bookings, setBookings] = useState<BookingDirectoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [roomFilter, setRoomFilter] = useState("All");
  const [sortBy, setSortBy] = useState("Newest");
  
  // UI State
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [viewingBooking, setViewingBooking] = useState<BookingDirectoryItem | null>(null);

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
          guests (
            id,
            name,
            phone,
            email,
            is_primary
          )
        `);

      if (selectedHomestayId) {
        query = query.eq("homestay_id", selectedHomestayId);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        console.error("Fetch error:", error);
        setFetchError(error.message || "Unable to load directory");
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
          partner_name: item.partners?.name || "Unknown Partner",
          guests: item.guests || []
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
      .channel(`guests-directory-sync-${selectedHomestayId || "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "guests" }, () => fetchBookings())
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => fetchBookings())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchBookings, selectedHomestayId]);

  // Derived Summary Data
  const totalBookings = bookings.length;
  const activeBookings = bookings.filter(b => b.status !== "cancelled");
  const activeGuestsCount = activeBookings.reduce((sum, b) => sum + b.guests.length, 0);
  const checkedInCount = bookings.filter(b => b.status === "checked_in").length;
  const upcomingCount = bookings.filter(b => b.status === "confirmed").length;

  const uniqueRooms = useMemo(() => Array.from(new Set(bookings.map(b => b.room_name))).sort(), [bookings]);

  // Filtering & Sorting
  const filteredBookings = useMemo(() => {
    let result = bookings;

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(b => {
        const matchesRoom = b.room_name.toLowerCase().includes(q);
        const matchesGuest = b.guests.some(g => 
          g.name.toLowerCase().includes(q) || 
          (g.phone && g.phone.includes(q))
        );
        return matchesRoom || matchesGuest;
      });
    }

    // Status Filter
    if (statusFilter !== "All") {
      result = result.filter(b => b.status.replace("_", " ").toLowerCase() === statusFilter.toLowerCase());
    }

    // Room Filter
    if (roomFilter !== "All") {
      result = result.filter(b => b.room_name === roomFilter);
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
  }, [bookings, searchQuery, statusFilter, roomFilter, sortBy]);

  const toggleExpand = (id: string) => {
    setExpandedBookingId(prev => prev === id ? null : id);
  };

  const getPrimaryGuest = (guests: Guest[]) => {
    return guests.find(g => g.is_primary) || guests[0] || { name: "Unknown", phone: null };
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

  return (
    <div className="flex flex-col h-full overflow-y-auto hide-scrollbar space-y-6 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-[#24213A]">Guest Directory</h2>
          <p className="text-[#77758F] mt-1 text-xs md:text-sm tracking-wide">
            Manage bookings, guests, and stay histories.
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-[20px] flex flex-col justify-center bg-[#FFFFFF] border border-[#E8E7F2] shadow-[0_2px_8px_rgba(36,33,58,0.02)]">
          <div className="flex items-center gap-2 mb-2">
            <CalendarCheck className="w-4 h-4 text-[#77758F]" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-[#77758F]">Bookings</span>
          </div>
          <span className="text-xl font-bold text-[#24213A]">{totalBookings}</span>
        </div>
        <div className="p-4 rounded-[20px] flex flex-col justify-center bg-[#FFFFFF] border border-[#E8E7F2] shadow-[0_2px_8px_rgba(36,33,58,0.02)]">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-[#5146D8]" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-[#77758F]">Active Guests</span>
          </div>
          <span className="text-xl font-bold text-[#24213A]">{activeGuestsCount}</span>
        </div>
        <div className="p-4 rounded-[20px] flex flex-col justify-center bg-[#FFFFFF] border border-[#E8E7F2] shadow-[0_2px_8px_rgba(36,33,58,0.02)]">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-[#059669]" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-[#77758F]">Checked In</span>
          </div>
          <span className="text-xl font-bold text-[#24213A]">{checkedInCount}</span>
        </div>
        <div className="p-4 rounded-[20px] flex flex-col justify-center bg-[#FFFFFF] border border-[#E8E7F2] shadow-[0_2px_8px_rgba(36,33,58,0.02)]">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-[#D97706]" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-[#77758F]">Upcoming</span>
          </div>
          <span className="text-xl font-bold text-[#24213A]">{upcomingCount}</span>
        </div>
      </div>

      {/* Compact Filters */}
      <div className="flex flex-col md:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#77758F] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search guests, phones, or rooms..."
            className="w-full bg-[#FFFFFF] border border-[#E8E7F2] rounded-xl pl-9 pr-4 py-2 text-xs text-[#24213A] placeholder-[#8F8CA4] outline-none focus:border-[#5146D8] transition-colors shadow-sm"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#FFFFFF] border border-[#E8E7F2] rounded-xl px-2.5 py-2 text-xs text-[#24213A] outline-none focus:border-[#5146D8] truncate cursor-pointer shadow-sm"
          >
            <option value="All" className="bg-[#FFFFFF] text-[#24213A]">All Status</option>
            <option value="Confirmed" className="bg-[#FFFFFF] text-[#24213A]">Confirmed</option>
            <option value="Checked In" className="bg-[#FFFFFF] text-[#24213A]">Checked In</option>
            <option value="Checked Out" className="bg-[#FFFFFF] text-[#24213A]">Checked Out</option>
            <option value="Cancelled" className="bg-[#FFFFFF] text-[#24213A]">Cancelled</option>
          </select>
          <select 
            value={roomFilter} 
            onChange={(e) => setRoomFilter(e.target.value)}
            className="bg-[#FFFFFF] border border-[#E8E7F2] rounded-xl px-2.5 py-2 text-xs text-[#24213A] outline-none focus:border-[#5146D8] truncate cursor-pointer shadow-sm"
          >
            <option value="All" className="bg-[#FFFFFF] text-[#24213A]">All Rooms</option>
            {uniqueRooms.map(r => <option key={r} value={r} className="bg-[#FFFFFF] text-[#24213A]">{r}</option>)}
          </select>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-[#FFFFFF] border border-[#E8E7F2] rounded-xl px-2.5 py-2 text-xs text-[#24213A] outline-none focus:border-[#5146D8] truncate cursor-pointer shadow-sm"
          >
            <option value="Newest" className="bg-[#FFFFFF] text-[#24213A]">Newest</option>
            <option value="Oldest" className="bg-[#FFFFFF] text-[#24213A]">Oldest</option>
            <option value="Check-in" className="bg-[#FFFFFF] text-[#24213A]">Check-in</option>
            <option value="Amount" className="bg-[#FFFFFF] text-[#24213A]">Amount</option>
          </select>
        </div>
      </div>

      <div className="p-0 md:p-1 rounded-[24px] bg-transparent border-transparent md:bg-[#FFFFFF] md:border md:border-[#E8E7F2] shadow-none md:shadow-[0_4px_24px_rgba(36,33,58,0.03)] overflow-hidden">
        
        {/* Mobile View (Cards) */}
        <div className="md:hidden flex flex-col gap-3 pb-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Loader2 className="w-6 h-6 text-[#5146D8] animate-spin" />
              <span className="text-[#77758F] text-xs">Loading directory...</span>
            </div>
          ) : fetchError ? (
            <div className="bg-[#FFFFFF] border border-[#FECACA] rounded-[20px] p-8 flex flex-col items-center justify-center gap-3 text-center shadow-sm">
              <div className="text-[#DC2626] font-bold text-sm">Unable to load directory</div>
              <button onClick={fetchBookings} className="px-4 py-2 bg-[#F0EEFF] text-[#5146D8] rounded-lg text-xs font-bold hover:bg-[#E0DEF8]">Retry</button>
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="bg-[#FFFFFF] border border-[#E8E7F2] rounded-[20px] p-8 flex flex-col items-center justify-center gap-2 text-center shadow-sm">
              <User className="w-5 h-5 text-[#77758F] mb-1" />
              <div className="text-[#24213A] font-bold text-sm">No bookings found</div>
              <p className="text-xs text-[#77758F]">Try adjusting your search or filters.</p>
            </div>
          ) : (
            filteredBookings.map((booking) => {
              const primaryGuest = getPrimaryGuest(booking.guests);
              const nights = calculateNights(booking.check_in, booking.check_out);
              const isExpanded = expandedBookingId === booking.id;

              return (
                <div key={booking.id} className="bg-[#FFFFFF] border border-[#E8E7F2] shadow-[0_2px_8px_rgba(36,33,58,0.02)] rounded-[20px] p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-[#24213A] text-sm">{primaryGuest.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-[#5146D8] uppercase tracking-wider font-bold bg-[#F0EEFF] px-2 py-0.5 rounded-full border border-[#E0DEF8]">
                          Primary
                        </span>
                        <span className="text-[10px] text-[#77758F] font-medium">
                          {booking.guests.length > 1 ? `+${booking.guests.length - 1} guests` : '1 guest'}
                        </span>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase border ${getStatusColor(booking.status)}`}>
                      {booking.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-[#F7F7FC] rounded-xl p-3 border border-[#E8E7F2]">
                    <div>
                      <div className="text-[9px] text-[#77758F] font-bold uppercase tracking-wider mb-1">Room & Stay</div>
                      <div className="text-xs font-bold text-[#24213A]">{booking.room_name}</div>
                      <div className="text-[10px] text-[#77758F] mt-0.5">
                        {formatISTCompactDate(booking.check_in)} → {formatISTCompactDate(booking.check_out)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] text-[#77758F] font-bold uppercase tracking-wider mb-1">Amount</div>
                      <div className="text-xs font-bold text-[#5146D8]">₹{booking.total_amount.toLocaleString("en-IN")}</div>
                      <div className="text-[10px] text-[#77758F] mt-0.5">{nights} {nights === 1 ? 'Night' : 'Nights'}</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => setViewingBooking(booking)}
                      className="flex-1 bg-[#F0EEFF] hover:bg-[#E0DEF8] text-[#5146D8] border border-[#E0DEF8] py-2.5 rounded-lg text-xs font-bold transition-colors"
                    >
                      View Details
                    </button>
                    <button 
                      onClick={() => toggleExpand(booking.id)}
                      aria-label={isExpanded ? "Collapse guest list" : "Expand guest list"}
                      className="px-3 bg-[#FFFFFF] border border-[#E8E7F2] text-[#77758F] hover:text-[#24213A] rounded-lg flex items-center justify-center transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-2 pt-3 border-t border-[#E8E7F2] animate-in slide-in-from-top-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#77758F] mb-2">Guests in this booking</div>
                      <div className="flex flex-col gap-2">
                        {booking.guests.map((g, i) => (
                          <div key={g.id || i} className="flex items-center justify-between bg-[#F7F7FC] border border-[#E8E7F2] p-2.5 rounded-lg">
                            <div>
                              <div className="text-xs font-bold text-[#24213A] flex items-center gap-1.5">
                                <UserCircle2 className="w-3.5 h-3.5 text-[#77758F]" />
                                {g.name}
                                {g.is_primary && <span className="text-[8px] text-[#5146D8] uppercase font-bold ml-1 border border-[#E0DEF8] bg-[#F0EEFF] px-1 rounded">Primary</span>}
                              </div>
                              <div className="text-[10px] text-[#77758F] flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3 text-[#77758F]" />
                                {g.phone || "N/A"}
                              </div>
                            </div>
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
        <div className="hidden md:block w-full overflow-x-auto hide-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-[#E8E7F2] bg-[#F7F7FC]/70 text-[10px] uppercase tracking-widest text-[#77758F]">
                <th className="px-6 py-4 font-semibold">Guest / Booking</th>
                <th className="px-6 py-4 font-semibold">Room</th>
                <th className="px-6 py-4 font-semibold">Stay</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Amount</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-16 text-center text-[#77758F]"><Loader2 className="w-6 h-6 text-[#5146D8] animate-spin mx-auto" /></td></tr>
              ) : fetchError ? (
                <tr><td colSpan={6} className="px-6 py-16 text-center text-[#DC2626] font-bold">Unable to load directory</td></tr>
              ) : filteredBookings.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-16 text-center text-[#77758F]">No bookings found.</td></tr>
              ) : (
                filteredBookings.map((booking) => {
                  const primaryGuest = getPrimaryGuest(booking.guests);
                  const nights = calculateNights(booking.check_in, booking.check_out);
                  const isExpanded = expandedBookingId === booking.id;

                  return (
                    <React.Fragment key={booking.id}>
                      <tr className="group transition-colors hover:bg-[#F7F7FC] border-b border-[#E8E7F2]">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#F0EEFF] flex items-center justify-center shrink-0">
                              <User className="w-5 h-5 text-[#5146D8]" />
                            </div>
                            <div>
                              <div className="font-bold text-[#24213A]">{primaryGuest.name}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] text-[#5146D8] tracking-wider uppercase font-bold border border-[#E0DEF8] bg-[#F0EEFF] px-1.5 py-0.5 rounded">
                                  Primary
                                </span>
                                <span className="text-[10px] text-[#77758F] font-medium">
                                  {booking.guests.length > 1 ? `+${booking.guests.length - 1} Guests` : '1 Guest'}
                                </span>
                              </div>
                              <div className="text-xs text-[#77758F] flex items-center gap-1 mt-1">
                                <Phone className="w-3 h-3" />
                                {primaryGuest.phone || "N/A"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-[#24213A]">{booking.room_name}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-[#24213A] text-xs font-medium flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-[#77758F]" />
                            {formatISTCompactDate(booking.check_in)} → {formatISTCompactDate(booking.check_out)}
                          </div>
                          <div className="text-[10px] text-[#77758F] mt-0.5 ml-5">{nights} {nights === 1 ? 'Night' : 'Nights'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold tracking-widest uppercase border ${getStatusColor(booking.status)}`}>
                            {booking.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-[#24213A] flex items-center gap-1">
                            <IndianRupee className="w-3 h-3 text-[#77758F]" />
                            {booking.total_amount.toLocaleString("en-IN")}
                          </div>
                          <div className="text-[10px] text-[#77758F] mt-0.5 truncate max-w-[100px]">{booking.partner_name}</div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => setViewingBooking(booking)}
                              className="px-3 py-1.5 bg-[#F0EEFF] hover:bg-[#E0DEF8] border border-[#E0DEF8] text-[#5146D8] rounded-lg text-xs font-bold transition-colors cursor-pointer"
                            >
                              View Details
                            </button>
                            <button 
                              onClick={() => toggleExpand(booking.id)}
                              className="p-1.5 bg-[#FFFFFF] hover:bg-[#F7F7FC] text-[#77758F] rounded-lg border border-[#E8E7F2] transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <Users className="w-3.5 h-3.5" />
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-[#F7F7FC] border-b border-[#E8E7F2]">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="flex flex-col gap-3 animate-in slide-in-from-top-2">
                              <div className="text-[10px] font-bold uppercase tracking-widest text-[#77758F] flex items-center gap-2">
                                <Info className="w-3.5 h-3.5 text-[#5146D8]" />
                                Guests in this booking ({booking.guests.length})
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {booking.guests.map((g, i) => (
                                  <div key={g.id || i} className="flex items-start gap-3 bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl shadow-sm">
                                    <UserCircle2 className="w-5 h-5 text-[#5146D8] shrink-0 mt-0.5" />
                                    <div>
                                      <div className="text-sm font-bold text-[#24213A] flex items-center gap-2">
                                        {g.name}
                                        {g.is_primary && <span className="text-[8px] text-[#5146D8] uppercase font-bold border border-[#E0DEF8] bg-[#F0EEFF] px-1 rounded">Primary</span>}
                                      </div>
                                      <div className="text-xs text-[#77758F] flex items-center gap-1 mt-1">
                                        <Phone className="w-3 h-3 text-[#77758F]" />
                                        {g.phone || "N/A"}
                                      </div>
                                    </div>
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

      {/* Inline Booking Details Modal */}
      {viewingBooking && (
        <GlassModal isOpen={!!viewingBooking} onClose={() => setViewingBooking(null)} title="Booking Details">
          <div className="p-6 md:p-8 flex flex-col gap-6 w-full max-w-2xl mx-auto overflow-hidden">
            <div>
              <h3 className="text-lg md:text-xl font-bold text-[#24213A] mb-1">Booking Details</h3>
              <p className="text-sm text-[#77758F]">Comprehensive view of the stay and all guests.</p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-[#F7F7FC] p-4 rounded-xl border border-[#E8E7F2]">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#77758F] block mb-1">Room</span>
                <span className="text-sm font-bold text-[#24213A]">{viewingBooking.room_name}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#77758F] block mb-1">Stay</span>
                <span className="text-sm font-bold text-[#24213A]">{formatISTCompactDate(viewingBooking.check_in)} → {formatISTCompactDate(viewingBooking.check_out)}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#77758F] block mb-1">Amount</span>
                <span className="text-sm font-bold text-[#5146D8]">₹{viewingBooking.total_amount.toLocaleString("en-IN")}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#77758F] block mb-1">Partner</span>
                <span className="text-sm font-bold text-[#24213A] truncate block">{viewingBooking.partner_name}</span>
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto hide-scrollbar">
              <h4 className="text-xs font-bold uppercase tracking-widest text-[#77758F] mb-3">Guests in this booking ({viewingBooking.guests.length})</h4>
              <div className="flex flex-col gap-2">
                {viewingBooking.guests.map((g, idx) => (
                  <div key={g.id || idx} className="flex items-center gap-4 bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-xl shadow-sm">
                    <div className="w-8 h-8 rounded-full bg-[#F0EEFF] flex items-center justify-center shrink-0">
                      <UserCircle2 className="w-4 h-4 text-[#5146D8]" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#24213A]">{g.name}</span>
                        {g.is_primary && (
                          <span className="text-[9px] text-[#5146D8] tracking-wider uppercase font-bold border border-[#E0DEF8] bg-[#F0EEFF] px-1.5 py-0.5 rounded">
                            Primary Guest
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#77758F] flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3 text-[#77758F]" />
                        {g.phone || "N/A"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button 
                onClick={() => setViewingBooking(null)}
                className="px-6 py-2.5 bg-[#5146D8] hover:bg-[#4338CA] text-white rounded-xl text-sm font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </GlassModal>
      )}
    </div>
  );
}
