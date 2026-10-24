"use client";

import { useEffect, useState } from "react";
import { Homestay } from "@/lib/types";
import { GlassModal } from "@/components/ui/GlassModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { AlertTriangle, BedDouble, CalendarCheck, Users, Mail, Loader2, UserCheck } from "lucide-react";
import { getHomestayDeletionSummaryAction, deleteHomestayAction } from "@/app/actions/admin";

interface DeleteHomestayModalProps {
  isOpen: boolean;
  onClose: () => void;
  homestay: Homestay | null;
  onDeleted: () => void;
}

function DeleteHomestayModalContent({
  onClose,
  homestay,
  onDeleted
}: {
  onClose: () => void;
  homestay: Homestay;
  onDeleted: () => void;
}) {
  const [summary, setSummary] = useState<{
    roomsCount: number;
    bookingsCount: number;
    activeBookingsCount: number;
    guestsCount: number;
    partnersCount: number;
    requestsCount: number;
    homestayName: string;
  } | null>(null);

  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [typedName, setTypedName] = useState("");
  const [cascadeConfirmed, setCascadeConfirmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    getHomestayDeletionSummaryAction(homestay.id).then((res) => {
      if (!isMounted) return;
      setIsLoadingSummary(false);
      if (res.success && res.data) {
        setSummary(res.data);
      } else {
        setError(res.error || "Could not load property records summary.");
      }
    });
    return () => {
      isMounted = false;
    };
  }, [homestay.id]);

  const isNameMatched = typedName.trim().toLowerCase() === homestay.name.trim().toLowerCase();
  const hasBookings = (summary?.bookingsCount || 0) > 0;
  const canDelete = isNameMatched && (!hasBookings || cascadeConfirmed) && !isDeleting;

  const handleDelete = async () => {
    if (!canDelete) return;

    setIsDeleting(true);
    setError(null);

    const result = await deleteHomestayAction(homestay.id, typedName);

    if (result.success) {
      setIsDeleting(false);
      onDeleted();
      onClose();
    } else {
      setIsDeleting(false);
      setError(result.error || "Failed to permanently delete homestay.");
    }
  };

  return (
    <GlassModal
      isOpen={true}
      onClose={onClose}
      title="Permanently Delete Homestay"
      footer={
        <>
          <GlassButton variant="ghost" onClick={onClose} disabled={isDeleting}>
            Cancel
          </GlassButton>
          <GlassButton
            variant="danger"
            onClick={handleDelete}
            disabled={!canDelete}
            isLoading={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Permanently Delete"}
          </GlassButton>
        </>
      }
    >
      <div className="space-y-5 text-sm">
        {/* Warning Banner */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-red-200">Destructive & Irreversible Action</h4>
            <p className="text-xs text-red-300/90 leading-relaxed">
              This will permanently delete <strong className="text-white font-bold">{homestay.name}</strong> from the database. 
              This action cannot be undone.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs">
            {error}
          </div>
        )}

        {/* Dependent Records Inspection */}
        <div>
          <h5 className="text-xs font-semibold text-[#96928A] uppercase tracking-wider mb-2.5">
            Dependent Property Records
          </h5>

          {isLoadingSummary ? (
            <div className="flex items-center justify-center py-6 text-[#96928A] gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-[#F59E0B]" />
              <span>Inspecting database relationships...</span>
            </div>
          ) : summary ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] flex items-center gap-2.5">
                <BedDouble className="w-4 h-4 text-[#F59E0B] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#F5F1E8]">{summary.roomsCount}</div>
                  <div className="text-[10px] text-[#96928A]">Rooms</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] flex items-center gap-2.5">
                <CalendarCheck className="w-4 h-4 text-[#4FE77B] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#F5F1E8]">
                    {summary.bookingsCount}
                    {summary.activeBookingsCount > 0 && (
                      <span className="text-[10px] text-[#4FE77B] ml-1">({summary.activeBookingsCount} active)</span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#96928A]">Bookings</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] flex items-center gap-2.5">
                <Users className="w-4 h-4 text-[#C7C3BA] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#F5F1E8]">{summary.guestsCount}</div>
                  <div className="text-[10px] text-[#96928A]">Guests</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] flex items-center gap-2.5">
                <UserCheck className="w-4 h-4 text-[#F59E0B] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#F5F1E8]">{summary.partnersCount}</div>
                  <div className="text-[10px] text-[#96928A]">Staff Partners</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#C7C3BA] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#F5F1E8]">{summary.requestsCount}</div>
                  <div className="text-[10px] text-[#96928A]">Requests</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Historical booking cascade warning */}
        {hasBookings && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 space-y-2">
            <p>
              This homestay contains <strong>{summary?.bookingsCount} historical booking record(s)</strong>. Permanent deletion will permanently erase these bookings and guest histories.
            </p>
            <p className="text-[11px] text-[#C7C3BA]">
              If you only want to take this property offline, you can use <strong>Deactivate</strong> instead.
            </p>
            <label className="flex items-center gap-2.5 pt-1 text-xs text-[#F5F1E8] font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={cascadeConfirmed}
                onChange={(e) => setCascadeConfirmed(e.target.checked)}
                className="w-4 h-4 rounded bg-transparent border-[rgba(255,255,255,0.2)] text-red-500 focus:ring-0"
              />
              <span>I confirm permanent deletion of all booking records and dependent data</span>
            </label>
          </div>
        )}

        {/* Name Typing Confirmation */}
        <div className="space-y-2 pt-1 border-t border-[rgba(255,255,255,0.06)]">
          <label className="block text-xs font-medium text-[#C7C3BA]">
            To confirm deletion, please type the property name:
            <span className="block mt-1 font-bold text-[#F5F1E8] select-all bg-[rgba(255,255,255,0.05)] px-2.5 py-1 rounded-lg border border-[rgba(255,255,255,0.08)]">
              {homestay.name}
            </span>
          </label>
          <input
            type="text"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder={`Type "${homestay.name}"`}
            className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-2.5 text-sm text-[#F5F1E8] outline-none focus:border-red-400 transition-colors"
            autoFocus
          />
        </div>
      </div>
    </GlassModal>
  );
}

export function DeleteHomestayModal({
  isOpen,
  onClose,
  homestay,
  onDeleted
}: DeleteHomestayModalProps) {
  if (!isOpen || !homestay) return null;

  return (
    <DeleteHomestayModalContent
      key={homestay.id}
      onClose={onClose}
      homestay={homestay}
      onDeleted={onDeleted}
    />
  );
}
