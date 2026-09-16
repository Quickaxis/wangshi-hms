"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { GlassModal } from "@/components/ui/GlassModal";
import { Search, Loader2, Handshake, Mail, Calendar, Phone, CheckCircle2, UserCircle2, Info, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatISTCompactDate } from "@/lib/dateUtils";
import { useHMSContext } from "@/components/providers/HMSProvider";
import { Partner } from "@/lib/types";

// Extended interface for Partner including their fetched bookings
interface PartnerWithStats extends Partner {
  bookingCount: number;
  totalRevenue: number;
  recentBookings: any[];
}

export default function PartnersPage() {
  const { selectedHomestayId, userProfile } = useHMSContext();
  const [partners, setPartners] = useState<PartnerWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  
  // UI State
  const [viewingPartner, setViewingPartner] = useState<PartnerWithStats | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchPartners = useCallback(async () => {
    if (!selectedHomestayId) return;

    setIsLoading(true);
    try {
      // 1. Fetch partners belonging to this homestay (Tenant Isolation Enforced by RLS + App logic)
      const { data: partnersData, error: partnersError } = await supabase
        .from("partners")
        .select(`*`)
        .eq("homestay_id", selectedHomestayId)
        .order("name");

      if (partnersError) throw partnersError;

      if (!partnersData || partnersData.length === 0) {
        setPartners([]);
        setIsLoading(false);
        return;
      }

      const partnerIds = partnersData.map(p => p.id);

      // 2. Fetch all bookings created by these partners
      const { data: bookingsData, error: bookingsError } = await supabase
        .from("bookings")
        .select(`
          id,
          total_amount,
          status,
          check_in,
          check_out,
          created_at,
          partner_id,
          rooms ( name ),
          guests ( name, is_primary )
        `)
        .in("partner_id", partnerIds)
        .order("created_at", { ascending: false });

      if (bookingsError) throw bookingsError;

      // 3. Aggregate data
      const mappedPartners = partnersData.map((partner: any) => {
        const partnerBookings = bookingsData?.filter(b => b.partner_id === partner.id) || [];
        
        // Count bookings (exclude cancelled if we only want active, but normally we count all generated bookings or just successful ones)
        const validBookings = partnerBookings.filter(b => b.status !== "cancelled");
        const bookingCount = partnerBookings.length; // Count all including cancelled for total volume
        
        // Revenue is calculated from valid bookings
        const totalRevenue = validBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);

        return {
          ...partner,
          bookingCount,
          totalRevenue,
          recentBookings: partnerBookings.slice(0, 5) // keep up to 5 recent bookings for the details modal
        } as PartnerWithStats;
      });

      setPartners(mappedPartners);
    } catch (err: any) {
      console.error("Partners fetch error:", err);
      setFetchError(err.message || "Failed to load partners.");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, selectedHomestayId]);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  // Filtering
  const filteredPartners = useMemo(() => {
    if (!searchQuery.trim()) return partners;
    const q = searchQuery.toLowerCase().trim();
    return partners.filter(p => 
      p.name.toLowerCase().includes(q) || 
      (p.email && p.email.toLowerCase().includes(q))
    );
  }, [partners, searchQuery]);

  // Empty state handling
  if (!selectedHomestayId) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#F59E0B] animate-spin mb-4" />
        <p className="text-[#96928A]">Loading homestay context...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto hide-scrollbar space-y-6 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 md:text-[#F5F1E8]">Partners</h2>
          <p className="text-gray-500 md:text-[#96928A] mt-1 text-xs md:text-sm tracking-wide">
            Manage partners and booking sources for your homestay.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-gray-400 md:text-[#96928A] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search partners..."
            className="w-full bg-white md:bg-[rgba(0,0,0,0.2)] border border-gray-200 md:border-[rgba(255,255,255,0.08)] rounded-xl pl-9 pr-4 py-2.5 text-xs text-gray-900 md:text-[#F5F1E8] placeholder-gray-400 md:placeholder-[#96928A] outline-none focus:border-[rgba(255,255,255,0.2)] transition-colors"
          />
        </div>
      </div>

      <GlassPanel className="p-0 md:p-1 rounded-[24px] bg-transparent border-transparent md:bg-[rgba(255,255,255,0.02)] md:border-[rgba(255,255,255,0.05)] shadow-none md:shadow-lg overflow-hidden">
        
        {/* Mobile View (Cards) */}
        <div className="md:hidden flex flex-col gap-3 pb-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Loader2 className="w-6 h-6 text-[#F59E0B] animate-spin" />
              <span className="text-gray-500 text-xs">Loading partners...</span>
            </div>
          ) : fetchError ? (
            <div className="bg-white border border-gray-100 shadow-sm rounded-[20px] p-8 flex flex-col items-center justify-center gap-3 text-center">
              <div className="text-rose-600 font-bold text-sm">Unable to load partners</div>
              <button onClick={fetchPartners} className="px-4 py-2 bg-gray-100 rounded-lg text-xs font-bold">Retry</button>
            </div>
          ) : filteredPartners.length === 0 ? (
            <div className="bg-white border border-gray-100 shadow-sm rounded-[20px] p-8 flex flex-col items-center justify-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-1">
                <Handshake className="w-5 h-5 text-gray-400" />
              </div>
              <div className="text-gray-700 font-bold text-sm">
                {searchQuery ? "No partners found" : "No partners yet"}
              </div>
              <div className="text-xs text-gray-400 font-medium">
                {searchQuery ? "Try a different name or email." : "Partner accounts for this homestay will appear here."}
              </div>
            </div>
          ) : (
            filteredPartners.map((partner) => (
              <div key={partner.id} className="bg-white border border-gray-100 shadow-sm rounded-[20px] p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm">{partner.name}</h4>
                      <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3" />
                        {partner.email || "N/A"}
                      </div>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${partner.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                    {partner.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <div>
                    <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Bookings</div>
                    <div className="text-sm font-bold text-gray-700">{partner.bookingCount}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Revenue</div>
                    <div className="text-sm font-bold text-[#F59E0B]">₹{partner.totalRevenue.toLocaleString("en-IN")}</div>
                  </div>
                </div>

                <button 
                  onClick={() => setViewingPartner(partner)}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg text-xs font-bold transition-colors"
                >
                  View Details
                </button>
              </div>
            ))
          )}
        </div>

        {/* Desktop View (Table) */}
        <div className="hidden md:block w-full overflow-x-auto hide-scrollbar">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.05)] text-[10px] uppercase tracking-widest text-[#96928A]">
                <th className="px-6 py-4 font-semibold">Partner</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold text-center">Bookings</th>
                <th className="px-6 py-4 font-semibold text-right">Revenue</th>
                <th className="px-6 py-4 font-semibold text-center">Created</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-16 text-center text-[#96928A]"><Loader2 className="w-6 h-6 text-[#F59E0B] animate-spin mx-auto" /></td></tr>
              ) : fetchError ? (
                <tr><td colSpan={6} className="px-6 py-16 text-center text-[#FF6978] font-bold">Unable to load partners</td></tr>
              ) : filteredPartners.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-[#96928A]">
                    {searchQuery ? "No partners found matching search." : "No partner accounts exist for this homestay."}
                  </td>
                </tr>
              ) : (
                filteredPartners.map((partner) => (
                  <tr key={partner.id} className="group transition-colors hover:bg-[rgba(255,255,255,0.02)] border-b border-[rgba(255,255,255,0.03)]">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[rgba(255,255,255,0.05)] flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-[#C7C3BA]" />
                        </div>
                        <div>
                          <div className="font-bold text-[#F5F1E8]">{partner.name}</div>
                          <div className="text-[11px] text-[#96928A] flex items-center gap-1 mt-0.5">
                            <Mail className="w-3 h-3" />
                            {partner.email || "N/A"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                        partner.is_active 
                        ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/30' 
                        : 'bg-red-400/10 text-red-400 border-red-400/30'
                      }`}>
                        {partner.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-[#F2EEE3]">{partner.bookingCount}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-bold text-[#F59E0B]">₹{partner.totalRevenue.toLocaleString("en-IN")}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="text-[11px] text-[#C7C3BA] flex items-center justify-center gap-1">
                        <Calendar className="w-3 h-3 text-[#96928A]" />
                        {new Date(partner.created_at).toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => setViewingPartner(partner)}
                        className="px-4 py-1.5 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] text-[#F5F1E8] rounded-lg text-xs font-bold transition-colors"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassPanel>

      {/* Partner Details Modal */}
      {viewingPartner && (
        <GlassModal isOpen={!!viewingPartner} onClose={() => setViewingPartner(null)} title="Partner Details">
          <div className="p-6 md:p-8 flex flex-col gap-6 w-full max-w-2xl mx-auto overflow-hidden">
            
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl md:text-2xl font-bold text-gray-900 md:text-[#F5F1E8] mb-1">{viewingPartner.name}</h3>
                <div className="text-sm text-gray-500 md:text-[#96928A] flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  {viewingPartner.email || "No email provided"}
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                viewingPartner.is_active 
                ? 'bg-emerald-100 text-emerald-600 md:bg-emerald-400/10 md:text-emerald-400 md:border-emerald-400/30' 
                : 'bg-red-100 text-red-600 md:bg-red-400/10 md:text-red-400 md:border-red-400/30'
              }`}>
                {viewingPartner.is_active ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 bg-gray-50 md:bg-[rgba(255,255,255,0.02)] p-4 rounded-xl border border-gray-100 md:border-[rgba(255,255,255,0.05)]">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 md:text-[#96928A] block mb-1">Total Bookings</span>
                <span className="text-lg font-bold text-gray-900 md:text-[#F2EEE3]">{viewingPartner.bookingCount}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 md:text-[#96928A] block mb-1">Total Revenue</span>
                <span className="text-lg font-bold text-[#F59E0B]">₹{viewingPartner.totalRevenue.toLocaleString("en-IN")}</span>
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto hide-scrollbar">
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 md:text-[#C7C3BA] mb-3">
                Recent Bookings {viewingPartner.recentBookings.length === 0 && "(None)"}
              </h4>
              
              <div className="flex flex-col gap-2">
                {viewingPartner.recentBookings.map((booking) => {
                  const primaryGuest = booking.guests?.find((g: any) => g.is_primary) || booking.guests?.[0];
                  
                  return (
                    <div key={booking.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white md:bg-[rgba(255,255,255,0.03)] border border-gray-100 md:border-[rgba(255,255,255,0.05)] p-3 rounded-xl">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-gray-900 md:text-[#F5F1E8]">
                            {booking.rooms?.name || "Room"}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${
                            booking.status === "confirmed" ? "border-[#F59E0B]/30 text-[#F59E0B] bg-[#F59E0B]/10" :
                            booking.status === "checked_in" ? "border-emerald-400/30 text-emerald-400 bg-emerald-400/10" :
                            booking.status === "cancelled" ? "border-rose-400/30 text-rose-400 bg-rose-400/10" :
                            "border-blue-400/30 text-blue-400 bg-blue-400/10"
                          }`}>
                            {booking.status.replace("_", " ")}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-500 md:text-[#96928A] flex items-center gap-1.5">
                          <UserCircle2 className="w-3 h-3" />
                          {primaryGuest?.name || "Unknown Guest"}
                        </div>
                      </div>
                      
                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1">
                        <span className="text-sm font-bold text-gray-900 md:text-[#F2EEE3]">
                          ₹{booking.total_amount?.toLocaleString("en-IN") || 0}
                        </span>
                        <span className="text-[10px] text-gray-500 md:text-[#96928A] flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatISTCompactDate(booking.check_in)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-100 md:border-[rgba(255,255,255,0.05)]">
              <button 
                onClick={() => setViewingPartner(null)}
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
