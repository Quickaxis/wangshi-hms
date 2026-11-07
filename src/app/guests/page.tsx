"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { GlassModal } from "@/components/ui/GlassModal";
import { 
  User, Phone, Calendar, IndianRupee, BedDouble, Search, Loader2, 
  ChevronDown, ChevronUp, Clock, CalendarCheck, CheckCircle2, UserCircle2, 
  Info, Users, Download, ShieldCheck, FileText, UploadCloud, Trash2, 
  Check, X, AlertCircle, FileCheck2, Filter, Eye
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatISTCompactDate } from "@/lib/dateUtils";
import { useHMSContext } from "@/components/providers/HMSProvider";
import { cn } from "@/lib/utils";
import { exportGuestRegisterToExcel, GuestRegisterBookingItem } from "@/lib/excelExport";
import { 
  updateGuestKycAction, 
  uploadGuestIdDocumentAction, 
  removeGuestIdDocumentAction,
  getGuestProfileAndHistoryAction,
  getGuestDocumentSignedUrlAction
} from "@/app/actions/guests";
import { KycStatus, IdDocumentType } from "@/lib/types";

interface Guest {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  kyc_status?: KycStatus | null;
  id_type?: string | null;
  id_number_masked?: string | null;
  id_front_path?: string | null;
  id_back_path?: string | null;
  id_front_url?: string | null;
  id_back_url?: string | null;
  kyc_notes?: string | null;
  address?: string | null;
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
  const [kycFilter, setKycFilter] = useState("All");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [sortBy, setSortBy] = useState("Newest");
  
