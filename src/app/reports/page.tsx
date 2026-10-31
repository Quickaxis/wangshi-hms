"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useHMSContext } from "@/components/providers/HMSProvider";
import { GlassPanel } from "@/components/ui/GlassPanel";
import {
  BarChart3,
  IndianRupee,
  BookOpen,
  DoorClosed,
  CheckCircle2,
  TrendingUp,
  Briefcase,
  Users,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DbBooking } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PartnerStat {
  partnerId: string;
  partnerName: string;
  totalBookings: number;
  totalRevenue: number;
  confirmedBookings: number;
  checkedInBookings: number;
}

export default function ReportsPage() {
  const { rooms } = useHMSContext();
  const [allBookings, setAllBookings] = useState<DbBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [timeRange, setTimeRange] = useState<"all" | "30days" | "thisMonth">("all");

  const supabase = useMemo(() => createClient(), []);

  const fetchReportsData = useCallback(async () => {
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
          created_at,
          partners ( id, name ),
          rooms ( name )
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Reports bookings error:", error);
      } else if (data) {
        setAllBookings(data as unknown as DbBooking[]);
      }
    } catch (err) {
      console.error("Reports fetch exception:", err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchReportsData();

    const channel = supabase
      .channel("reports-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        fetchReportsData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchReportsData]);

  // Scoped to selected homestay rooms
  const homestayRoomIds = useMemo(() => new Set(rooms.map((r) => r.id)), [rooms]);
  const homestayBookings = useMemo(() => {
    if (rooms.length === 0) return allBookings;
    return allBookings.filter((b) => homestayRoomIds.has(b.room_id));
  }, [allBookings, homestayRoomIds, rooms.length]);

  // Filter by selected date range
  const dateFilteredBookings = useMemo(() => {
    if (timeRange === "all") return homestayBookings;

    const now = new Date();
    if (timeRange === "30days") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      const threshold = thirtyDaysAgo.toISOString().split("T")[0];
      return homestayBookings.filter((b) => b.check_in >= threshold || b.created_at >= threshold);
    }

    if (timeRange === "thisMonth") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      return homestayBookings.filter((b) => b.check_in >= monthStart || b.created_at >= monthStart);
    }

    return homestayBookings;
  }, [homestayBookings, timeRange]);

  // Calculations
  const nonCancelledBookings = useMemo(
    () => dateFilteredBookings.filter((b) => b.status !== "cancelled"),
    [dateFilteredBookings]
  );

  const totalRevenue = useMemo(
    () => nonCancelledBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0),
    [nonCancelledBookings]
  );

  const activeBookingsCount = useMemo(
    () => dateFilteredBookings.filter((b) => b.status === "confirmed" || b.status === "checked_in").length,
    [dateFilteredBookings]
  );

  const activeRooms = useMemo(() => rooms.filter((r) => r.is_active !== false), [rooms]);
  const availableRoomsCount = useMemo(() => rooms.filter((r) => r.is_active !== false && r.status === "available").length, [rooms]);
  const bookedRoomsCount = useMemo(() => rooms.filter((r) => r.status === "booked").length, [rooms]);
  const occupancyRate = activeRooms.length > 0 ? Math.round((bookedRoomsCount / activeRooms.length) * 100) : 0;

  // Partner aggregations
  const partnerStats = useMemo(() => {
    const map = new Map<string, PartnerStat>();

    nonCancelledBookings.forEach((b) => {
      const pId = b.partner_id || "unknown";
      const pName = b.partners?.name || "Partner";

      if (!map.has(pId)) {
        map.set(pId, {
          partnerId: pId,
          partnerName: pName,
          totalBookings: 0,
          totalRevenue: 0,
          confirmedBookings: 0,
          checkedInBookings: 0,
        });
      }

      const stat = map.get(pId)!;
      stat.totalBookings += 1;
      stat.totalRevenue += b.total_amount || 0;
      if (b.status === "confirmed") stat.confirmedBookings += 1;
      if (b.status === "checked_in") stat.checkedInBookings += 1;
    });

    return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [nonCancelledBookings]);

  return (
    <div className="flex flex-col h-full overflow-y-auto hide-scrollbar space-y-6 md:space-y-8 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold md:font-medium text-[#24213A]">Reports & Analytics</h2>
          <p className="text-[#77758F] mt-1 text-xs md:text-sm tracking-wide">
            Live property and partner performance calculated from Supabase bookings.
          </p>
        </div>

        {/* Date Range Selector */}
        <div className="flex items-center p-1 bg-[#FFFFFF] border border-[#E8E7F2] rounded-2xl text-xs shadow-sm">
          <button
            type="button"
            onClick={() => setTimeRange("all")}
            className={cn(
              "px-3 py-1.5 rounded-xl font-semibold transition-colors cursor-pointer",
              timeRange === "all"
                ? "bg-[#5146D8] text-white shadow-sm"
                : "text-[#77758F] hover:text-[#24213A]"
            )}
          >
            All Time
          </button>
          <button
            type="button"
            onClick={() => setTimeRange("30days")}
            className={cn(
              "px-3 py-1.5 rounded-xl font-semibold transition-colors cursor-pointer",
              timeRange === "30days"
                ? "bg-[#5146D8] text-white shadow-sm"
                : "text-[#77758F] hover:text-[#24213A]"
            )}
          >
            Last 30 Days
          </button>
          <button
            type="button"
            onClick={() => setTimeRange("thisMonth")}
            className={cn(
              "px-3 py-1.5 rounded-xl font-semibold transition-colors cursor-pointer",
              timeRange === "thisMonth"
                ? "bg-[#5146D8] text-white shadow-sm"
                : "text-[#77758F] hover:text-[#24213A]"
            )}
          >
            This Month
          </button>
        </div>
      </div>

      {/* Top 3 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Total Revenue */}
        <GlassPanel className="p-4 sm:p-5 md:p-6 rounded-[20px] md:rounded-[24px] bg-[#FFFFFF] border border-[#E8E7F2] shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 md:p-6 opacity-5 pointer-events-none">
            <IndianRupee className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 text-[#5146D8]" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3 md:mb-4">
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-[#F0EEFF] flex items-center justify-center border border-[#E0DEF8] shrink-0">
                <IndianRupee className="w-4 h-4 md:w-5 md:h-5 text-[#5146D8]" />
              </div>
              <h3 className="text-xs md:text-sm font-semibold tracking-widest text-[#77758F] uppercase">
                Total Revenue
              </h3>
            </div>
            <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#24213A] tracking-tight">
              ₹{totalRevenue.toLocaleString("en-IN")}
            </div>
            <div className="mt-2.5 md:mt-3 flex items-center gap-2 text-xs font-medium text-[#059669]">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Verified stays revenue</span>
            </div>
          </div>
        </GlassPanel>

        {/* Current Occupancy */}
        <GlassPanel className="p-4 sm:p-5 md:p-6 rounded-[20px] md:rounded-[24px] bg-[#FFFFFF] border border-[#E8E7F2] shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 md:p-6 opacity-5 pointer-events-none">
            <BarChart3 className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 text-[#5146D8]" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3 md:mb-4">
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-[#F0EEFF] flex items-center justify-center border border-[#E0DEF8] shrink-0">
                <BarChart3 className="w-4 h-4 md:w-5 md:h-5 text-[#5146D8]" />
              </div>
              <h3 className="text-xs md:text-sm font-semibold tracking-widest text-[#77758F] uppercase">
                Today's Occupancy
              </h3>
            </div>
            <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#24213A] tracking-tight">
              {occupancyRate}%
            </div>
            <div className="mt-2.5 md:mt-3 w-full h-1.5 bg-[#F7F7FC] border border-[#E8E7F2] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#5146D8] to-[#8B83F6] rounded-full transition-all duration-500"
                style={{ width: `${occupancyRate}%` }}
              />
            </div>
          </div>
        </GlassPanel>

        {/* Total Bookings */}
        <GlassPanel className="p-4 sm:p-5 md:p-6 rounded-[20px] md:rounded-[24px] bg-[#FFFFFF] border border-[#E8E7F2] shadow-sm relative overflow-hidden sm:col-span-2 lg:col-span-1">
          <div className="absolute top-0 right-0 p-4 md:p-6 opacity-5 pointer-events-none">
            <BookOpen className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 text-[#5146D8]" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3 md:mb-4">
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-[#F0EEFF] flex items-center justify-center border border-[#E0DEF8] shrink-0">
                <BookOpen className="w-4 h-4 md:w-5 md:h-5 text-[#5146D8]" />
              </div>
              <h3 className="text-xs md:text-sm font-semibold tracking-widest text-[#77758F] uppercase">
                Active Bookings
              </h3>
            </div>
            <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#24213A] tracking-tight">
              {activeBookingsCount}
            </div>
            <p className="mt-2.5 md:mt-3 text-xs text-[#77758F]">Confirmed & checked-in stays</p>
          </div>
        </GlassPanel>
      </div>

      {/* Room Status Split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GlassPanel className="p-6 rounded-[24px] bg-[#FFFFFF] border border-[#E8E7F2] shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#ECFDF5] flex items-center justify-center border border-[#A7F3D0]">
              <CheckCircle2 className="w-6 h-6 text-[#059669]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-widest text-[#77758F] uppercase">
                Available Today
              </h3>
              <p className="text-xs text-[#77758F] mt-1">Ready for check-in</p>
            </div>
          </div>
          <div className="text-3xl font-semibold text-[#059669]">{availableRoomsCount}</div>
        </GlassPanel>

        <GlassPanel className="p-6 rounded-[24px] bg-[#FFFFFF] border border-[#E8E7F2] shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#FEF2F2] flex items-center justify-center border border-[#FECACA]">
              <DoorClosed className="w-6 h-6 text-[#DC2626]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-widest text-[#77758F] uppercase">
                Booked Today
              </h3>
              <p className="text-xs text-[#77758F] mt-1">Currently occupied</p>
            </div>
          </div>
          <div className="text-3xl font-semibold text-[#DC2626]">{bookedRoomsCount}</div>
        </GlassPanel>
      </div>

      {/* Partner Tracking Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-[0.2em] text-[#24213A] uppercase">
            Partner Performance & Attribution
          </h3>
          <span className="text-xs text-[#77758F]">Linked via partner_id foreign key</span>
        </div>

        <GlassPanel className="p-0 rounded-[20px] md:rounded-[24px] bg-[#FFFFFF] border border-[#E8E7F2] shadow-sm overflow-hidden">
          <div className="w-full overflow-x-auto hide-scrollbar">
            <table className="w-full text-left border-collapse min-w-[550px]">
              <thead>
                <tr className="border-b border-[#E8E7F2] bg-[#F7F7FC] text-[10px] uppercase tracking-widest text-[#77758F]">
                  <th className="px-6 py-4 font-semibold">Partner</th>
                  <th className="px-6 py-4 font-semibold">Total Stays Booked</th>
                  <th className="px-6 py-4 font-semibold">Active Stays</th>
                  <th className="px-6 py-4 font-semibold text-right">Revenue Generated</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-[#77758F]">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 text-[#5146D8] animate-spin" />
                        <span>Loading partner statistics...</span>
                      </div>
                    </td>
                  </tr>
                ) : partnerStats.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-[#77758F]">
                      No partner bookings recorded yet.
                    </td>
                  </tr>
                ) : (
                  partnerStats.map((stat) => (
                    <tr
                      key={stat.partnerId}
                      className="border-b border-[#E8E7F2] hover:bg-[#F7F7FC] transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-[#24213A] flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#F0EEFF] flex items-center justify-center text-[#5146D8] font-bold text-xs uppercase border border-[#E0DEF8]">
                          {stat.partnerName.slice(0, 2)}
                        </div>
                        <span>{stat.partnerName}</span>
                      </td>
                      <td className="px-6 py-4 text-[#77758F]">{stat.totalBookings}</td>
                      <td className="px-6 py-4">
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#ECFDF5] text-[#059669] font-medium border border-[#A7F3D0]">
                          {stat.confirmedBookings + stat.checkedInBookings} active
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-[#5146D8]">
                        ₹{stat.totalRevenue.toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
