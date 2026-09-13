"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { User, Phone, Calendar, IndianRupee, BedDouble, Search, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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
        console.error("Error fetching guests:", error);
      } else if (data) {
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
    } catch (err) {
      console.error("Guests fetch exception:", err);
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
          <h2 className="text-2xl font-medium text-[#F5F1E8]">Guest Directory</h2>
          <p className="text-[#96928A] mt-1 text-sm tracking-wide">
            View all guest records and contact information across stays.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-[#96928A] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone, or room..."
            className="w-full bg-[rgba(0,0,0,0.2)] border border-[rgba(255,255,255,0.08)] rounded-xl pl-9 pr-4 py-2 text-xs text-[#F5F1E8] placeholder-[#96928A] outline-none focus:border-[rgba(255,255,255,0.2)] transition-colors"
          />
        </div>
      </div>

      <GlassPanel className="p-1 rounded-[24px] glass-panel-secondary border border-[rgba(255,255,255,0.05)] overflow-hidden">
        <div className="w-full overflow-x-auto hide-scrollbar">
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
                      <span>Loading guest directory...</span>
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
                        <span className="text-[#C7C3BA] text-xs">
                          {item.booking.check_in} → {item.booking.check_out}
                        </span>
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
