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

  // Calculations
  const nonCancelledBookings = useMemo(
    () => allBookings.filter((b) => b.status !== "cancelled"),
    [allBookings]
  );

  const totalRevenue = useMemo(
    () => nonCancelledBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0),
    [nonCancelledBookings]
  );

  const activeBookingsCount = useMemo(
    () => allBookings.filter((b) => b.status === "confirmed" || b.status === "checked_in").length,
    [allBookings]
  );

  const availableRoomsCount = rooms.filter((r) => r.status === "available").length;
  const bookedRoomsCount = rooms.filter((r) => r.status === "booked").length;
  const occupancyRate = rooms.length > 0 ? Math.round((bookedRoomsCount / rooms.length) * 100) : 0;

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
    <div className="flex flex-col h-full overflow-y-auto hide-scrollbar space-y-8 pb-10">
      <div>
        <h2 className="text-2xl font-medium text-[#F5F1E8]">Reports & Analytics</h2>
        <p className="text-[#96928A] mt-1 text-sm tracking-wide">
          Live property and partner performance calculated from Supabase bookings.
        </p>
      </div>

      {/* Top 3 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Total Revenue */}
        <GlassPanel className="p-6 rounded-[24px] glass-panel-secondary relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <IndianRupee className="w-24 h-24 text-white" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[rgba(245,158,11,0.15)] flex items-center justify-center border border-[rgba(245,158,11,0.2)]">
                <IndianRupee className="w-5 h-5 text-[#F59E0B]" />
              </div>
              <h3 className="text-sm font-semibold tracking-widest text-[#96928A] uppercase">
                Total Revenue
              </h3>
            </div>
            <div className="text-4xl font-semibold text-[#F5F1E8] tracking-tight">
              ₹{totalRevenue.toLocaleString("en-IN")}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs font-medium text-[#4FE77B]">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Verified stays revenue</span>
            </div>
          </div>
        </GlassPanel>

        {/* Current Occupancy */}
        <GlassPanel className="p-6 rounded-[24px] glass-panel-secondary relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <BarChart3 className="w-24 h-24 text-white" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[rgba(255,255,255,0.05)] flex items-center justify-center border border-[rgba(255,255,255,0.1)]">
                <BarChart3 className="w-5 h-5 text-[#F2EEE3]" />
              </div>
              <h3 className="text-sm font-semibold tracking-widest text-[#96928A] uppercase">
                Today's Occupancy
              </h3>
            </div>
            <div className="text-4xl font-semibold text-[#F5F1E8] tracking-tight">
              {occupancyRate}%
            </div>
            <div className="mt-3 w-full h-1.5 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#F59E0B] to-[#FCD34D] rounded-full transition-all duration-500"
                style={{ width: `${occupancyRate}%` }}
              />
            </div>
          </div>
        </GlassPanel>

        {/* Total Bookings */}
        <GlassPanel className="p-6 rounded-[24px] glass-panel-secondary relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <BookOpen className="w-24 h-24 text-white" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[rgba(255,255,255,0.05)] flex items-center justify-center border border-[rgba(255,255,255,0.1)]">
                <BookOpen className="w-5 h-5 text-[#F2EEE3]" />
              </div>
              <h3 className="text-sm font-semibold tracking-widest text-[#96928A] uppercase">
                Active Bookings
              </h3>
            </div>
            <div className="text-4xl font-semibold text-[#F5F1E8] tracking-tight">
              {activeBookingsCount}
            </div>
            <p className="mt-3 text-xs text-[#96928A]">Confirmed & checked-in stays</p>
          </div>
        </GlassPanel>
      </div>

      {/* Room Status Split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GlassPanel className="p-6 rounded-[24px] glass-panel-secondary flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[rgba(79,231,123,0.1)] flex items-center justify-center border border-[rgba(79,231,123,0.2)]">
              <CheckCircle2 className="w-6 h-6 text-[#4FE77B]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-widest text-[#96928A] uppercase">
                Available Today
              </h3>
              <p className="text-xs text-[#96928A] mt-1">Ready for check-in</p>
            </div>
          </div>
          <div className="text-3xl font-semibold text-[#4FE77B]">{availableRoomsCount}</div>
        </GlassPanel>

        <GlassPanel className="p-6 rounded-[24px] glass-panel-secondary flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[rgba(255,105,120,0.1)] flex items-center justify-center border border-[rgba(255,105,120,0.2)]">
              <DoorClosed className="w-6 h-6 text-[#FF6978]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-widest text-[#96928A] uppercase">
                Booked Today
              </h3>
              <p className="text-xs text-[#96928A] mt-1">Currently occupied</p>
            </div>
          </div>
          <div className="text-3xl font-semibold text-[#FF6978]">{bookedRoomsCount}</div>
        </GlassPanel>
      </div>

      {/* Partner Tracking Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-[0.2em] text-[#C7C3BA] uppercase">
            Partner Performance & Attribution
          </h3>
          <span className="text-xs text-[#96928A]">Linked via partner_id foreign key</span>
        </div>

        <GlassPanel className="p-1 rounded-[24px] glass-panel-secondary border border-[rgba(255,255,255,0.05)] overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.05)] text-[10px] uppercase tracking-widest text-[#96928A]">
                <th className="px-6 py-4 font-semibold">Partner</th>
                <th className="px-6 py-4 font-semibold">Total Stays Booked</th>
                <th className="px-6 py-4 font-semibold">Active Stays</th>
                <th className="px-6 py-4 font-semibold text-right">Revenue Generated</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-[#96928A]">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 text-[#F59E0B] animate-spin" />
                      <span>Loading partner statistics...</span>
                    </div>
                  </td>
                </tr>
              ) : partnerStats.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-[#96928A]">
                    No partner bookings recorded yet.
                  </td>
                </tr>
              ) : (
                partnerStats.map((stat) => (
                  <tr
                    key={stat.partnerId}
                    className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-[#F5F1E8] flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[rgba(245,158,11,0.15)] flex items-center justify-center text-[#F59E0B] font-bold text-xs uppercase">
                        {stat.partnerName.slice(0, 2)}
                      </div>
                      <span>{stat.partnerName}</span>
                    </td>
                    <td className="px-6 py-4 text-[#C7C3BA]">{stat.totalBookings}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(79,231,123,0.1)] text-[#4FE77B]">
                        {stat.confirmedBookings + stat.checkedInBookings} active
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-[#F59E0B]">
                      ₹{stat.totalRevenue.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </GlassPanel>
      </div>
    </div>
  );
}
