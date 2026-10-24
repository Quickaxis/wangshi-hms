"use client";

import { useEffect, useState } from "react";
import { DbRoom } from "@/lib/types";
import { GlassModal } from "@/components/ui/GlassModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { AlertTriangle, CalendarCheck, Mail, Loader2 } from "lucide-react";
import { getRoomDeletionSummaryAction, deleteRoomAction } from "@/app/actions/admin";

interface DeleteRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: DbRoom | null;
  onDeleted: () => void;
}

function DeleteRoomModalContent({
  onClose,
  room,
  onDeleted
}: {
  onClose: () => void;
  room: DbRoom;
  onDeleted: () => void;
}) {
  const [summary, setSummary] = useState<{
    bookingsCount: number;
    activeBookingsCount: number;
    requestsCount: number;
    roomNumber: string;
    roomName: string;
  } | null>(null);

  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [typedIdentifier, setTypedIdentifier] = useState("");
  const [cascadeConfirmed, setCascadeConfirmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    getRoomDeletionSummaryAction(room.id).then((res) => {
      if (!isMounted) return;
      setIsLoadingSummary(false);
      if (res.success && res.data) {
        setSummary(res.data);
      } else {
        setError(res.error || "Could not load room records summary.");
      }
    });
    return () => {
      isMounted = false;
    };
  }, [room.id]);

  const ident = typedIdentifier.trim().toLowerCase();
  const isIdentifierMatched = ident === room.room_number.trim().toLowerCase() || ident === room.name.trim().toLowerCase();
  const hasBookings = (summary?.bookingsCount || 0) > 0 || (summary?.requestsCount || 0) > 0;
  const canDelete = isIdentifierMatched && (!hasBookings || cascadeConfirmed) && !isDeleting;

  const handleDelete = async () => {
    if (!canDelete) return;

    setIsDeleting(true);
    setError(null);

    const result = await deleteRoomAction(room.id, typedIdentifier, cascadeConfirmed);

    if (result.success) {
      setIsDeleting(false);
      onDeleted();
      onClose();
    } else {
      setIsDeleting(false);
      setError(result.error || "Failed to permanently delete room.");
    }
  };

  return (
    <GlassModal
      isOpen={true}
      onClose={onClose}
      title="Permanently Delete Room"
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
            {isDeleting ? "Deleting..." : "Permanently Delete Room"}
          </GlassButton>
        </>
      }
    >
      <div className="space-y-5 text-sm">
        {/* Warning Banner */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-red-200">Destructive Room Removal</h4>
            <p className="text-xs text-red-300/90 leading-relaxed">
              This will permanently remove <strong className="text-white font-bold">{room.name}</strong> (Room #{room.room_number}) from the database. 
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
            Dependent Room Records
          </h5>

          {isLoadingSummary ? (
            <div className="flex items-center justify-center py-6 text-[#96928A] gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-[#F59E0B]" />
              <span>Inspecting bookings for this room...</span>
            </div>
          ) : summary ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] flex items-center gap-2.5">
                <CalendarCheck className="w-4 h-4 text-[#4FE77B] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#F5F1E8]">
                    {summary.bookingsCount}
                    {summary.activeBookingsCount > 0 && (
                      <span className="text-[10px] text-[#4FE77B] ml-1">({summary.activeBookingsCount} active)</span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#96928A]">Historical Bookings</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#C7C3BA] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#F5F1E8]">{summary.requestsCount}</div>
                  <div className="text-[10px] text-[#96928A]">Booking Requests</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Historical booking cascade warning */}
        {hasBookings ? (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 space-y-2">
            <p>
              This room has <strong>{summary?.bookingsCount || 0} booking record(s)</strong>. Permanent deletion will remove these booking records and associated guest information.
            </p>
            <p className="text-[11px] text-[#C7C3BA]">
              If you want to stop accepting bookings for this room without erasing booking history, click Cancel and use <strong>Deactivate</strong> instead.
            </p>
            <label className="flex items-center gap-2.5 pt-1 text-xs text-[#F5F1E8] font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={cascadeConfirmed}
                onChange={(e) => setCascadeConfirmed(e.target.checked)}
                className="w-4 h-4 rounded bg-transparent border-[rgba(255,255,255,0.2)] text-red-500 focus:ring-0"
              />
              <span>I understand that all historical booking records for this room will be permanently erased</span>
            </label>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] text-xs text-[#96928A]">
            This room has no dependent booking history. It can be safely deleted.
          </div>
        )}

        {/* Identifier Typing Confirmation */}
        <div className="space-y-2 pt-1 border-t border-[rgba(255,255,255,0.06)]">
          <label className="block text-xs font-medium text-[#C7C3BA]">
            To confirm deletion, please type the room number:
            <span className="block mt-1 font-bold text-[#F5F1E8] select-all bg-[rgba(255,255,255,0.05)] px-2.5 py-1 rounded-lg border border-[rgba(255,255,255,0.08)]">
              {room.room_number}
            </span>
          </label>
          <input
            type="text"
            value={typedIdentifier}
            onChange={(e) => setTypedIdentifier(e.target.value)}
            placeholder={`Type "${room.room_number}" to confirm`}
            className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-2.5 text-sm text-[#F5F1E8] outline-none focus:border-red-400 transition-colors"
            autoFocus
          />
        </div>
      </div>
    </GlassModal>
  );
}

export function DeleteRoomModal({
  isOpen,
  onClose,
  room,
  onDeleted
}: DeleteRoomModalProps) {
  if (!isOpen || !room) return null;

  return (
    <DeleteRoomModalContent
      key={room.id}
      onClose={onClose}
      room={room}
      onDeleted={onDeleted}
    />
  );
}
