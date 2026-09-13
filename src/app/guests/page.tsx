"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { User, Phone, Calendar, IndianRupee, BedDouble, Search, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatISTDateTime, formatISTCompactDate, combineDateAndTime } from "@/lib/dateUtils";

interface GuestDirectoryItem {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  booking: {
    id: string;
    check_in: string;
    check_out: string;
    status: string;
    total_amount: number;
    room_name: string;
  };
}

export default function GuestsPage() {
  const [guests, setGuests] = useState<GuestDirectoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const supabase = useMemo(() => createClient(), []);

  const fetchGuests = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("guests")
        .select(`
          id,
          name,
          phone,
          email,
          is_primary,
          bookings (
            id,
            check_in,
            check_out,
            status,
            total_amount,
            rooms ( name )
          )
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Guests fetch error:", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code
        });
        setFetchError(error.message || "Unable to load guests");
      } else if (data) {
        setFetchError(null);
        const mapped: GuestDirectoryItem[] = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          phone: item.phone,
          email: item.email,
          is_primary: item.is_primary,
          booking: {
            id: item.bookings?.id || "",
            check_in: item.bookings?.check_in || "",
            check_out: item.bookings?.check_out || "",
            status: item.bookings?.status || "confirmed",
            total_amount: item.bookings?.total_amount || 0,
            room_name: item.bookings?.rooms?.name || "Room",
          },
        }));
        setGuests(mapped);
      }
    } catch (err: any) {
      console.error("Guests fetch exception:", err);
      setFetchError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchGuests();

    const channel = supabase
      .channel("guests-page-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "guests" }, () => {
        fetchGuests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchGuests]);

  const filteredGuests = useMemo(() => {
    if (!searchQuery.trim()) return guests;
    const q = searchQuery.toLowerCase().trim();
    return guests.filter((g) => {
      return (
        g.name.toLowerCase().includes(q) ||
        (g.phone && g.phone.includes(q)) ||
        g.booking.room_name.toLowerCase().includes(q)
      );
    });
  }, [guests, searchQuery]);

  return (
    <div className="flex flex-col h-full overflow-y-auto hide-scrollbar space-y-6 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 md:text-[#F5F1E8]">Guest Directory</h2>
          <p className="text-gray-500 md:text-[#96928A] mt-1 text-xs md:text-sm tracking-wide">
            View all guest records and contact information.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-gray-400 md:text-[#96928A] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone, or room..."
            className="w-full bg-white md:bg-[rgba(0,0,0,0.2)] border border-gray-200 md:border-[rgba(255,255,255,0.08)] rounded-xl pl-9 pr-4 py-2 text-xs text-gray-900 md:text-[#F5F1E8] placeholder-gray-400 md:placeholder-[#96928A] outline-none focus:border-gray-300 md:focus:border-[rgba(255,255,255,0.2)] transition-colors shadow-sm md:shadow-none"
          />
        </div>
      </div>

      <GlassPanel className="p-0 md:p-1 rounded-[24px] bg-transparent border-transparent md:bg-[rgba(255,255,255,0.02)] md:border-[rgba(255,255,255,0.05)] shadow-none md:shadow-lg overflow-hidden">
        
        {/* Mobile View (Cards) */}
        <div className="md:hidden flex flex-col gap-3 pb-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Loader2 className="w-6 h-6 text-[#F59E0B] animate-spin" />
              <span className="text-gray-500 text-xs">Loading guests...</span>
            </div>
          ) : fetchError ? (
            <div className="bg-white border border-gray-100 shadow-sm rounded-[20px] p-8 flex flex-col items-center justify-center gap-3 text-center">
              <div className="text-rose-600 font-bold text-sm">Unable to load guests</div>
              <button 
                onClick={fetchGuests}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors"
              >
                Retry
              </button>
            </div>
          ) : filteredGuests.length === 0 ? (
            <div className="bg-white border border-gray-100 shadow-sm rounded-[20px] p-8 flex flex-col items-center justify-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-1">
                <User className="w-5 h-5 text-gray-400" />
              </div>
              <div className="text-gray-700 font-bold text-sm">No guests found</div>
              <div className="text-xs text-gray-400 font-medium">Your directory is empty.</div>
            </div>
          ) : (
            filteredGuests.map((item) => (
              <div key={item.id} className="bg-white border border-gray-100 shadow-sm rounded-[20px] p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-gray-900 text-sm truncate">{item.name}</h4>
                      {item.is_primary && (
                        <span className="text-[9px] text-[#F59E0B] uppercase tracking-wider font-bold">
                          Primary
                        </span>
                      )}
                    </div>
                    {item.phone ? (
                      <div className="text-xs text-gray-500 font-medium mt-0.5 flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {item.phone}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 font-medium mt-0.5">No phone provided</div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-xl p-3 mt-1 border border-gray-100">
                  <div>
                    <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Room</div>
                    <div className="text-xs font-bold text-gray-700 flex items-center gap-1">
                      <BedDouble className="w-3.5 h-3.5" />
                      {item.booking.room_name}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Stay Dates</div>
                    <div className="text-[10px] font-medium text-gray-600 leading-tight">
                      {formatISTCompactDate(item.booking.check_in)} • 12:00 PM
                      <br />
                      {formatISTCompactDate(item.booking.check_out)} • 11:00 AM
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop View (Table) */}
        <div className="hidden md:block w-full overflow-x-auto hide-scrollbar">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.05)] text-[10px] uppercase tracking-widest text-[#96928A]">
                <th className="px-6 py-4 font-semibold">Guest Name</th>
                <th className="px-6 py-4 font-semibold">Phone</th>
                <th className="px-6 py-4 font-semibold">Room</th>
                <th className="px-6 py-4 font-semibold">Stay Dates</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Total Amount</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-[#96928A]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 text-[#F59E0B] animate-spin" />
                      <span>Loading guests...</span>
                    </div>
                  </td>
                </tr>
              ) : fetchError ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-[#96928A]">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <span className="text-[#FF6978] font-bold">Unable to load guests</span>
                      <button 
                        onClick={fetchGuests}
                        className="px-4 py-2 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] text-white rounded-lg text-xs font-bold transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredGuests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-[#96928A]">
                    No guests found in directory.
                  </td>
                </tr>
              ) : (
                filteredGuests.map((item) => (
                  <tr
                    key={item.id}
                    className="group transition-colors hover:bg-[rgba(255,255,255,0.02)] border-b border-[rgba(255,255,255,0.03)]"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.05)] flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-[#C7C3BA]" />
                        </div>
                        <div>
                          <div className="font-medium text-[#F5F1E8]">{item.name}</div>
                          {item.is_primary && (
                            <div className="text-[10px] text-[#F59E0B] mt-0.5 tracking-wider uppercase font-semibold">
                              Primary Guest
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-[#96928A]" />
                        <span className="text-[#C7C3BA]">{item.phone || "N/A"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <BedDouble className="w-4 h-4 text-[#96928A]" />
                        <span className="font-medium text-[#F2EEE3]">
                          {item.booking.room_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#96928A]" />
                        <div className="flex flex-col text-[#C7C3BA] text-xs">
                          <span>
                            {formatISTCompactDate(item.booking.check_in)} • 12:00 PM
                          </span>
                          <span>
                            {formatISTCompactDate(item.booking.check_out)} • 11:00 AM
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-widest uppercase border bg-[rgba(255,255,255,0.05)] text-[#C7C3BA]">
                        {item.booking.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 font-medium text-[#F5F1E8]">
                        <IndianRupee className="w-3.5 h-3.5 text-[#96928A]" />
                        {item.booking.total_amount.toLocaleString("en-IN")}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </div>
  );
}
