"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import { DbInvoice, Homestay } from "@/lib/types";
import { getInvoicesAction } from "@/app/actions/invoices";
import { useHMSContext } from "@/components/providers/HMSProvider";
import { InvoiceEditorModal } from "@/components/modals/InvoiceEditorModal";
import { InvoicePreviewModal } from "@/components/modals/InvoicePreviewModal";
import { formatISTCompactDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import {
  Receipt,
  Search,
  Filter,
  Plus,
  Printer,
  Edit,
  Eye,
  CreditCard,
  IndianRupee,
  CheckCircle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  BedDouble,
  User,
  Phone,
  RefreshCw,
  Loader2,
  ArrowUpDown,
  X,
  FileText
} from "lucide-react";

export default function BillingsPage() {
  const { selectedHomestayId, homestays } = useHMSContext();
  const [invoices, setInvoices] = useState<DbInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "amount_desc" | "due_desc">("date_desc");

  // Modals state
  const [editingInvoice, setEditingInvoice] = useState<DbInvoice | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<DbInvoice | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const currentHomestay = homestays.find(h => h.id === selectedHomestayId);

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getInvoicesAction(selectedHomestayId || undefined);
      if (res.success && res.invoices) {
        setInvoices(res.invoices);
      } else {
        setInvoices([]);
      }
    } catch (err) {
      console.warn("Could not fetch invoices from database:", err);
      setInvoices([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedHomestayId]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Filtered and Sorted Invoices
  const filteredInvoices = useMemo(() => {
    let list = invoices.filter((inv) => {
      const matchesStatus = 
        statusFilter === "all" || inv.status.toLowerCase() === statusFilter.toLowerCase();

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        !q ||
        inv.invoice_number.toLowerCase().includes(q) ||
        inv.guest_name.toLowerCase().includes(q) ||
        (inv.guest_phone && inv.guest_phone.toLowerCase().includes(q)) ||
        (inv.room_name && inv.room_name.toLowerCase().includes(q)) ||
        (inv.booking_id && inv.booking_id.toLowerCase().includes(q));

      return matchesStatus && matchesSearch;
    });

    // Sorting
    list = [...list].sort((a, b) => {
      if (sortBy === "amount_desc") {
        return Number(b.grand_total) - Number(a.grand_total);
      }
      if (sortBy === "due_desc") {
        return Number(b.balance_due) - Number(a.balance_due);
      }
      // default: date_desc
      return new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime();
    });

    return list;
  }, [invoices, searchQuery, statusFilter, sortBy]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: invoices.length,
      paid: 0,
      partially_paid: 0,
      unpaid: 0,
      draft: 0,
      cancelled: 0,
    };
    for (const inv of invoices) {
      const st = inv.status.toLowerCase();
      if (counts[st] !== undefined) counts[st]++;
    }
    return counts;
  }, [invoices]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let totalInvoiced = 0;
    let totalCollected = 0;
    let totalDue = 0;
    let paidCount = 0;

    for (const inv of invoices) {
      if (inv.status !== 'cancelled') {
        totalInvoiced += Number(inv.grand_total || 0);
        totalCollected += Number(inv.amount_paid || 0);
        totalDue += Number(inv.balance_due || 0);
        if (Number(inv.balance_due) <= 0) paidCount++;
      }
    }

    const efficiency = invoices.length > 0 ? Math.round((paidCount / invoices.length) * 100) : 100;

    return {
      totalInvoiced,
      totalCollected,
      totalDue,
      count: invoices.length,
      paidCount,
      efficiency,
    };
  }, [invoices]);

  const handleOpenEdit = (inv: DbInvoice) => {
    setEditingInvoice(inv);
    setIsEditorOpen(true);
  };

  const handleOpenPreview = (inv: DbInvoice) => {
    setPreviewInvoice(inv);
    setIsPreviewOpen(true);
  };

  const handleCreateNewFolio = () => {
    setEditingInvoice(null);
    setIsEditorOpen(true);
  };

  const handleSaved = (invoiceId: string, updatedInvoice?: DbInvoice, shouldClose = true) => {
    if (shouldClose) {
      setIsEditorOpen(false);
    }
    if (updatedInvoice) {
      setInvoices((prev) => {
        const index = prev.findIndex((i) => i.id === invoiceId);
        if (index >= 0) {
          const next = [...prev];
          next[index] = updatedInvoice;
          return next;
        }
        return [updatedInvoice, ...prev];
      });
      if (shouldClose) {
        setPreviewInvoice(updatedInvoice);
        setIsPreviewOpen(true);
      }
    } else {
      fetchInvoices();
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6 max-w-7xl mx-auto pb-12 w-full min-w-0 overflow-x-hidden">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-serif font-black tracking-wide text-[#24213A]">
            Billings & Invoices
          </h1>
          <p className="text-xs text-[#77758F] mt-1">
            Manage guest folios, itemized charges, and payment settlements for{" "}
            <span className="text-[#5146D8] font-semibold">{currentHomestay?.name || "All Homestays"}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <GlassButton
            variant="secondary"
            onClick={fetchInvoices}
            disabled={isLoading}
            className="text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin text-[#5146D8]")} />
            <span className="hidden sm:inline">Refresh</span>
          </GlassButton>

          <button
            onClick={handleCreateNewFolio}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#5146D8] text-white hover:bg-[#4338CA] shadow-md shadow-[#5146D8]/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Folio</span>
          </button>
        </div>
      </div>

      {/* Financial Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 w-full min-w-0">
        {/* Total Invoiced */}
        <GlassPanel className="p-3.5 sm:p-5 rounded-2xl flex items-center justify-between border border-[#E8E7F2] relative overflow-hidden group hover:border-[#8B83F6] transition-all shadow-sm min-w-0">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#F0EEFF] rounded-full blur-xl pointer-events-none" />
          <div className="min-w-0 flex-1 mr-2">
            <div className="text-[10px] text-[#77758F] font-bold uppercase tracking-widest">Total Invoiced</div>
            <div className="text-lg sm:text-2xl font-bold font-mono text-[#24213A] mt-1 truncate">
              ₹{metrics.totalInvoiced.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-[#77758F] mt-0.5 truncate">
              Across <strong className="text-[#24213A]">{metrics.count}</strong> guest folios
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[#F0EEFF] border border-[#E0DEF8] flex items-center justify-center text-[#5146D8] shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
        </GlassPanel>

        {/* Amount Collected */}
        <GlassPanel className="p-3.5 sm:p-5 rounded-2xl flex items-center justify-between border border-[#E8E7F2] relative overflow-hidden group hover:border-[#A7F3D0] transition-all shadow-sm min-w-0">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#ECFDF5] rounded-full blur-xl pointer-events-none" />
          <div className="min-w-0 flex-1 mr-2">
            <div className="text-[10px] text-[#77758F] font-bold uppercase tracking-widest">Amount Collected</div>
            <div className="text-lg sm:text-2xl font-bold font-mono text-[#059669] mt-1 truncate">
              ₹{metrics.totalCollected.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-[#77758F] mt-0.5 truncate">
              <strong className="text-[#059669]">{metrics.paidCount}</strong> fully settled folios
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center text-[#059669] shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
        </GlassPanel>

        {/* Balance Due */}
        <GlassPanel className="p-3.5 sm:p-5 rounded-2xl flex items-center justify-between border border-[#E8E7F2] relative overflow-hidden group hover:border-[#FECACA] transition-all shadow-sm min-w-0">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#FEF2F2] rounded-full blur-xl pointer-events-none" />
          <div className="min-w-0 flex-1 mr-2">
            <div className="text-[10px] text-[#77758F] font-bold uppercase tracking-widest">Balance Due</div>
            <div className="text-lg sm:text-2xl font-bold font-mono text-[#DC2626] mt-1 truncate">
              ₹{metrics.totalDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-[#77758F] mt-0.5 truncate">
              Pending front-desk collection
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center text-[#DC2626] shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
        </GlassPanel>

        {/* Settlement Efficiency */}
        <GlassPanel className="p-3.5 sm:p-5 rounded-2xl flex items-center justify-between border border-[#E8E7F2] relative overflow-hidden group hover:border-[#8B83F6] transition-all shadow-sm min-w-0">
          <div className="min-w-0 flex-1 mr-2">
            <div className="text-[10px] text-[#77758F] font-bold uppercase tracking-widest">Settlement Rate</div>
            <div className="text-lg sm:text-2xl font-bold font-mono text-[#24213A] mt-1">
              {metrics.efficiency}%
            </div>
            <div className="w-28 sm:w-32 h-1.5 bg-[#E8E7F2] rounded-full mt-1.5 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#8B83F6] to-[#5146D8] rounded-full" 
                style={{ width: `${metrics.efficiency}%` }}
              />
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[#F0EEFF] border border-[#E0DEF8] flex items-center justify-center text-[#5146D8] shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
        </GlassPanel>
      </div>

      {/* Filter and Search Bar */}
      <GlassPanel className="p-3 sm:p-4 rounded-2xl border border-[#E8E7F2] shadow-sm w-full max-w-full min-w-0 overflow-hidden">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 w-full min-w-0">
          {/* Search + Sort Controls */}
          <div className="flex items-center gap-2 w-full min-w-0 flex-1">
            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-[#77758F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search invoice #, guest, room..."
                className="w-full bg-[#FFFFFF] border border-[#E8E7F2] rounded-xl pl-9 pr-8 py-2 text-xs text-[#24213A] placeholder-[#8F8CA4] focus:border-[#5146D8] focus:ring-2 focus:ring-[#5146D8]/10 outline-none transition-all shadow-sm min-w-0"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#77758F] hover:text-[#24213A] p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-[#77758F] font-bold uppercase tracking-wider hidden sm:inline">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-[#FFFFFF] border border-[#E8E7F2] rounded-xl px-2.5 py-2 text-xs text-[#24213A] focus:border-[#5146D8] outline-none cursor-pointer shadow-sm"
              >
                <option value="date_desc">Latest Date</option>
                <option value="amount_desc">Amount (High to Low)</option>
                <option value="due_desc">Balance Due</option>
              </select>
            </div>
          </div>

          {/* Status Tabs */}
          <div className="w-full lg:w-auto max-w-full min-w-0 overflow-x-auto overscroll-x-contain pb-1 lg:pb-0 hms-editor-scrollbar">
            <div className="flex items-center gap-1.5 min-w-max">
              {[
                { id: "all", label: "All" },
                { id: "paid", label: "Paid" },
                { id: "partially_paid", label: "Partial" },
                { id: "unpaid", label: "Unpaid" },
                { id: "draft", label: "Draft" },
                { id: "cancelled", label: "Cancelled" },
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setStatusFilter(st.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0",
                    statusFilter === st.id
                      ? "bg-[#5146D8] text-white font-black shadow-md shadow-[#5146D8]/20"
                      : "bg-[#F0EEFF] text-[#77758F] hover:text-[#5146D8] hover:bg-[#E5E3FA]"
                  )}
                >
                  <span>{st.label}</span>
                  <span className={cn(
                    "px-1.5 py-0.2 rounded-full text-[9px]",
                    statusFilter === st.id ? "bg-white/20 text-white" : "bg-white text-[#77758F]"
                  )}>
                    {tabCounts[st.id] || 0}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </GlassPanel>

      {/* Invoices List / Table */}
      <GlassPanel className="p-0 rounded-2xl overflow-hidden border border-[#E8E7F2] shadow-sm w-full min-w-0">
        {/* Mobile View (Cards) */}
        <div className="block md:hidden divide-y divide-[#E8E7F2] w-full min-w-0">
          {isLoading ? (
            <div className="p-10 text-center text-xs text-[#77758F]">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#5146D8]" />
              Loading invoices...
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-10 text-center text-xs text-[#77758F] space-y-2">
              <Receipt className="w-8 h-8 mx-auto opacity-30 text-[#8B83F6]" />
              <p>No invoices match your search or filter.</p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-[11px] text-[#5146D8] underline"
                >
                  Clear search query
                </button>
              )}
            </div>
          ) : (
            filteredInvoices.map((inv) => (
              <div key={inv.id} className="p-3.5 sm:p-4 space-y-2.5 sm:space-y-3 hover:bg-[#F7F7FC]/60 transition-colors w-full min-w-0">
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs font-bold text-[#5146D8] truncate">
                      {inv.invoice_number}
                    </div>
                    <div className="text-[11px] text-[#77758F] mt-0.5 truncate">
                      {formatISTCompactDate(inv.invoice_date)} • <span className="font-medium text-[#24213A]">{inv.guest_name}</span>
                    </div>
                  </div>

                  <span
                    className={cn(
                      "px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border shrink-0",
                      inv.status === "paid" && "bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]",
                      inv.status === "partially_paid" && "bg-[#FFFBEB] border-[#FDE68A] text-[#D97706]",
                      inv.status === "unpaid" && "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]",
                      inv.status === "cancelled" && "bg-[#F7F7FC] border-[#E8E7F2] text-[#77758F]"
                    )}
                  >
                    {inv.status.replace("_", " ")}
                  </span>
                </div>

                <div className="text-xs text-[#24213A] flex items-center justify-between gap-2 min-w-0">
                  <span className="font-medium truncate min-w-0">{inv.room_name || "Room"}</span>
                  <span className="text-[11px] text-[#77758F] shrink-0 whitespace-nowrap">
                    {formatISTCompactDate(inv.check_in)} → {formatISTCompactDate(inv.check_out)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 sm:gap-2 bg-[#F7F7FC] p-2 sm:p-2.5 rounded-xl border border-[#E8E7F2] text-xs">
                  <div className="min-w-0">
                    <div className="text-[9px] text-[#77758F] uppercase font-bold tracking-wider">Total</div>
                    <div className="font-mono font-bold text-[#24213A] text-xs truncate">₹{Number(inv.grand_total).toLocaleString("en-IN")}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] text-[#77758F] uppercase font-bold tracking-wider">Paid</div>
                    <div className="font-mono font-bold text-[#059669] text-xs truncate">₹{Number(inv.amount_paid).toLocaleString("en-IN")}</div>
                  </div>
                  <div className="text-right min-w-0">
                    <div className="text-[9px] text-[#77758F] uppercase font-bold tracking-wider">Due</div>
                    <div className="font-mono font-bold text-[#DC2626] text-xs truncate">₹{Number(inv.balance_due).toLocaleString("en-IN")}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    onClick={() => handleOpenPreview(inv)}
                    className="flex-1 py-2 sm:py-1.5 rounded-xl text-xs flex items-center justify-center gap-1.5 bg-[#F0EEFF] hover:bg-[#E0DEF8] text-[#5146D8] border border-[#E0DEF8] transition-colors cursor-pointer font-medium active:scale-95"
                  >
                    <Printer className="w-3.5 h-3.5 shrink-0" />
                    <span className="whitespace-nowrap">Print PDF</span>
                  </button>
                  <button
                    onClick={() => handleOpenEdit(inv)}
                    className="flex-1 py-2 sm:py-1.5 rounded-xl text-xs flex items-center justify-center gap-1.5 bg-[#FFFFFF] hover:bg-[#F7F7FC] border border-[#E8E7F2] text-[#24213A] transition-colors cursor-pointer font-medium active:scale-95 shadow-sm"
                  >
                    <Edit className="w-3.5 h-3.5 shrink-0" />
                    <span className="whitespace-nowrap">Edit Folio</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop View (Table) */}
        <div className="hidden md:block w-full overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[950px]">
            <thead>
              <tr className="border-b border-[#E8E7F2] text-[10px] uppercase tracking-widest text-[#77758F] bg-[#F7F7FC]">
                <th className="px-6 py-4 font-bold">Invoice No. & Date</th>
                <th className="px-6 py-4 font-bold">Guest Details</th>
                <th className="px-6 py-4 font-bold">Stay / Accommodation</th>
                <th className="px-6 py-4 font-bold text-right">Grand Total</th>
                <th className="px-6 py-4 font-bold text-right">Paid</th>
                <th className="px-6 py-4 font-bold text-right">Balance Due</th>
                <th className="px-6 py-4 font-bold text-center">Status</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-[#E8E7F2]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center text-[#77758F]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 text-[#5146D8] animate-spin" />
                      <span>Loading guest invoices...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center text-[#77758F]">
                    <div className="max-w-md mx-auto space-y-2">
                      <Receipt className="w-8 h-8 mx-auto opacity-30 text-[#8B83F6]" />
                      <p className="text-sm font-semibold text-[#24213A]">No invoices match your criteria</p>
                      <p className="text-xs text-[#77758F]">
                        {searchQuery ? "Try refining your search terms or filters." : "No invoices found for this homestay. Generate a folio from Bookings or create one directly."}
                      </p>
                      <button
                        onClick={handleCreateNewFolio}
                        className="mt-3 px-4 py-2 rounded-full text-xs font-semibold bg-[#5146D8] text-white hover:bg-[#4338CA] inline-flex items-center gap-1.5 cursor-pointer shadow-md shadow-[#5146D8]/20"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Create Guest Folio</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="group hover:bg-[#F7F7FC]/70 transition-colors"
                  >
                    {/* Invoice No & Date */}
                    <td className="px-6 py-4">
                      <div className="font-mono text-xs font-bold text-[#5146D8] group-hover:text-[#4338CA] transition-colors">
                        {inv.invoice_number}
                      </div>
                      <div className="text-[11px] text-[#77758F] mt-0.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-[#5146D8]" />
                        <span>{formatISTCompactDate(inv.invoice_date)}</span>
                      </div>
                    </td>

                    {/* Guest Details */}
                    <td className="px-6 py-4">
                      <div className="font-semibold text-[#24213A]">
                        {inv.guest_name}
                      </div>
                      {inv.guest_phone && (
                        <div className="text-[11px] text-[#77758F] mt-0.5 flex items-center gap-1">
                          <Phone className="w-2.5 h-2.5 opacity-60" />
                          <span>{inv.guest_phone}</span>
                        </div>
                      )}
                    </td>

                    {/* Stay & Room */}
                    <td className="px-6 py-4">
                      <div className="font-medium text-[#24213A] flex items-center gap-1.5">
                        <BedDouble className="w-3.5 h-3.5 text-[#5146D8]" />
                        <span>{inv.room_name || "Room"}</span>
                      </div>
                      <div className="text-[11px] text-[#77758F] mt-0.5">
                        {formatISTCompactDate(inv.check_in)} → {formatISTCompactDate(inv.check_out)}
                      </div>
                    </td>

                    {/* Grand Total */}
                    <td className="px-6 py-4 text-right font-mono font-bold text-[#24213A]">
                      ₹{Number(inv.grand_total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>

                    {/* Amount Paid */}
                    <td className="px-6 py-4 text-right font-mono font-medium text-[#059669]">
                      ₹{Number(inv.amount_paid).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>

                    {/* Balance Due */}
                    <td className="px-6 py-4 text-right font-mono font-bold">
                      <span className={Number(inv.balance_due) > 0 ? "text-[#DC2626]" : "text-[#77758F]"}>
                        ₹{Number(inv.balance_due).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="px-6 py-4 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border",
                          inv.status === "paid" && "bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]",
                          inv.status === "partially_paid" && "bg-[#FFFBEB] border-[#FDE68A] text-[#D97706]",
                          inv.status === "unpaid" && "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]",
                          inv.status === "cancelled" && "bg-[#F7F7FC] border-[#E8E7F2] text-[#77758F]"
                        )}
                      >
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          inv.status === "paid" && "bg-[#10B981]",
                          inv.status === "partially_paid" && "bg-[#F59E0B]",
                          inv.status === "unpaid" && "bg-[#EF4444]",
                          inv.status === "cancelled" && "bg-[#77758F]"
                        )} />
                        <span>{inv.status.replace("_", " ")}</span>
                      </span>
                    </td>

                    {/* Action Buttons */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenPreview(inv)}
                          title="Print / Save Folio PDF"
                          className="p-2 rounded-xl bg-[#F0EEFF] hover:bg-[#E0DEF8] border border-[#E0DEF8] text-[#5146D8] transition-all cursor-pointer active:scale-95"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(inv)}
                          title="Edit Line Items & Settle Payments"
                          className="p-2 rounded-xl bg-[#FFFFFF] hover:bg-[#F7F7FC] border border-[#E8E7F2] text-[#24213A] transition-all cursor-pointer active:scale-95 shadow-sm"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassPanel>

      {/* Editor Modal */}
      {isEditorOpen && (
        <InvoiceEditorModal
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          existingInvoice={editingInvoice}
          onSaved={handleSaved}
        />
      )}

      {/* Preview / PDF Modal */}
      {isPreviewOpen && previewInvoice && (
        <InvoicePreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          invoice={previewInvoice}
          homestay={currentHomestay}
        />
      )}
    </div>
  );
}