  // UI State
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  
  // Profile Drawer State
  const [profileGuest, setProfileGuest] = useState<Guest | null>(null);
  const [profileStayHistory, setProfileStayHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // KYC Verification Modal State
  const [kycModalGuest, setKycModalGuest] = useState<Guest | null>(null);
  const [kycForm, setKycForm] = useState<{
    id_type: string;
    id_number_masked: string;
    kyc_status: KycStatus;
    kyc_notes: string;
    address: string;
  }>({
    id_type: "aadhaar",
    id_number_masked: "",
    kyc_status: "not_uploaded",
    kyc_notes: "",
    address: ""
  });
  const [isSavingKyc, setIsSavingKyc] = useState(false);
  const [isUploadingFront, setIsUploadingFront] = useState(false);
  const [isUploadingBack, setIsUploadingBack] = useState(false);
  const [kycToast, setKycToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
          guests ( * )
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
            ...g,
            kyc_status: g.kyc_status || "not_uploaded",
            id_front_path: g.id_front_path || g.id_front_url || null,
            id_back_path: g.id_back_path || g.id_back_url || null,
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
          (g.phone && g.phone.includes(q))
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

    // KYC Filter
    if (kycFilter !== "All") {
      result = result.filter(b => b.guests.some(g => (g.kyc_status || "not_uploaded") === kycFilter));
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
  }, [bookings, searchQuery, statusFilter, roomFilter, kycFilter, startDateFilter, endDateFilter, sortBy]);

  const toggleExpand = (id: string) => {
    setExpandedBookingId(prev => prev === id ? null : id);
  };

  const getPrimaryGuest = (guests: Guest[]) => {
    return guests.find(g => g.is_primary) || guests[0] || { name: "Unknown", phone: null, id: "unknown" };
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

  const getKycBadge = (status?: KycStatus | null) => {
    switch(status) {
      case "verified":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]"><Check className="w-2.5 h-2.5" /> Verified</span>;
      case "pending":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]"><Clock className="w-2.5 h-2.5" /> Pending</span>;
      case "rejected":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]"><X className="w-2.5 h-2.5" /> Rejected</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#F7F7FC] text-[#77758F] border border-[#E8E7F2]">Not Uploaded</span>;
    }
  };

  const calculateNights = (inDate: string, outDate: string) => {
    const diff = new Date(outDate).getTime() - new Date(inDate).getTime();
    return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
  };

  // Open Guest Profile Drawer & load stay history
  const handleOpenGuestProfile = async (guest: Guest) => {
    setProfileGuest(guest);
    setIsLoadingHistory(true);
    setProfileStayHistory([]);
    try {
      if (guest.phone) {
        const res = await getGuestProfileAndHistoryAction(guest.phone, currentHomestay?.id);
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

  // Open KYC Modal
  const handleOpenKycModal = (guest: Guest) => {
    setKycModalGuest(guest);
    setKycForm({
      id_type: (guest as any).id_type || "aadhaar",
      id_number_masked: (guest as any).id_number_masked || "",
      kyc_status: (guest.kyc_status as KycStatus) || "not_uploaded",
      kyc_notes: (guest as any).kyc_notes || "",
      address: (guest as any).address || ""
    });
    setKycToast(null);
  };

  const handleSaveKycDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kycModalGuest) return;
    setIsSavingKyc(true);
    setKycToast(null);
    try {
      const res = await updateGuestKycAction({
        guestId: kycModalGuest.id,
        name: kycModalGuest.name,
        phone: kycModalGuest.phone || undefined,
        email: kycModalGuest.email || undefined,
        id_type: kycForm.id_type,
        id_number_masked: kycForm.id_number_masked,
        kyc_status: kycForm.kyc_status,
        kyc_notes: kycForm.kyc_notes,
        address: kycForm.address
      });

      if (res.success) {
        setKycToast({ type: 'success', text: res.message || "KYC details updated successfully." });
        await fetchBookings();
        setTimeout(() => {
          setKycModalGuest(null);
        }, 1200);
      } else {
        setKycToast({ type: 'error', text: res.error || "Failed to update KYC." });
      }
    } catch (err: any) {
      setKycToast({ type: 'error', text: err.message || "An unexpected error occurred." });
    } finally {
      setIsSavingKyc(false);
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, side: "front" | "back") => {
    const file = e.target.files?.[0];
    if (!file || !kycModalGuest) return;

    if (side === "front") setIsUploadingFront(true);
    else setIsUploadingBack(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("guestId", kycModalGuest.id);
      formData.append("documentSide", side);

      const res = await uploadGuestIdDocumentAction(formData);
      if (res.success) {
        setKycToast({ type: 'success', text: res.message || `${side.toUpperCase()} ID document uploaded.` });
        if (side === "front") {
          setKycModalGuest(prev => prev ? { ...prev, id_front_path: res.storagePath, id_front_url: res.storagePath } : null);
        } else {
          setKycModalGuest(prev => prev ? { ...prev, id_back_path: res.storagePath, id_back_url: res.storagePath } : null);
        }
        await fetchBookings();
      } else {
        setKycToast({ type: 'error', text: res.error || "Upload failed." });
      }
    } catch (err: any) {
      setKycToast({ type: 'error', text: err.message || "Error uploading document." });
    } finally {
      if (side === "front") setIsUploadingFront(false);
      else setIsUploadingBack(false);
    }
  };

  const handleViewDocument = async (side: "front" | "back") => {
    if (!kycModalGuest) return;
    try {
      const res = await getGuestDocumentSignedUrlAction(kycModalGuest.id, side);
      if (res.success && res.signedUrl) {
        window.open(res.signedUrl, "_blank", "noopener,noreferrer");
      } else {
        setKycToast({ type: 'error', text: res.error || "Unable to view document." });
      }
    } catch (err: any) {
      setKycToast({ type: 'error', text: err.message || "Error generating document link." });
    }
  };

  const handleRemoveDocument = async (side: "front" | "back") => {
    if (!kycModalGuest) return;
    try {
      const res = await removeGuestIdDocumentAction(kycModalGuest.id, side);
      if (res.success) {
        setKycToast({ type: 'success', text: res.message || "Document removed." });
        if (side === "front") {
          setKycModalGuest(prev => prev ? { ...prev, id_front_path: null, id_front_url: null } : null);
        } else {
          setKycModalGuest(prev => prev ? { ...prev, id_back_path: null, id_back_url: null } : null);
        }
        await fetchBookings();
      } else {
        setKycToast({ type: 'error', text: res.error || "Failed to remove document." });
      }
    } catch (err: any) {
      setKycToast({ type: 'error', text: err.message || "Error removing document." });
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
    <div className="flex flex-col h-full overflow-y-auto hide-scrollbar space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-[#24213A]">Reception Guest Register</h2>
          <p className="text-[#77758F] mt-1 text-xs md:text-sm tracking-wide">
            Guest directory, stay records, optional identification compliance, and verified exports.
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
              placeholder="Search by guest name, phone, or room..."
              className="w-full bg-[#F7F7FC] border border-[#E8E6F2] rounded-xl pl-9 pr-4 py-2 text-xs text-[#24213A] placeholder-[#8F8CA4] outline-none focus:border-[#5146D8] transition-colors"
            />
          </div>

          {/* Quick Filters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
              value={kycFilter} 
              onChange={(e) => setKycFilter(e.target.value)}
              className="bg-[#F7F7FC] border border-[#E8E6F2] rounded-xl px-2.5 py-2 text-xs text-[#24213A] outline-none focus:border-[#5146D8] truncate cursor-pointer"
            >
              <option value="All">All KYC Status</option>
              <option value="not_uploaded">Not Uploaded</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
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
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-[#24213A] text-sm">{primaryGuest.name}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] text-[#5146D8] font-bold bg-[#F0EEFF] px-2 py-0.5 rounded-full border border-[#E0DEF8]">
                          Primary
                        </span>
                        <span className="text-[10px] text-[#77758F]">
                          {booking.guests.length > 1 ? `+${booking.guests.length - 1} guests` : '1 guest'}
                        </span>
                      </div>
                    </div>
                    <span className={cn("px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase border", getStatusColor(booking.status))}>
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

                  <div className="flex items-center justify-between pt-1">
                    <div>{getKycBadge(primaryGuest.kyc_status)}</div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenGuestProfile(primaryGuest)}
                        className="px-3 py-1.5 bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8] rounded-lg text-xs font-bold"
                      >
                        Profile
                      </button>
                      <button
                        onClick={() => handleOpenKycModal(primaryGuest)}
                        className="px-3 py-1.5 bg-[#FFFFFF] border border-[#E8E6F2] text-[#24213A] rounded-lg text-xs font-bold"
                      >
                        KYC
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View (Table) */}
        <div className="hidden md:block w-full overflow-x-auto hide-scrollbar">
          <table className="w-full text-left border-collapse min-w-[950px]">
            <thead>
              <tr className="border-b border-[#E8E6F2] bg-[#F7F7FC] text-[10px] font-bold uppercase tracking-wider text-[#77758F]">
                <th className="px-5 py-3.5">Guest / Contact</th>
                <th className="px-5 py-3.5">Room</th>
                <th className="px-5 py-3.5">Stay Dates</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">KYC Status</th>
                <th className="px-5 py-3.5">Total Amount</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E6F2] text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-[#77758F]">
                    <Loader2 className="w-6 h-6 text-[#5146D8] animate-spin mx-auto mb-2" />
                    <span>Loading guest register...</span>
                  </td>
                </tr>
              ) : filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[#77758F]">
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
                            <div>
                              <div className="font-bold text-[#24213A]">{primaryGuest.name}</div>
                              <div className="text-[11px] text-[#77758F] flex items-center gap-1.5 mt-0.5">
                                <Phone className="w-3 h-3 text-[#77758F]" />
                                <span>{primaryGuest.phone || "No phone"}</span>
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
                          {getKycBadge(primaryGuest.kyc_status)}
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
                              onClick={() => handleOpenKycModal(primaryGuest)}
                              className="px-2.5 py-1 rounded-lg bg-[#FFFFFF] hover:bg-[#F7F7FC] border border-[#E8E6F2] text-[#24213A] font-bold text-xs transition-colors cursor-pointer"
                              title="Update ID & KYC"
                            >
                              KYC
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
                          <td colSpan={7} className="px-6 py-4">
                            <div className="space-y-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#77758F] block">
                                Guests in this reservation ({booking.guests.length})
                              </span>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                {booking.guests.map((g, idx) => (
                                  <div key={g.id || idx} className="p-3 rounded-xl bg-[#FFFFFF] border border-[#E8E6F2] flex items-center justify-between">
                                    <div className="space-y-0.5">
                                      <div className="font-bold text-[#24213A] flex items-center gap-1.5">
                                        <span>{g.name}</span>
                                        {g.is_primary && (
                                          <span className="text-[9px] font-bold bg-[#F0EEFF] text-[#5146D8] px-1.5 py-0.2 rounded border border-[#E0DEF8]">
                                            Primary
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-[#77758F]">{g.phone || "No phone"}</div>
                                    </div>
                                    <div>{getKycBadge(g.kyc_status)}</div>
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
              <div>{getKycBadge(profileGuest.kyc_status)}</div>
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
                <span className="text-[10px] font-bold uppercase text-[#77758F] block mb-0.5">ID Document</span>
                <span className="font-bold text-[#24213A] uppercase">
                  {profileGuest.id_type || "None"} {profileGuest.id_number_masked ? `(${profileGuest.id_number_masked})` : ""}
                </span>
              </div>
            </div>

            {/* Stay Records */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#77758F]">Stay History</h4>
              
              {isLoadingHistory ? (
                <div className="py-8 text-center text-[#77758F] text-xs">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1 text-[#5146D8]" />
                  <span>Loading stay records...</span>
                </div>
              ) : profileStayHistory.length === 0 ? (
                <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E8E6F2] text-center text-xs text-[#77758F]">
                  No prior stay records found for this phone number.
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
      {/* OPTIONAL KYC & ID VERIFICATION MODAL */}
      {/* ===================================================================== */}
      {kycModalGuest && (
        <GlassModal
          isOpen={!!kycModalGuest}
          onClose={() => setKycModalGuest(null)}
          title="Optional ID Document Collection"
        >
          <div className="p-6 md:p-8 flex flex-col gap-5 w-full max-w-xl mx-auto overflow-hidden">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-lg md:text-xl font-bold text-[#24213A]">Identification & KYC</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#059669] bg-[#ECFDF5] border border-[#A7F3D0] px-2 py-0.5 rounded-full">
                  Optional
                </span>
              </div>
              <p className="text-xs text-[#77758F] mt-0.5">
                Guest: <span className="font-bold text-[#24213A]">{kycModalGuest.name}</span> ({kycModalGuest.phone || "No phone"})
              </p>
            </div>

            {/* Privacy Alert */}
            <div className="p-3 rounded-xl bg-[#F0EEFF] border border-[#E0DEF8] flex items-start gap-2.5 text-xs text-[#5146D8]">
              <ShieldCheck className="w-4 h-4 shrink-0 text-[#5146D8] mt-0.5" />
              <p className="text-[11px] text-[#24213A]">
                Document uploads are stored in private tenant storage and are never publicly accessible or included in Excel exports. ID numbers are masked for data privacy.
              </p>
            </div>

            {kycToast && (
              <div className={cn(
                "p-3 rounded-xl text-xs flex items-center gap-2 border",
                kycToast.type === 'success' ? "bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]" : "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]"
              )}>
                {kycToast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{kycToast.text}</span>
              </div>
            )}

            <form onSubmit={handleSaveKycDetails} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1">
                    ID Document Type
                  </label>
                  <select
                    value={kycForm.id_type}
                    onChange={(e) => setKycForm({ ...kycForm, id_type: e.target.value })}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-3 py-2 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] cursor-pointer"
                  >
                    <option value="aadhaar">Aadhaar Card / National ID</option>
                    <option value="passport">Passport</option>
                    <option value="driving_licence">Driving Licence</option>
                    <option value="voter_id">Voter ID</option>
                    <option value="other">Other Official ID</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1">
                    Document Number (Masked)
                  </label>
                  <input
                    type="text"
                    value={kycForm.id_number_masked}
                    onChange={(e) => setKycForm({ ...kycForm, id_number_masked: e.target.value })}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-3 py-2 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] font-mono"
                    placeholder="e.g. •••• 5678"
                  />
                </div>
              </div>

              {/* ID Images Upload */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Front Side */}
                <div className="p-3.5 rounded-xl border border-[#E8E6F2] bg-[#F7F7FC] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#24213A]">Front Side Image</span>
                    {(kycModalGuest.id_front_path || kycModalGuest.id_front_url) && (
                      <span className="text-[9px] font-bold uppercase text-[#059669] bg-[#ECFDF5] border border-[#A7F3D0] px-1.5 py-0.5 rounded">
                        Uploaded
                      </span>
                    )}
                  </div>

                  {(kycModalGuest.id_front_path || kycModalGuest.id_front_url) ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleViewDocument("front")}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8] text-xs font-bold hover:bg-[#E0DEF8] transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" /> View Document
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveDocument("front")}
                        className="p-2 rounded-lg bg-[#FFFFFF] text-[#DC2626] border border-[#FECACA] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                        title="Remove Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="file"
                        id="doc-front"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => handleDocUpload(e, "front")}
                        disabled={isUploadingFront}
                      />
                      <label
                        htmlFor="doc-front"
                        className="flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-lg bg-[#FFFFFF] border border-[#E8E6F2] text-xs font-bold text-[#5146D8] hover:bg-[#F0EEFF] transition-colors cursor-pointer"
                      >
                        {isUploadingFront ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                        <span>Upload Front ID</span>
                      </label>
                    </>
                  )}
                  <span className="text-[10px] text-[#77758F] block">PNG, JPEG or PDF up to 5MB</span>
                </div>

                {/* Back Side */}
                <div className="p-3.5 rounded-xl border border-[#E8E6F2] bg-[#F7F7FC] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#24213A]">Back Side Image</span>
                    {(kycModalGuest.id_back_path || kycModalGuest.id_back_url) && (
                      <span className="text-[9px] font-bold uppercase text-[#059669] bg-[#ECFDF5] border border-[#A7F3D0] px-1.5 py-0.5 rounded">
                        Uploaded
                      </span>
                    )}
                  </div>

                  {(kycModalGuest.id_back_path || kycModalGuest.id_back_url) ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleViewDocument("back")}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8] text-xs font-bold hover:bg-[#E0DEF8] transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" /> View Document
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveDocument("back")}
                        className="p-2 rounded-lg bg-[#FFFFFF] text-[#DC2626] border border-[#FECACA] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                        title="Remove Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="file"
                        id="doc-back"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => handleDocUpload(e, "back")}
                        disabled={isUploadingBack}
                      />
                      <label
                        htmlFor="doc-back"
                        className="flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-lg bg-[#FFFFFF] border border-[#E8E6F2] text-xs font-bold text-[#5146D8] hover:bg-[#F0EEFF] transition-colors cursor-pointer"
                      >
                        {isUploadingBack ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                        <span>Upload Back ID</span>
                      </label>
                    </>
                  )}
                  <span className="text-[10px] text-[#77758F] block">PNG, JPEG or PDF up to 5MB</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1">
                    Verification Status *
                  </label>
                  <select
                    value={kycForm.kyc_status}
                    onChange={(e) => setKycForm({ ...kycForm, kyc_status: e.target.value as KycStatus })}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-3 py-2 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] cursor-pointer"
                  >
                    <option value="not_uploaded">Not Uploaded</option>
                    <option value="pending">Pending Verification</option>
                    <option value="verified">Verified</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1">
                    Guest Residential Address
                  </label>
                  <input
                    type="text"
                    value={kycForm.address}
                    onChange={(e) => setKycForm({ ...kycForm, address: e.target.value })}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-3 py-2 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8]"
                    placeholder="City, State, Country"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1">
                  Verification Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={kycForm.kyc_notes}
                  onChange={(e) => setKycForm({ ...kycForm, kyc_notes: e.target.value })}
                  className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl p-2.5 text-xs text-[#24213A] outline-none focus:border-[#5146D8] resize-none"
                  placeholder="Notes from front desk verification..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E8E6F2]">
                <button
                  type="button"
                  onClick={() => setKycModalGuest(null)}
                  disabled={isSavingKyc}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#77758F] hover:bg-[#F7F7FC] border border-[#E8E6F2] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingKyc}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-[#5146D8] hover:bg-[#4338CA] text-white transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSavingKyc ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</> : "Save KYC Status"}
                </button>
              </div>
            </form>
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
                Generate a native Microsoft Excel (.xlsx) spreadsheet formatted for official compliance.
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
                <p>Guest Name, Phone Number, Booking Reference, Room Name, Check-in Date, Check-out Date, Guests Count, Booking Status, Source, and KYC Status.</p>
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
