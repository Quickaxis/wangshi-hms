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
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif font-black tracking-wide text-[#F5F1E8]">
            Billings & Invoices
          </h1>
          <p className="text-xs text-[#96928A] mt-1">
            Manage guest folios, itemized charges, and payment settlements for{" "}
            <span className="text-[#F2EEE3] font-semibold">{currentHomestay?.name || "All Homestays"}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <GlassButton
            variant="secondary"
            onClick={fetchInvoices}
            disabled={isLoading}
            className="text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin text-[#F59E0B]")} />
            <span className="hidden sm:inline">Refresh</span>
          </GlassButton>

          <button
            onClick={handleCreateNewFolio}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#F59E0B] text-black hover:bg-[#FBBF24] shadow-lg shadow-[rgba(245,158,11,0.2)] transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>New Folio</span>
          </button>
        </div>
      </div>

      {/* Financial Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Invoiced */}
        <GlassPanel className="p-4 sm:p-5 rounded-2xl flex items-center justify-between border border-[rgba(255,255,255,0.08)] relative overflow-hidden group hover:border-[rgba(245,158,11,0.3)] transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[rgba(245,158,11,0.05)] rounded-full blur-xl pointer-events-none" />
          <div>
            <div className="text-[10px] text-[#96928A] font-bold uppercase tracking-widest">Total Invoiced</div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-[#F5F1E8] mt-1">
              ₹{metrics.totalInvoiced.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-[#96928A] mt-0.5">
              Across <strong className="text-[#F2EEE3]">{metrics.count}</strong> guest folios
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[rgba(245,158,11,0.15)] border border-[rgba(245,158,11,0.25)] flex items-center justify-center text-[#F59E0B] shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
        </GlassPanel>

        {/* Amount Collected */}
        <GlassPanel className="p-4 sm:p-5 rounded-2xl flex items-center justify-between border border-[rgba(255,255,255,0.08)] relative overflow-hidden group hover:border-[rgba(79,231,123,0.3)] transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[rgba(79,231,123,0.05)] rounded-full blur-xl pointer-events-none" />
          <div>
            <div className="text-[10px] text-[#96928A] font-bold uppercase tracking-widest">Amount Collected</div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-[#4FE77B] mt-1">
              ₹{metrics.totalCollected.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-[#96928A] mt-0.5">
              <strong className="text-[#4FE77B]">{metrics.paidCount}</strong> fully settled folios
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[rgba(79,231,123,0.15)] border border-[rgba(79,231,123,0.25)] flex items-center justify-center text-[#4FE77B] shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
        </GlassPanel>

        {/* Balance Due */}
        <GlassPanel className="p-4 sm:p-5 rounded-2xl flex items-center justify-between border border-[rgba(255,255,255,0.08)] relative overflow-hidden group hover:border-[rgba(255,105,120,0.3)] transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[rgba(255,105,120,0.05)] rounded-full blur-xl pointer-events-none" />
          <div>
            <div className="text-[10px] text-[#96928A] font-bold uppercase tracking-widest">Balance Due</div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-[#FF6978] mt-1">
              ₹{metrics.totalDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-[#96928A] mt-0.5">
              Pending front-desk collection
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[rgba(255,105,120,0.15)] border border-[rgba(255,105,120,0.25)] flex items-center justify-center text-[#FF6978] shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
        </GlassPanel>

        {/* Settlement Efficiency */}
        <GlassPanel className="p-4 sm:p-5 rounded-2xl flex items-center justify-between border border-[rgba(255,255,255,0.08)] relative overflow-hidden group hover:border-[rgba(255,255,255,0.2)] transition-all">
          <div>
            <div className="text-[10px] text-[#96928A] font-bold uppercase tracking-widest">Settlement Rate</div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-[#F5F1E8] mt-1">
              {metrics.efficiency}%
            </div>
            <div className="w-32 h-1.5 bg-[rgba(255,255,255,0.08)] rounded-full mt-1.5 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#F59E0B] to-[#4FE77B] rounded-full" 
                style={{ width: `${metrics.efficiency}%` }}
              />
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] flex items-center justify-center text-[#F5F1E8] shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
        </GlassPanel>
      </div>

      {/* Filter and Search Bar */}
      <GlassPanel className="p-4 rounded-2xl border border-[rgba(255,255,255,0.08)]">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#96928A] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by invoice #, guest name, contact phone, or room..."
              className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-xl pl-9 pr-8 py-2 text-xs text-[#F5F1E8] placeholder-[#78736B] focus:border-[#F59E0B] outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#96928A] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-[#96928A] font-bold uppercase tracking-wider hidden sm:inline">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-xl px-2.5 py-2 text-xs text-[#C7C3BA] focus:border-[#F59E0B] outline-none cursor-pointer"
            >
              <option value="date_desc">Latest Date</option>
              <option value="amount_desc">Amount (High to Low)</option>
              <option value="due_desc">Balance Due</option>
            </select>
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
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
                  "px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer",
                  statusFilter === st.id
                    ? "bg-[#F59E0B] text-black font-black shadow-md shadow-[rgba(245,158,11,0.2)]"
                    : "bg-[rgba(255,255,255,0.03)] text-[#96928A] hover:text-[#C7C3BA] hover:bg-[rgba(255,255,255,0.06)]"
                )}
              >
                <span>{st.label}</span>
                <span className={cn(
                  "px-1.5 py-0.2 rounded-full text-[9px]",
                  statusFilter === st.id ? "bg-black/20 text-black" : "bg-white/5 text-[#96928A]"
                )}>
                  {tabCounts[st.id] || 0}
                </span>
              </button>
            ))}
          </div>
        </div>
      </GlassPanel>

      {/* Invoices List / Table */}
      <GlassPanel className="p-0 rounded-2xl overflow-hidden border border-[rgba(255,255,255,0.08)] shadow-2xl">
        {/* Mobile View (Cards) */}
        <div className="block md:hidden divide-y divide-[rgba(255,255,255,0.05)]">
          {isLoading ? (
            <div className="p-10 text-center text-xs text-[#96928A]">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#F59E0B]" />
              Loading invoices...
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-10 text-center text-xs text-[#96928A] space-y-2">
              <Receipt className="w-8 h-8 mx-auto opacity-30 text-[#F5F1E8]" />
              <p>No invoices match your search or filter.</p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-[11px] text-[#F59E0B] underline"
                >
                  Clear search query
                </button>
              )}
            </div>
          ) : (
            filteredInvoices.map((inv) => (
              <div key={inv.id} className="p-4 space-y-3 hover:bg-[rgba(255,255,255,0.015)] transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-mono text-xs font-bold text-[#F5F1E8]">
                      {inv.invoice_number}
                    </div>
                    <div className="text-[11px] text-[#96928A] mt-0.5">
                      {formatISTCompactDate(inv.invoice_date)} • {inv.guest_name}
                    </div>
                  </div>

                  <span
                    className={cn(
                      "px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border",
                      inv.status === "paid" && "bg-[rgba(79,231,123,0.15)] border-[rgba(79,231,123,0.3)] text-[#4FE77B]",
                      inv.status === "partially_paid" && "bg-[rgba(245,158,11,0.15)] border-[rgba(245,158,11,0.3)] text-[#F59E0B]",
                      inv.status === "unpaid" && "bg-[rgba(255,105,120,0.15)] border-[rgba(255,105,120,0.3)] text-[#FF6978]",
                      inv.status === "cancelled" && "bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)] text-[#96928A]"
                    )}
                  >
                    {inv.status.replace("_", " ")}
                  </span>
                </div>

                <div className="text-xs text-[#C7C3BA] flex items-center justify-between">
                  <span>{inv.room_name || "Room"}</span>
                  <span className="text-[11px] text-[#96928A]">
                    {formatISTCompactDate(inv.check_in)} → {formatISTCompactDate(inv.check_out)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-[rgba(255,255,255,0.02)] p-2.5 rounded-xl border border-[rgba(255,255,255,0.05)] text-xs">
                  <div>
                    <div className="text-[9px] text-[#96928A] uppercase font-bold">Total</div>
                    <div className="font-mono font-bold text-[#F5F1E8]">₹{Number(inv.grand_total).toLocaleString("en-IN")}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-[#96928A] uppercase font-bold">Paid</div>
                    <div className="font-mono font-bold text-[#4FE77B]">₹{Number(inv.amount_paid).toLocaleString("en-IN")}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-[#96928A] uppercase font-bold">Due</div>
                    <div className="font-mono font-bold text-[#FF6978]">₹{Number(inv.balance_due).toLocaleString("en-IN")}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleOpenPreview(inv)}
                    className="flex-1 py-1.5 rounded-xl text-xs flex items-center justify-center gap-1.5 bg-[#5B131E]/30 text-[#FFB3B3] hover:bg-[#5B131E]/50 border border-[#5B131E]/40 transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print PDF</span>
                  </button>
                  <button
                    onClick={() => handleOpenEdit(inv)}
                    className="flex-1 py-1.5 rounded-xl text-xs flex items-center justify-center gap-1.5 bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.06)] text-[#F5F1E8] transition-colors cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Edit Folio</span>
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
              <tr className="border-b border-[rgba(255,255,255,0.06)] text-[10px] uppercase tracking-widest text-[#96928A] bg-[rgba(255,255,255,0.015)]">
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
            <tbody className="text-sm divide-y divide-[rgba(255,255,255,0.03)]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center text-[#96928A]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 text-[#F59E0B] animate-spin" />
                      <span>Loading guest invoices...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center text-[#96928A]">
                    <div className="max-w-md mx-auto space-y-2">
                      <Receipt className="w-8 h-8 mx-auto opacity-30 text-[#F5F1E8]" />
                      <p className="text-sm font-semibold text-[#F5F1E8]">No invoices match your criteria</p>
                      <p className="text-xs text-[#96928A]">
                        {searchQuery ? "Try refining your search terms or filters." : "No invoices found for this homestay. Generate a folio from Bookings or create one directly."}
                      </p>
                      <button
                        onClick={handleCreateNewFolio}
                        className="mt-3 px-4 py-2 rounded-full text-xs font-semibold bg-[#F59E0B] text-black hover:bg-[#FBBF24] inline-flex items-center gap-1.5 cursor-pointer shadow-md"
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
                    className="group hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                  >
                    {/* Invoice No & Date */}
                    <td className="px-6 py-4">
                      <div className="font-mono text-xs font-bold text-[#F5F1E8] group-hover:text-[#F59E0B] transition-colors">
                        {inv.invoice_number}
                      </div>
                      <div className="text-[11px] text-[#96928A] mt-0.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3 opacity-60" />
                        <span>{formatISTCompactDate(inv.invoice_date)}</span>
                      </div>
                    </td>

                    {/* Guest Details */}
                    <td className="px-6 py-4">
                      <div className="font-semibold text-[#F5F1E8]">
                        {inv.guest_name}
                      </div>
                      {inv.guest_phone && (
                        <div className="text-[11px] text-[#96928A] mt-0.5 flex items-center gap-1">
                          <Phone className="w-2.5 h-2.5 opacity-60" />
                          <span>{inv.guest_phone}</span>
                        </div>
                      )}
                    </td>

                    {/* Stay & Room */}
                    <td className="px-6 py-4">
                      <div className="font-medium text-[#F2EEE3] flex items-center gap-1.5">
                        <BedDouble className="w-3.5 h-3.5 text-[#F59E0B]" />
                        <span>{inv.room_name || "Room"}</span>
                      </div>
                      <div className="text-[11px] text-[#96928A] mt-0.5">
                        {formatISTCompactDate(inv.check_in)} → {formatISTCompactDate(inv.check_out)}
                      </div>
                    </td>

                    {/* Grand Total */}
                    <td className="px-6 py-4 text-right font-mono font-bold text-[#F5F1E8]">
                      ₹{Number(inv.grand_total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>

                    {/* Amount Paid */}
                    <td className="px-6 py-4 text-right font-mono font-medium text-[#4FE77B]">
                      ₹{Number(inv.amount_paid).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>

                    {/* Balance Due */}
                    <td className="px-6 py-4 text-right font-mono font-bold">
                      <span className={Number(inv.balance_due) > 0 ? "text-[#FF6978]" : "text-[#96928A]"}>
                        ₹{Number(inv.balance_due).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="px-6 py-4 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border",
                          inv.status === "paid" && "bg-[rgba(79,231,123,0.15)] border-[rgba(79,231,123,0.3)] text-[#4FE77B]",
                          inv.status === "partially_paid" && "bg-[rgba(245,158,11,0.15)] border-[rgba(245,158,11,0.3)] text-[#F59E0B]",
                          inv.status === "unpaid" && "bg-[rgba(255,105,120,0.15)] border-[rgba(255,105,120,0.3)] text-[#FF6978]",
                          inv.status === "cancelled" && "bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)] text-[#96928A]"
                        )}
                      >
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          inv.status === "paid" && "bg-[#4FE77B]",
                          inv.status === "partially_paid" && "bg-[#F59E0B]",
                          inv.status === "unpaid" && "bg-[#FF6978]",
                          inv.status === "cancelled" && "bg-[#96928A]"
                        )} />
                        <span>{inv.status.replace("_", " ")}</span>
                      </span>
                    </td>

                    {/* Action Buttons */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenPreview(inv)}
                          title="Print / Save Luxury A4 Folio"
                          className="p-2 rounded-xl bg-[#5B131E]/20 hover:bg-[#5B131E]/40 border border-[#5B131E]/40 text-[#FFB3B3] hover:text-white transition-all cursor-pointer active:scale-95"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(inv)}
                          title="Edit Line Items & Settle Payments"
                          className="p-2 rounded-xl bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.09)] border border-[rgba(255,255,255,0.06)] text-[#C7C3BA] hover:text-white transition-all cursor-pointer active:scale-95"
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
