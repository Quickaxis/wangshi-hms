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
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-rose-900">Destructive Room Removal</h4>
            <p className="text-xs text-rose-700 leading-relaxed">
              This will permanently remove <strong className="text-rose-950 font-bold">{room.name}</strong> (Room #{room.room_number}) from the database. 
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
            Dependent Room Records
          </h5>

          {isLoadingSummary ? (
            <div className="flex items-center justify-center py-6 text-[#77758F] gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-[#5146D8]" />
              <span>Inspecting bookings for this room...</span>
            </div>
          ) : summary ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-[#F6F5FC] border border-[#E8E6F2] flex items-center gap-2.5">
                <CalendarCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#24213A]">
                    {summary.bookingsCount}
                    {summary.activeBookingsCount > 0 && (
                      <span className="text-[10px] text-emerald-600 font-semibold ml-1">({summary.activeBookingsCount} active)</span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#77758F]">Historical Bookings</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#F6F5FC] border border-[#E8E6F2] flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#77758F] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#24213A]">{summary.requestsCount}</div>
                  <div className="text-[10px] text-[#77758F]">Booking Requests</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Historical booking cascade warning */}
        {hasBookings ? (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
            <p>
              This room has <strong>{summary?.bookingsCount || 0} booking record(s)</strong>. Permanent deletion will remove these booking records and associated guest information.
            </p>
            <p className="text-[11px] text-amber-800">
              If you want to stop accepting bookings for this room without erasing booking history, click Cancel and use <strong>Deactivate</strong> instead.
            </p>
            <label className="flex items-center gap-2.5 pt-1 text-xs text-[#24213A] font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={cascadeConfirmed}
                onChange={(e) => setCascadeConfirmed(e.target.checked)}
                className="w-4 h-4 rounded bg-white border-[#E8E6F2] text-rose-600 focus:ring-0"
              />
              <span>I understand that all historical booking records for this room will be permanently erased</span>
            </label>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-[#F6F5FC] border border-[#E8E6F2] text-xs text-[#55536A]">
            This room has no dependent booking history. It can be safely deleted.
          </div>
        )}

        {/* Identifier Typing Confirmation */}
        <div className="space-y-2 pt-1 border-t border-[#E8E6F2]">
          <label className="block text-xs font-medium text-[#686579]">
            To confirm deletion, please type the room number:
            <span className="block mt-1 font-bold text-[#24213A] select-all bg-[#F6F5FC] px-2.5 py-1 rounded-lg border border-[#E8E6F2]">
              {room.room_number}
            </span>
          </label>
          <input
            type="text"
            value={typedIdentifier}
            onChange={(e) => setTypedIdentifier(e.target.value)}
            placeholder={`Type "${room.room_number}" to confirm`}
            className="w-full bg-white border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-sm text-[#24213A] placeholder-[#9D9AA8] outline-none focus:border-rose-500 transition-colors shadow-sm"
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
