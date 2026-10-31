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
import { cn } from "@/lib/utils";

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
      <div className="p-3 md:p-4 rounded-[20px] bg-[#FFFFFF] border border-[#E8E7F2] shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-[#77758F]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by guest name, phone, or reference..."
            className="w-full bg-transparent text-xs font-medium text-[#24213A] placeholder-[#8F8CA4] outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#F7F7FC] border border-[#E8E7F2] rounded-xl px-2.5 py-1">
            <Filter className="w-3.5 h-3.5 text-[#77758F]" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-[11px] md:text-xs font-medium text-[#24213A] outline-none cursor-pointer"
            >
              <option value="pending" className="bg-[#FFFFFF] text-[#24213A]">Pending ({pendingCount})</option>
              <option value="all" className="bg-[#FFFFFF] text-[#24213A]">All Requests ({requests.length})</option>
              <option value="approved" className="bg-[#FFFFFF] text-[#24213A]">Approved</option>
              <option value="rejected" className="bg-[#FFFFFF] text-[#24213A]">Declined</option>
            </select>
          </div>

          <button
            onClick={loadRequests}
            disabled={isLoading}
            className="p-1.5 rounded-lg border border-[#E8E7F2] hover:bg-[#F0EEFF] text-[#77758F] hover:text-[#5146D8] transition-colors cursor-pointer"
            title="Refresh requests"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Requests List */}
      {isLoading && requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Loader2 className="w-6 h-6 text-[#5146D8] animate-spin" />
          <span className="text-[#77758F] text-xs">Loading website booking requests...</span>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="bg-[#FFFFFF] border border-[#E8E7F2] rounded-[24px] p-10 flex flex-col items-center justify-center text-center shadow-sm">
          <Clock className="w-10 h-10 text-[#77758F]/40 mb-3" />
          <div className="text-[#24213A] font-bold text-base">No {statusFilter !== 'all' ? statusFilter : ''} booking requests found</div>
          <div className="text-xs text-[#77758F] mt-1 max-w-sm">Website booking submissions will appear here automatically in real time.</div>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="grid grid-cols-1 md:hidden gap-3">
            {filteredRequests.map((req) => {
              const isProcessing = actionLoadingId === req.id;
              return (
                <div 
                  key={req.id} 
                  className="p-4 rounded-[20px] bg-[#FFFFFF] border border-[#E8E7F2] shadow-sm flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-[#5146D8] bg-[#F0EEFF] px-2 py-0.5 rounded border border-[#E0DEF8]">
                          REQ-{req.id.slice(0, 8).toUpperCase()}
                        </span>
                        <h4 className="text-sm font-bold text-[#24213A] mt-1">
                          {req.guest_name}
                        </h4>
                      </div>
                      <span
                        className={cn(
                          "text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border",
                          req.status === "pending"
                            ? "bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]"
                            : req.status === "approved"
                            ? "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]"
                            : "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]"
                        )}
                      >
                        {req.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-[#F7F7FC] rounded-xl p-2.5 text-xs text-[#24213A] border border-[#E8E7F2]">
                      <div>
                        <div className="text-[9px] text-[#77758F] uppercase font-semibold">Stay Dates</div>
                        <div className="font-medium mt-0.5 text-[#24213A]">
                          {formatISTCompactDate(req.check_in)} → {formatISTCompactDate(req.check_out)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] text-[#77758F] uppercase font-semibold">Room & Guests</div>
                        <div className="font-medium mt-0.5 truncate text-[#24213A]">
                          {req.rooms?.name || "Room"} • {req.number_of_guests} G
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 font-mono text-[#77758F]">
                        <Phone className="w-3 h-3 text-[#77758F]" />
                        <span>{req.guest_phone}</span>
                      </div>
                      <div className="font-bold text-[#5146D8] text-sm">
                        ₹{(req.estimated_total || 0).toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-[#E8E7F2]">
                    <button
                      onClick={() => setSelectedRequest(req)}
                      className="flex-1 py-2 px-3 rounded-xl border border-[#E8E7F2] bg-[#FFFFFF] hover:bg-[#F7F7FC] text-xs font-semibold text-[#24213A] transition-colors cursor-pointer shadow-sm"
                    >
                      Details
                    </button>
                    {req.status === "pending" && (
                      <>
                        <button
                          onClick={() => handleReject(req.id)}
                          disabled={isProcessing}
                          className="py-2 px-3.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] text-xs font-semibold text-[#DC2626] hover:bg-[#FEE2E2] transition-colors cursor-pointer"
                        >
                          Decline
                        </button>
                        <button
                          onClick={() => handleApprove(req.id)}
                          disabled={isProcessing}
                          className="py-2 px-4 rounded-xl bg-[#5146D8] text-xs font-bold text-white hover:bg-[#4338CA] transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-sm"
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
            <div className="p-0 rounded-[24px] overflow-hidden border border-[#E8E7F2] bg-[#FFFFFF] shadow-sm">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="border-b border-[#E8E7F2] text-[10px] uppercase tracking-widest text-[#77758F] bg-[#F7F7FC]/70">
                    <th className="px-6 py-4 font-semibold">Request Ref</th>
                    <th className="px-6 py-4 font-semibold">Guest</th>
                    <th className="px-6 py-4 font-semibold">Room Requested</th>
                    <th className="px-6 py-4 font-semibold">Stay Dates</th>
                    <th className="px-6 py-4 font-semibold">Estimated Total</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-[#E8E7F2]">
                  {filteredRequests.map((req) => {
                    const isProcessing = actionLoadingId === req.id;
                    return (
                      <tr 
                        key={req.id}
                        className="hover:bg-[#F7F7FC] transition-colors"
                      >
                        <td className="px-6 py-4">
                          <span className="text-[11px] font-mono font-bold text-[#5146D8] bg-[#F0EEFF] px-2 py-0.5 rounded border border-[#E0DEF8]">
                            REQ-{req.id.slice(0, 8).toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-[#24213A]">{req.guest_name}</div>
                          <div className="text-xs text-[#77758F] font-mono mt-0.5">{req.guest_phone}</div>
                        </td>
                        <td className="px-6 py-4 text-[#24213A]">
                          <div className="font-medium">{req.rooms?.name || "Room"}</div>
                          <div className="text-xs text-[#77758F]">{req.number_of_guests} guest(s)</div>
                        </td>
                        <td className="px-6 py-4 text-[#24213A] text-xs">
                          <div>{formatISTCompactDate(req.check_in)}</div>
                          <div className="text-[#77758F]">to {formatISTCompactDate(req.check_out)}</div>
                        </td>
                        <td className="px-6 py-4 text-[#24213A] font-bold">
                          ₹{(req.estimated_total || 0).toLocaleString("en-IN")}
                          <div className="text-[10px] text-[#77758F] font-normal">Pay at Property</div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                              req.status === "pending"
                                ? "bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]"
                                : req.status === "approved"
                                ? "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]"
                                : "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]"
                            }`}
                          >
                            {req.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelectedRequest(req)}
                              className="p-1.5 rounded-lg border border-[#E8E7F2] hover:bg-[#F0EEFF] text-[#77758F] hover:text-[#5146D8] transition-colors cursor-pointer"
                              title="View details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {req.status === "pending" && (
                              <>
                                <button
                                  onClick={() => handleReject(req.id)}
                                  disabled={isProcessing}
                                  className="px-2.5 py-1 rounded-lg border border-[#FECACA] bg-[#FEF2F2] text-xs font-semibold text-[#DC2626] hover:bg-[#FEE2E2] transition-colors cursor-pointer"
                                >
                                  Decline
                                </button>
                                <button
                                  onClick={() => handleApprove(req.id)}
                                  disabled={isProcessing}
                                  className="px-3 py-1 rounded-lg bg-[#5146D8] text-xs font-bold text-white hover:bg-[#4338CA] transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
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
            </div>
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
          <div className="space-y-4 text-sm text-[#24213A]">
            <div className="flex justify-between items-center pb-3 border-b border-[#E8E7F2]">
              <div>
                <span className="text-xs font-mono font-bold text-[#5146D8]">
                  REQ-{selectedRequest.id.slice(0, 8).toUpperCase()}
                </span>
                <div className="text-xs text-[#77758F] mt-0.5">
                  Submitted: {new Date(selectedRequest.created_at).toLocaleString("en-IN")}
                </div>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
                  selectedRequest.status === "pending"
                    ? "bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]"
                    : selectedRequest.status === "approved"
                    ? "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]"
                    : "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]"
                }`}
              >
                {selectedRequest.status}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-[#F7F7FC] p-3 rounded-xl border border-[#E8E7F2]">
                <div className="text-xs text-[#77758F] uppercase font-semibold mb-1">Guest Contact</div>
                <div className="font-bold text-[#24213A]">{selectedRequest.guest_name}</div>
                <div className="text-xs text-[#77758F] font-mono mt-1 flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-[#77758F]" />
                  {selectedRequest.guest_phone}
                </div>
                {selectedRequest.guest_email && (
                  <div className="text-xs text-[#77758F] mt-1 flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-[#77758F]" />
                    {selectedRequest.guest_email}
                  </div>
                )}
              </div>

              <div className="bg-[#F7F7FC] p-3 rounded-xl border border-[#E8E7F2]">
                <div className="text-xs text-[#77758F] uppercase font-semibold mb-1">Reservation</div>
                <div className="font-bold text-[#24213A]">{selectedRequest.rooms?.name || "Room"}</div>
                <div className="text-xs text-[#24213A] mt-1">
                  {formatISTCompactDate(selectedRequest.check_in)} → {formatISTCompactDate(selectedRequest.check_out)}
                </div>
                <div className="text-xs text-[#77758F] mt-1">
                  {selectedRequest.number_of_guests} guest(s)
                </div>
              </div>
            </div>

            <div className="bg-[#F7F7FC] p-3 rounded-xl border border-[#E8E7F2] flex justify-between items-center">
              <div>
                <div className="text-xs text-[#77758F] uppercase font-semibold">Payment Terms</div>
                <div className="text-xs text-[#77758F] mt-0.5">Pay at Property (Check-in)</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-[#77758F] uppercase font-semibold">Estimated Amount</div>
                <div className="text-base font-bold text-[#5146D8]">
                  ₹{(selectedRequest.estimated_total || 0).toLocaleString("en-IN")}
                </div>
              </div>
            </div>

            {selectedRequest.notes && (
              <div className="bg-[#F7F7FC] p-3 rounded-xl border border-[#E8E7F2]">
                <div className="text-xs text-[#77758F] uppercase font-semibold mb-1">Notes / Preferences</div>
                <div className="text-xs text-[#24213A] whitespace-pre-wrap">{selectedRequest.notes}</div>
              </div>
            )}

            {selectedRequest.status === "pending" && (
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 pt-3 border-t border-[#E8E7F2]">
                <button
                  onClick={() => handleReject(selectedRequest.id)}
                  disabled={actionLoadingId === selectedRequest.id}
                  className="px-4 py-2.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] text-xs font-semibold text-[#DC2626] hover:bg-[#FEE2E2] transition-colors cursor-pointer"
                >
                  Decline Request
                </button>
                <GlassButton
                  onClick={() => handleApprove(selectedRequest.id)}
                  disabled={actionLoadingId === selectedRequest.id}
                  variant="primary"
                  className="py-2.5"
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
