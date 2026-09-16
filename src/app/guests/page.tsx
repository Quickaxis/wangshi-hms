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
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id,
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
        `)
        .order("created_at", { ascending: false });

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
  }, [supabase]);

  useEffect(() => {
    fetchBookings();

    const channel = supabase
      .channel("guests-directory-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "guests" }, () => fetchBookings())
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => fetchBookings())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchBookings]);

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
      case "confirmed": return "text-[#F59E0B] border-[#F59E0B]/30 bg-[#F59E0B]/10";
      case "checked_in": return "text-emerald-400 border-emerald-400/30 bg-emerald-400/10";
      case "checked_out": return "text-blue-400 border-blue-400/30 bg-blue-400/10";
      case "cancelled": return "text-rose-400 border-rose-400/30 bg-rose-400/10";
      default: return "text-gray-400 border-gray-400/30 bg-gray-400/10";
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
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 md:text-[#F5F1E8]">Guest Directory</h2>
          <p className="text-gray-500 md:text-[#96928A] mt-1 text-xs md:text-sm tracking-wide">
            Manage bookings, guests, and stay histories.
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <GlassPanel className="p-4 rounded-[20px] flex flex-col justify-center glass-panel-secondary border border-[rgba(255,255,255,0.08)] shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <CalendarCheck className="w-4 h-4 text-[#C7C3BA]" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-[#C7C3BA]">Bookings</span>
          </div>
          <span className="text-xl font-bold text-[#F2EEE3]">{totalBookings}</span>
        </GlassPanel>
        <GlassPanel className="p-4 rounded-[20px] flex flex-col justify-center glass-panel-secondary border border-[rgba(255,255,255,0.08)] shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-[#F59E0B]" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-[#C7C3BA]">Active Guests</span>
          </div>
          <span className="text-xl font-bold text-[#F2EEE3]">{activeGuestsCount}</span>
        </GlassPanel>
        <GlassPanel className="p-4 rounded-[20px] flex flex-col justify-center glass-panel-secondary border border-[rgba(255,255,255,0.08)] shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-[#C7C3BA]">Checked In</span>
          </div>
          <span className="text-xl font-bold text-[#F2EEE3]">{checkedInCount}</span>
        </GlassPanel>
        <GlassPanel className="p-4 rounded-[20px] flex flex-col justify-center glass-panel-secondary border border-[rgba(255,255,255,0.08)] shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-[#F59E0B]" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-[#C7C3BA]">Upcoming</span>
          </div>
          <span className="text-xl font-bold text-[#F2EEE3]">{upcomingCount}</span>
        </GlassPanel>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 md:text-[#96928A] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search guests, phones, or rooms..."
            className="w-full bg-white md:bg-[rgba(0,0,0,0.2)] border border-gray-200 md:border-[rgba(255,255,255,0.08)] rounded-xl pl-9 pr-4 py-2.5 text-xs text-gray-900 md:text-[#F5F1E8] placeholder-gray-400 md:placeholder-[#96928A] outline-none focus:border-[rgba(255,255,255,0.2)] transition-colors"
          />
        </div>
        <select 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white md:bg-[rgba(0,0,0,0.2)] border border-gray-200 md:border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-2.5 text-xs text-gray-900 md:text-[#F5F1E8] outline-none"
        >
          <option value="All">All Statuses</option>
          <option value="Confirmed">Confirmed</option>
          <option value="Checked In">Checked In</option>
          <option value="Checked Out">Checked Out</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <select 
          value={roomFilter} 
          onChange={(e) => setRoomFilter(e.target.value)}
          className="bg-white md:bg-[rgba(0,0,0,0.2)] border border-gray-200 md:border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-2.5 text-xs text-gray-900 md:text-[#F5F1E8] outline-none"
        >
          <option value="All">All Rooms</option>
          {uniqueRooms.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select 
          value={sortBy} 
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-white md:bg-[rgba(0,0,0,0.2)] border border-gray-200 md:border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-2.5 text-xs text-gray-900 md:text-[#F5F1E8] outline-none"
        >
          <option value="Newest">Newest First</option>
          <option value="Oldest">Oldest First</option>
          <option value="Check-in">Check-in Date</option>
          <option value="Amount">Amount (High to Low)</option>
        </select>
      </div>

      <GlassPanel className="p-0 md:p-1 rounded-[24px] bg-transparent border-transparent md:bg-[rgba(255,255,255,0.02)] md:border-[rgba(255,255,255,0.05)] shadow-none md:shadow-lg overflow-hidden">
        
        {/* Mobile View (Cards) */}
        <div className="md:hidden flex flex-col gap-3 pb-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Loader2 className="w-6 h-6 text-[#F59E0B] animate-spin" />
              <span className="text-gray-500 text-xs">Loading directory...</span>
            </div>
          ) : fetchError ? (
            <div className="bg-white border border-gray-100 shadow-sm rounded-[20px] p-8 flex flex-col items-center justify-center gap-3 text-center">
              <div className="text-rose-600 font-bold text-sm">Unable to load directory</div>
              <button onClick={fetchBookings} className="px-4 py-2 bg-gray-100 rounded-lg text-xs font-bold">Retry</button>
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="bg-white border border-gray-100 shadow-sm rounded-[20px] p-8 flex flex-col items-center justify-center gap-2 text-center">
              <User className="w-5 h-5 text-gray-400 mb-1" />
              <div className="text-gray-700 font-bold text-sm">No bookings found</div>
            </div>
          ) : (
            filteredBookings.map((booking) => {
              const primaryGuest = getPrimaryGuest(booking.guests);
              const nights = calculateNights(booking.check_in, booking.check_out);
              const isExpanded = expandedBookingId === booking.id;

              return (
                <div key={booking.id} className="bg-white border border-gray-100 shadow-sm rounded-[20px] p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm">{primaryGuest.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-[#F59E0B] uppercase tracking-wider font-bold bg-[#F59E0B]/10 px-2 py-0.5 rounded-full">
                          Primary
                        </span>
                        <span className="text-[10px] text-gray-500 font-medium">
                          {booking.guests.length > 1 ? `+${booking.guests.length - 1} guests` : '1 guest'}
                        </span>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase border ${getStatusColor(booking.status)}`}>
                      {booking.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <div>
                      <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Room & Stay</div>
                      <div className="text-xs font-bold text-gray-700">{booking.room_name}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {formatISTCompactDate(booking.check_in)} → {formatISTCompactDate(booking.check_out)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Amount</div>
                      <div className="text-xs font-bold text-gray-700">₹{booking.total_amount.toLocaleString("en-IN")}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{nights} {nights === 1 ? 'Night' : 'Nights'}</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => setViewingBooking(booking)}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-xs font-bold transition-colors"
                    >
                      View Details
                    </button>
                    <button 
                      onClick={() => toggleExpand(booking.id)}
                      className="px-3 bg-gray-50 border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-2 pt-3 border-t border-gray-100 animate-in slide-in-from-top-2">
                      <div className="text-[10px] font-bold uppercase text-gray-400 mb-2">Guests in this booking</div>
                      <div className="flex flex-col gap-2">
                        {booking.guests.map((g, i) => (
                          <div key={g.id || i} className="flex items-center justify-between bg-white border border-gray-100 p-2 rounded-lg">
                            <div>
                              <div className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                                <UserCircle2 className="w-3.5 h-3.5 text-gray-400" />
                                {g.name}
                                {g.is_primary && <span className="text-[8px] text-[#F59E0B] uppercase font-bold ml-1">Primary</span>}
                              </div>
                              <div className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3" />
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
              <tr className="border-b border-[rgba(255,255,255,0.05)] text-[10px] uppercase tracking-widest text-[#96928A]">
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
                <tr><td colSpan={6} className="px-6 py-16 text-center text-[#96928A]"><Loader2 className="w-6 h-6 text-[#F59E0B] animate-spin mx-auto" /></td></tr>
              ) : fetchError ? (
                <tr><td colSpan={6} className="px-6 py-16 text-center text-[#FF6978] font-bold">Unable to load directory</td></tr>
              ) : filteredBookings.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-16 text-center text-[#96928A]">No bookings found.</td></tr>
              ) : (
                filteredBookings.map((booking) => {
                  const primaryGuest = getPrimaryGuest(booking.guests);
                  const nights = calculateNights(booking.check_in, booking.check_out);
                  const isExpanded = expandedBookingId === booking.id;

                  return (
                    <React.Fragment key={booking.id}>
                      <tr className="group transition-colors hover:bg-[rgba(255,255,255,0.02)] border-b border-[rgba(255,255,255,0.03)]">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[rgba(255,255,255,0.05)] flex items-center justify-center shrink-0">
                              <User className="w-5 h-5 text-[#C7C3BA]" />
                            </div>
                            <div>
                              <div className="font-bold text-[#F5F1E8]">{primaryGuest.name}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] text-[#F59E0B] tracking-wider uppercase font-bold border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-1.5 py-0.5 rounded">
                                  Primary
                                </span>
                                <span className="text-[10px] text-[#96928A] font-medium">
                                  {booking.guests.length > 1 ? `+${booking.guests.length - 1} Guests` : '1 Guest'}
                                </span>
                              </div>
                              <div className="text-xs text-[#96928A] flex items-center gap-1 mt-1">
                                <Phone className="w-3 h-3" />
                                {primaryGuest.phone || "N/A"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-[#F2EEE3]">{booking.room_name}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-[#C7C3BA] text-xs font-medium flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-[#96928A]" />
                            {formatISTCompactDate(booking.check_in)} → {formatISTCompactDate(booking.check_out)}
                          </div>
                          <div className="text-[10px] text-[#96928A] mt-0.5 ml-5">{nights} {nights === 1 ? 'Night' : 'Nights'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold tracking-widest uppercase border ${getStatusColor(booking.status)}`}>
                            {booking.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-[#F5F1E8] flex items-center gap-1">
                            <IndianRupee className="w-3 h-3 text-[#96928A]" />
                            {booking.total_amount.toLocaleString("en-IN")}
                          </div>
                          <div className="text-[10px] text-[#96928A] mt-0.5 truncate max-w-[100px]">{booking.partner_name}</div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => setViewingBooking(booking)}
                              className="px-3 py-1.5 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] text-[#F5F1E8] rounded-lg text-xs font-bold transition-colors"
                            >
                              View Details
                            </button>
                            <button 
                              onClick={() => toggleExpand(booking.id)}
                              className="p-1.5 bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)] text-[#C7C3BA] rounded-lg border border-[rgba(255,255,255,0.05)] transition-colors flex items-center gap-1"
                            >
                              <Users className="w-3.5 h-3.5" />
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-[rgba(0,0,0,0.2)] border-b border-[rgba(255,255,255,0.03)]">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="flex flex-col gap-3 animate-in slide-in-from-top-2">
                              <div className="text-[10px] font-bold uppercase tracking-widest text-[#96928A] flex items-center gap-2">
                                <Info className="w-3.5 h-3.5" />
                                Guests in this booking ({booking.guests.length})
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {booking.guests.map((g, i) => (
                                  <div key={g.id || i} className="flex items-start gap-3 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] p-3 rounded-xl">
                                    <UserCircle2 className="w-5 h-5 text-[#96928A] shrink-0 mt-0.5" />
                                    <div>
                                      <div className="text-sm font-bold text-[#F5F1E8] flex items-center gap-2">
                                        {g.name}
                                        {g.is_primary && <span className="text-[8px] text-[#F59E0B] uppercase font-bold border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-1 rounded">Primary</span>}
                                      </div>
                                      <div className="text-xs text-[#C7C3BA] flex items-center gap-1 mt-1">
                                        <Phone className="w-3 h-3 text-[#96928A]" />
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
      </GlassPanel>

      {/* Inline Booking Details Modal */}
      {viewingBooking && (
        <GlassModal isOpen={!!viewingBooking} onClose={() => setViewingBooking(null)} title="Booking Details">
          <div className="p-6 md:p-8 flex flex-col gap-6 w-full max-w-2xl mx-auto overflow-hidden">
            <div>
              <h3 className="text-lg md:text-xl font-bold text-gray-900 md:text-[#F5F1E8] mb-1">Booking Details</h3>
              <p className="text-sm text-gray-500 md:text-[#96928A]">Comprehensive view of the stay and all guests.</p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 md:bg-[rgba(255,255,255,0.02)] p-4 rounded-xl border border-gray-100 md:border-[rgba(255,255,255,0.05)]">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 md:text-[#96928A] block mb-1">Room</span>
                <span className="text-sm font-bold text-gray-900 md:text-[#F2EEE3]">{viewingBooking.room_name}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 md:text-[#96928A] block mb-1">Stay</span>
                <span className="text-sm font-bold text-gray-900 md:text-[#F2EEE3]">{formatISTCompactDate(viewingBooking.check_in)} → {formatISTCompactDate(viewingBooking.check_out)}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 md:text-[#96928A] block mb-1">Amount</span>
                <span className="text-sm font-bold text-gray-900 md:text-[#F2EEE3]">₹{viewingBooking.total_amount.toLocaleString("en-IN")}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 md:text-[#96928A] block mb-1">Partner</span>
                <span className="text-sm font-bold text-gray-900 md:text-[#F2EEE3] truncate block">{viewingBooking.partner_name}</span>
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto hide-scrollbar">
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 md:text-[#C7C3BA] mb-3">Guests in this booking ({viewingBooking.guests.length})</h4>
              <div className="flex flex-col gap-2">
                {viewingBooking.guests.map((g, idx) => (
                  <div key={g.id || idx} className="flex items-center gap-4 bg-white md:bg-[rgba(255,255,255,0.03)] border border-gray-100 md:border-[rgba(255,255,255,0.05)] p-3 rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-gray-100 md:bg-[rgba(255,255,255,0.05)] flex items-center justify-center shrink-0">
                      <UserCircle2 className="w-4 h-4 text-gray-400 md:text-[#96928A]" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900 md:text-[#F5F1E8]">{g.name}</span>
                        {g.is_primary && (
                          <span className="text-[9px] text-[#F59E0B] tracking-wider uppercase font-bold border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-1.5 py-0.5 rounded">
                            Primary Guest
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 md:text-[#96928A] flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />
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
                className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 md:bg-[rgba(255,255,255,0.1)] md:hover:bg-[rgba(255,255,255,0.15)] md:text-white rounded-xl text-sm font-bold transition-colors"
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
