"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { GlassModal } from "@/components/ui/GlassModal";
import { GlassButton } from "@/components/ui/GlassButton";
import {
  Clock,
  CheckCircle,
  XCircle,
  Phone,
  Mail,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Filter,
  User,
  BedDouble,
  IndianRupee,
  Eye,
  CalendarCheck
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { 
  getBookingRequestsAction, 
  approveBookingRequestAction, 
  rejectBookingRequestAction 
} from "@/app/actions/booking-requests";
import { DbBookingRequest } from "@/lib/types";
import { formatISTCompactDate } from "@/lib/dateUtils";

interface BookingRequestsViewProps {
  homestayId?: string;
  onBookingCreated?: () => void;
}

export function BookingRequestsView({ homestayId, onBookingCreated }: BookingRequestsViewProps) {
  const [requests, setRequests] = useState<DbBookingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selectedRequest, setSelectedRequest] = useState<DbBookingRequest | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const loadRequests = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await getBookingRequestsAction(homestayId);
      if (res.success && res.data) {
        setRequests(res.data);
      }
    } catch (err) {
      console.error("[HMS] Failed to load booking requests:", err);
    } finally {
      setIsLoading(false);
    }
  }, [homestayId]);

  useEffect(() => {
    loadRequests();

    // Subscribe to realtime updates for instant notification
    const channel = supabase
      .channel("booking-requests-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "booking_requests" },
        () => {
          loadRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, loadRequests]);

  const handleApprove = async (requestId: string) => {
    if (!window.confirm("Approve this booking request and confirm the reservation? Room inventory will be reserved.")) return;
    setActionLoadingId(requestId);
    try {
      const res = await approveBookingRequestAction(requestId);
      if (res.success) {
        await loadRequests();
        if (selectedRequest?.id === requestId) {
          setSelectedRequest(null);
        }
        if (onBookingCreated) onBookingCreated();
      } else {
        alert(res.error || "Failed to approve booking request.");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    const reason = window.prompt("Reason for declining this request (optional):");
    if (reason === null) return; // User cancelled prompt
    setActionLoadingId(requestId);
    try {
      const res = await rejectBookingRequestAction(requestId, reason);
      if (res.success) {
        await loadRequests();
        if (selectedRequest?.id === requestId) {
          setSelectedRequest(null);
        }
      } else {
        alert(res.error || "Failed to reject booking request.");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = r.guest_name.toLowerCase().includes(q);
        const phoneMatch = r.guest_phone.includes(q);
        const roomMatch = r.rooms?.name?.toLowerCase().includes(q);
        const refMatch = r.id.toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch && !roomMatch && !refMatch) return false;
      }
      return true;
    });
  }, [requests, statusFilter, searchQuery]);

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="flex flex-col space-y-4">
      {/* Filter & Search Bar */}
      <GlassPanel className="p-3 md:p-4 rounded-[20px] bg-white md:glass-panel-secondary border border-gray-100 md:border-[rgba(255,255,255,0.05)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 md:text-[#96928A]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by guest name, phone, or reference..."
            className="w-full bg-transparent text-xs font-medium text-gray-900 md:text-[#F5F1E8] placeholder-gray-400 outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-50 md:bg-[rgba(0,0,0,0.2)] border border-gray-200 md:border-[rgba(255,255,255,0.08)] rounded-xl px-2 py-1">
            <Filter className="w-3.5 h-3.5 text-gray-400 md:text-[#96928A]" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-[11px] md:text-xs font-medium text-gray-700 md:text-[#F5F1E8] outline-none cursor-pointer"
            >
              <option value="pending" className="bg-[#1C1A18] text-[#F5F1E8]">Pending ({pendingCount})</option>
              <option value="all" className="bg-[#1C1A18] text-[#F5F1E8]">All Requests ({requests.length})</option>
              <option value="approved" className="bg-[#1C1A18] text-[#F5F1E8]">Approved</option>
              <option value="rejected" className="bg-[#1C1A18] text-[#F5F1E8]">Declined</option>
            </select>
          </div>

          <button
            onClick={loadRequests}
            disabled={isLoading}
            className="p-1.5 rounded-lg border border-gray-200 md:border-[rgba(255,255,255,0.08)] hover:bg-gray-100 md:hover:bg-[rgba(255,255,255,0.05)] text-gray-500 md:text-[#96928A] transition-colors"
            title="Refresh requests"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </GlassPanel>

      {/* Requests List */}
      {isLoading && requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Loader2 className="w-6 h-6 text-[#F59E0B] animate-spin" />
          <span className="text-gray-500 md:text-[#96928A] text-xs">Loading website booking requests...</span>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="bg-white md:glass-panel-secondary border border-gray-100 md:border-[rgba(255,255,255,0.05)] rounded-[20px] p-8 flex flex-col items-center justify-center text-center">
          <Clock className="w-8 h-8 text-gray-300 md:text-[#96928A] mb-2" />
          <div className="text-gray-700 md:text-[#F5F1E8] font-bold text-sm">No {statusFilter !== 'all' ? statusFilter : ''} booking requests found</div>
          <div className="text-xs text-gray-400 md:text-[#96928A] mt-1">Website booking submissions will appear here automatically in real time.</div>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="grid grid-cols-1 md:hidden gap-4">
            {filteredRequests.map((req) => {
              const isProcessing = actionLoadingId === req.id;
              return (
                <div 
                  key={req.id} 
                  className="p-4 rounded-[20px] bg-white border border-gray-100 shadow-sm flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          REQ-{req.id.slice(0, 8).toUpperCase()}
                        </span>
                        <h4 className="text-sm font-bold text-gray-900 mt-1">
                          {req.guest_name}
                        </h4>
                      </div>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          req.status === "pending"
                            ? "bg-amber-50 text-amber-600 border-amber-200"
                            : req.status === "approved"
                            ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                            : "bg-rose-50 text-rose-600 border-rose-200"
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-xl p-2.5 text-xs text-gray-700">
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase font-semibold">Stay Dates</div>
                        <div className="font-medium mt-0.5">
                          {formatISTCompactDate(req.check_in)} → {formatISTCompactDate(req.check_out)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-gray-400 uppercase font-semibold">Room & Guests</div>
                        <div className="font-medium mt-0.5 truncate">
                          {req.rooms?.name || "Room"} • {req.number_of_guests} G
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                      <div className="flex items-center gap-1 font-mono">
                        <Phone className="w-3 h-3 text-gray-400" />
                        <span>{req.guest_phone}</span>
                      </div>
                      <div className="font-bold text-gray-900">
                        ₹{(req.estimated_total || 0).toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <button
                      onClick={() => setSelectedRequest(req)}
                      className="flex-1 py-1.5 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Details
                    </button>
                    {req.status === "pending" && (
                      <>
                        <button
                          onClick={() => handleReject(req.id)}
                          disabled={isProcessing}
                          className="py-1.5 px-3 rounded-lg border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors"
                        >
                          Decline
                        </button>
                        <button
                          onClick={() => handleApprove(req.id)}
                          disabled={isProcessing}
                          className="py-1.5 px-3 rounded-lg bg-[#F59E0B] text-xs font-bold text-black hover:bg-[#D97706] transition-colors flex items-center justify-center gap-1"
                        >
                          {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Approve"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block w-full overflow-x-auto hide-scrollbar">
            <GlassPanel className="p-0 rounded-[24px] overflow-hidden border border-[rgba(255,255,255,0.05)]">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.05)] text-[10px] uppercase tracking-widest text-[#96928A] bg-[rgba(255,255,255,0.01)]">
                    <th className="px-6 py-4 font-semibold">Request Ref</th>
                    <th className="px-6 py-4 font-semibold">Guest</th>
                    <th className="px-6 py-4 font-semibold">Room Requested</th>
                    <th className="px-6 py-4 font-semibold">Stay Dates</th>
                    <th className="px-6 py-4 font-semibold">Estimated Total</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-[rgba(255,255,255,0.03)]">
                  {filteredRequests.map((req) => {
                    const isProcessing = actionLoadingId === req.id;
                    return (
                      <tr 
                        key={req.id}
                        className="hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                      >
                        <td className="px-6 py-4">
                          <span className="text-[11px] font-mono font-bold text-[#F59E0B] bg-[rgba(245,158,11,0.1)] px-2 py-0.5 rounded border border-[rgba(245,158,11,0.2)]">
                            REQ-{req.id.slice(0, 8).toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-[#F5F1E8]">{req.guest_name}</div>
                          <div className="text-xs text-[#96928A] font-mono mt-0.5">{req.guest_phone}</div>
                        </td>
                        <td className="px-6 py-4 text-[#F5F1E8]">
                          <div className="font-medium">{req.rooms?.name || "Room"}</div>
                          <div className="text-xs text-[#96928A]">{req.number_of_guests} guest(s)</div>
                        </td>
                        <td className="px-6 py-4 text-[#C7C3BA] text-xs">
                          <div>{formatISTCompactDate(req.check_in)}</div>
                          <div className="text-[#96928A]">to {formatISTCompactDate(req.check_out)}</div>
                        </td>
                        <td className="px-6 py-4 text-[#F5F1E8] font-bold">
                          ₹{(req.estimated_total || 0).toLocaleString("en-IN")}
                          <div className="text-[10px] text-[#96928A] font-normal">Pay at Property</div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                              req.status === "pending"
                                ? "bg-[rgba(245,158,11,0.1)] text-[#F59E0B] border-[rgba(245,158,11,0.2)]"
                                : req.status === "approved"
                                ? "bg-[rgba(16,185,129,0.1)] text-[#10B981] border-[rgba(16,185,129,0.2)]"
                                : "bg-[rgba(244,63,94,0.1)] text-[#F43F5E] border-[rgba(244,63,94,0.2)]"
                            }`}
                          >
                            {req.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelectedRequest(req)}
                              className="p-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.05)] text-[#C7C3BA] transition-colors"
                              title="View details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {req.status === "pending" && (
                              <>
                                <button
                                  onClick={() => handleReject(req.id)}
                                  disabled={isProcessing}
                                  className="px-2.5 py-1 rounded-lg border border-[rgba(244,63,94,0.3)] bg-[rgba(244,63,94,0.1)] text-xs font-semibold text-[#F43F5E] hover:bg-[rgba(244,63,94,0.2)] transition-colors"
                                >
                                  Decline
                                </button>
                                <button
                                  onClick={() => handleApprove(req.id)}
                                  disabled={isProcessing}
                                  className="px-3 py-1 rounded-lg bg-[#F59E0B] text-xs font-bold text-black hover:bg-[#D97706] transition-colors flex items-center gap-1"
                                >
                                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Approve & Confirm"}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </GlassPanel>
          </div>
        </>
      )}

      {/* Details Modal */}
      {selectedRequest && (
        <GlassModal
          isOpen={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
          title="Booking Request Details"
        >
          <div className="space-y-4 text-sm text-[#F5F1E8]">
            <div className="flex justify-between items-center pb-3 border-b border-[rgba(255,255,255,0.08)]">
              <div>
                <span className="text-xs font-mono font-bold text-[#F59E0B]">
                  REQ-{selectedRequest.id.slice(0, 8).toUpperCase()}
                </span>
                <div className="text-xs text-[#96928A] mt-0.5">
                  Submitted: {new Date(selectedRequest.created_at).toLocaleString("en-IN")}
                </div>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
                  selectedRequest.status === "pending"
                    ? "bg-[rgba(245,158,11,0.1)] text-[#F59E0B] border-[rgba(245,158,11,0.2)]"
                    : selectedRequest.status === "approved"
                    ? "bg-[rgba(16,185,129,0.1)] text-[#10B981] border-[rgba(16,185,129,0.2)]"
                    : "bg-[rgba(244,63,94,0.1)] text-[#F43F5E] border-[rgba(244,63,94,0.2)]"
                }`}
              >
                {selectedRequest.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[rgba(255,255,255,0.02)] p-3 rounded-xl border border-[rgba(255,255,255,0.05)]">
                <div className="text-xs text-[#96928A] uppercase font-semibold mb-1">Guest Contact</div>
                <div className="font-bold">{selectedRequest.guest_name}</div>
                <div className="text-xs text-[#C7C3BA] font-mono mt-1 flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-[#96928A]" />
                  {selectedRequest.guest_phone}
                </div>
                {selectedRequest.guest_email && (
                  <div className="text-xs text-[#C7C3BA] mt-1 flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-[#96928A]" />
                    {selectedRequest.guest_email}
                  </div>
                )}
              </div>

              <div className="bg-[rgba(255,255,255,0.02)] p-3 rounded-xl border border-[rgba(255,255,255,0.05)]">
                <div className="text-xs text-[#96928A] uppercase font-semibold mb-1">Reservation</div>
                <div className="font-bold">{selectedRequest.rooms?.name || "Room"}</div>
                <div className="text-xs text-[#C7C3BA] mt-1">
                  {formatISTCompactDate(selectedRequest.check_in)} → {formatISTCompactDate(selectedRequest.check_out)}
                </div>
                <div className="text-xs text-[#96928A] mt-1">
                  {selectedRequest.number_of_guests} guest(s)
                </div>
              </div>
            </div>

            <div className="bg-[rgba(255,255,255,0.02)] p-3 rounded-xl border border-[rgba(255,255,255,0.05)] flex justify-between items-center">
              <div>
                <div className="text-xs text-[#96928A] uppercase font-semibold">Payment Terms</div>
                <div className="text-xs text-[#C7C3BA] mt-0.5">Pay at Property (Check-in)</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-[#96928A] uppercase font-semibold">Estimated Amount</div>
                <div className="text-base font-bold text-[#F5F1E8]">
                  ₹{(selectedRequest.estimated_total || 0).toLocaleString("en-IN")}
                </div>
              </div>
            </div>

            {selectedRequest.notes && (
              <div className="bg-[rgba(255,255,255,0.02)] p-3 rounded-xl border border-[rgba(255,255,255,0.05)]">
                <div className="text-xs text-[#96928A] uppercase font-semibold mb-1">Notes / Preferences</div>
                <div className="text-xs text-[#C7C3BA] whitespace-pre-wrap">{selectedRequest.notes}</div>
              </div>
            )}

            {selectedRequest.status === "pending" && (
              <div className="flex justify-end gap-3 pt-3 border-t border-[rgba(255,255,255,0.08)]">
                <button
                  onClick={() => handleReject(selectedRequest.id)}
                  disabled={actionLoadingId === selectedRequest.id}
                  className="px-4 py-2 rounded-xl border border-[rgba(244,63,94,0.3)] bg-[rgba(244,63,94,0.1)] text-xs font-semibold text-[#F43F5E] hover:bg-[rgba(244,63,94,0.2)] transition-colors"
                >
                  Decline Request
                </button>
                <GlassButton
                  onClick={() => handleApprove(selectedRequest.id)}
                  disabled={actionLoadingId === selectedRequest.id}
                  variant="primary"
                >
                  {actionLoadingId === selectedRequest.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Approve & Confirm Reservation"
                  )}
                </GlassButton>
              </div>
            )}
          </div>
        </GlassModal>
      )}
    </div>
  );
}
