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
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-rose-900">Destructive & Irreversible Action</h4>
            <p className="text-xs text-rose-700 leading-relaxed">
              This will permanently delete <strong className="text-rose-950 font-bold">{homestay.name}</strong> from the database. 
              This action cannot be undone.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        )}

        {/* Dependent Records Inspection */}
        <div>
          <h5 className="text-xs font-semibold text-[#686579] uppercase tracking-wider mb-2.5">
            Dependent Property Records
          </h5>

          {isLoadingSummary ? (
            <div className="flex items-center justify-center py-6 text-[#77758F] gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-[#5146D8]" />
              <span>Inspecting database relationships...</span>
            </div>
          ) : summary ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl bg-[#F6F5FC] border border-[#E8E6F2] flex items-center gap-2.5">
                <BedDouble className="w-4 h-4 text-[#5146D8] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#24213A]">{summary.roomsCount}</div>
                  <div className="text-[10px] text-[#77758F]">Rooms</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#F6F5FC] border border-[#E8E6F2] flex items-center gap-2.5">
                <CalendarCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#24213A]">
                    {summary.bookingsCount}
                    {summary.activeBookingsCount > 0 && (
                      <span className="text-[10px] text-emerald-600 font-semibold ml-1">({summary.activeBookingsCount} active)</span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#77758F]">Bookings</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#F6F5FC] border border-[#E8E6F2] flex items-center gap-2.5">
                <Users className="w-4 h-4 text-[#77758F] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#24213A]">{summary.guestsCount}</div>
                  <div className="text-[10px] text-[#77758F]">Guests</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#F6F5FC] border border-[#E8E6F2] flex items-center gap-2.5">
                <UserCheck className="w-4 h-4 text-[#D97706] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#24213A]">{summary.partnersCount}</div>
                  <div className="text-[10px] text-[#77758F]">Staff Partners</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#F6F5FC] border border-[#E8E6F2] flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#77758F] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#24213A]">{summary.requestsCount}</div>
                  <div className="text-[10px] text-[#77758F]">Requests</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Historical booking cascade warning */}
        {hasBookings && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
            <p>
              This homestay contains <strong>{summary?.bookingsCount} historical booking record(s)</strong>. Permanent deletion will permanently erase these bookings and guest histories.
            </p>
            <p className="text-[11px] text-amber-800">
              If you only want to take this property offline, you can use <strong>Deactivate</strong> instead.
            </p>
            <label className="flex items-center gap-2.5 pt-1 text-xs text-[#24213A] font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={cascadeConfirmed}
                onChange={(e) => setCascadeConfirmed(e.target.checked)}
                className="w-4 h-4 rounded bg-white border-[#E8E6F2] text-rose-600 focus:ring-0"
              />
              <span>I confirm permanent deletion of all booking records and dependent data</span>
            </label>
          </div>
        )}

        {/* Name Typing Confirmation */}
        <div className="space-y-2 pt-1 border-t border-[#E8E6F2]">
          <label className="block text-xs font-medium text-[#686579]">
            To confirm deletion, please type the property name:
            <span className="block mt-1 font-bold text-[#24213A] select-all bg-[#F6F5FC] px-2.5 py-1 rounded-lg border border-[#E8E6F2]">
              {homestay.name}
            </span>
          </label>
          <input
            type="text"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder={`Type "${homestay.name}"`}
            className="w-full bg-white border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-sm text-[#24213A] placeholder-[#9D9AA8] outline-none focus:border-rose-500 transition-colors shadow-sm"
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
