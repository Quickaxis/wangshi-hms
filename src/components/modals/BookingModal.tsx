"use client";

import { useState, useEffect, useMemo } from "react";
import { GlassModal } from "../ui/GlassModal";
import { Room, BookingGuest, PaymentMethod } from "@/lib/types";
import { CreateBookingInput, BookingActionResult } from "@/app/actions/bookings";
import { recordPaymentAction } from "@/app/actions/payments";
import {
  User,
  Phone,
  Calendar as CalendarIcon,
  Users,
  IndianRupee,
  NotebookPen,
  Plus,
  X,
  AlertCircle,
  BedDouble,
  Layers,
  Trash2,
  CreditCard
} from "lucide-react";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useHMSContext } from "../providers/HMSProvider";

interface BookingModalProps {
  room?: Room | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (input: CreateBookingInput) => Promise<BookingActionResult>;
  defaultDate?: string;
}

export function BookingModal({ room, isOpen, onClose, onConfirm, defaultDate }: BookingModalProps) {
  const { rooms: allHMSrooms } = useHMSContext();
  const [selectedRooms, setSelectedRooms] = useState<Room[]>([]);
  const [roomToAddId, setRoomToAddId] = useState<string>("");
  const [guests, setGuests] = useState<BookingGuest[]>([]);
  const [guestInput, setGuestInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const initialCheckIn = defaultDate || format(new Date(), "yyyy-MM-dd");
  const initialCheckOut = format(addDays(new Date(initialCheckIn), 1), "yyyy-MM-dd");

  const [formData, setFormData] = useState({
    phone: "",
    checkIn: initialCheckIn,
    checkOut: initialCheckOut,
    notes: "",
  });

  // Advance Payment recording state
  const [collectAdvance, setCollectAdvance] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState<PaymentMethod>("upi");
  const [advanceRef, setAdvanceRef] = useState("");

  // Active rooms in the current property that are not yet selected
  const availableRoomsToAdd = useMemo(() => {
    const selectedIds = new Set(selectedRooms.map((r) => r.id));
    return allHMSrooms.filter((r) => r.is_active !== false && !selectedIds.has(r.id));
  }, [allHMSrooms, selectedRooms]);

  // Calculate nights and estimated total
  const nights = Math.max(
    1,
    Math.round(
      (new Date(formData.checkOut).getTime() - new Date(formData.checkIn).getTime()) /
        (1000 * 60 * 60 * 24)
    ) || 1
  );

  const totalCapacity = useMemo(() => {
    return selectedRooms.reduce((sum, r) => sum + (r.maxCapacity || 2), 0);
  }, [selectedRooms]);

  const roomBreakdowns = useMemo(() => {
    return selectedRooms.map((r) => ({
      room: r,
      rate: r.pricePerNight,
      total: nights * r.pricePerNight,
    }));
  }, [selectedRooms, nights]);

  const estimatedTotal = useMemo(() => {
    return roomBreakdowns.reduce((sum, item) => sum + item.total, 0);
  }, [roomBreakdowns]);

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      if (room) {
        setSelectedRooms([room]);
      } else if (allHMSrooms.length > 0) {
        const firstActive = allHMSrooms.find((r) => r.is_active !== false) || allHMSrooms[0];
        setSelectedRooms([firstActive]);
      } else {
        setSelectedRooms([]);
      }
      setRoomToAddId("");
      setGuests([]);
      setGuestInput("");
      setErrorMessage(null);
      setIsSubmitting(false);
      setCollectAdvance(false);
      setAdvanceAmount("");
      setAdvanceMethod("upi");
      setAdvanceRef("");
      const inDate = defaultDate || format(new Date(), "yyyy-MM-dd");
      setFormData({
        phone: "",
        checkIn: inDate,
        checkOut: format(addDays(new Date(inDate), 1), "yyyy-MM-dd"),
        notes: "",
      });
    }
  }, [isOpen, room, allHMSrooms, defaultDate]);

  const handleAddRoom = (roomId: string) => {
    if (!roomId) return;
    const roomToAdd = allHMSrooms.find((r) => r.id === roomId);
    if (!roomToAdd) return;
    if (selectedRooms.some((r) => r.id === roomId)) return;

    setSelectedRooms([...selectedRooms, roomToAdd]);
    setRoomToAddId("");
    setErrorMessage(null);
  };

  const handleRemoveRoom = (roomIdToRemove: string) => {
    if (selectedRooms.length <= 1) {
      setErrorMessage("A booking must include at least one room.");
      return;
    }
    setSelectedRooms(selectedRooms.filter((r) => r.id !== roomIdToRemove));
    setErrorMessage(null);
  };

  const handleAddGuest = () => {
    const trimmed = guestInput.trim();
    if (!trimmed) return;

    if (guests.length >= totalCapacity) return;

    if (guests.some((g) => g.name.toLowerCase() === trimmed.toLowerCase())) return;

    setGuests([...guests, { name: trimmed, isPrimary: guests.length === 0 }]);
    setGuestInput("");
    setErrorMessage(null);
  };

  const handleRemoveGuest = (indexToRemove: number) => {
    const newGuests = guests.filter((_, idx) => idx !== indexToRemove);
    if (newGuests.length > 0 && indexToRemove === 0) {
      newGuests[0].isPrimary = true;
    }
    setGuests(newGuests);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRooms.length === 0) {
      setErrorMessage("Please select at least one room.");
      return;
    }

    if (guests.length === 0) {
      setErrorMessage("Please add at least one primary guest before confirming.");
      return;
    }

    if (!formData.phone.trim()) {
      setErrorMessage("Please enter a contact phone number for the primary guest.");
      return;
    }

    if (new Date(formData.checkOut) <= new Date(formData.checkIn)) {
      setErrorMessage("Check-out date must be strictly after check-in date.");
      return;
    }

    if (collectAdvance) {
      const advAmt = parseFloat(advanceAmount);
      if (isNaN(advAmt) || advAmt <= 0) {
        setErrorMessage("Please enter a valid advance payment amount greater than zero, or uncheck advance collection.");
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const bookingPayload: CreateBookingInput = {
      roomId: selectedRooms[0]?.id,
      roomIds: selectedRooms.map((r) => r.id),
      checkIn: formData.checkIn,
      checkOut: formData.checkOut,
      numberOfGuests: guests.length,
      guests: guests.map((g, idx) => ({
        name: g.name,
        isPrimary: idx === 0 || g.isPrimary,
        phone: idx === 0 ? formData.phone : undefined,
      })),
      guestPhone: formData.phone.trim(),
      notes: formData.notes.trim() || undefined,
    };

    const result = await onConfirm(bookingPayload);

    if (!result.success) {
      setErrorMessage(result.error || "Failed to create booking.");
      setIsSubmitting(false);
      return;
    }

    if (collectAdvance && parseFloat(advanceAmount) > 0 && result.bookingId) {
      try {
        await recordPaymentAction({
          bookingId: result.bookingId,
          amount: advanceAmount.trim(),
          paymentType: 'payment',
          paymentMethod: advanceMethod,
          paymentStage: 'advance',
          transactionRef: advanceRef.trim() || null,
          notes: 'Pre-arrival advance payment collected at reservation booking',
        });
      } catch (payErr: any) {
        console.warn("Advance payment recording error on booking creation:", payErr);
      }
    }

    setIsSubmitting(false);
    onClose();
  };

  const isAtCapacity = totalCapacity > 0 && guests.length >= totalCapacity;
  const isGroup = selectedRooms.length > 1;

  const modalTitle = isGroup
    ? `Group Booking (${selectedRooms.length} Rooms)`
    : selectedRooms[0]
    ? `Book ${selectedRooms[0].name}`
    : "New Booking";

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      className="sm:max-w-2xl max-h-[94dvh] sm:max-h-[90vh]"
      footer={
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 w-full">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-full text-xs font-semibold bg-[#FFFFFF] hover:bg-[#F0EEFF] border border-[#E8E6F2] hover:border-[#8B83F6] text-[#77758F] hover:text-[#5146D8] shadow-sm transition-all cursor-pointer disabled:opacity-50 w-full sm:w-auto"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="booking-form"
            disabled={guests.length === 0 || selectedRooms.length === 0 || isSubmitting}
            className={cn(
              "px-6 py-2.5 rounded-full text-xs font-semibold flex items-center justify-center gap-2 transition-all w-full sm:w-auto shadow-sm",
              guests.length === 0 || selectedRooms.length === 0 || isSubmitting
                ? "bg-[#E8E6F2] text-[#77758F] cursor-not-allowed border border-[#E8E6F2] shadow-none"
                : "bg-[#5146D8] hover:bg-[#4338CA] text-white shadow-md shadow-[#5146D8]/20 cursor-pointer active:scale-95"
            )}
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Confirming {isGroup ? "Group" : "Room"}...</span>
              </>
            ) : (
              <span>
                Confirm {isGroup ? `Group (${selectedRooms.length} Rooms · ₹${estimatedTotal.toLocaleString("en-IN")})` : `Booking (₹${estimatedTotal.toLocaleString("en-IN")})`}
              </span>
            )}
          </button>
        </div>
      }
    >
      <form id="booking-form" onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2.5 text-xs text-rose-700 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Selected Rooms Section (Multi-room support) */}
        <div className="bg-[#F6F5FC] border border-[#E8E6F2] rounded-2xl p-3.5 sm:p-4 space-y-3">
          <div className="flex justify-between items-center gap-2">
            <label className="text-xs font-semibold tracking-wider text-[#77758F] uppercase flex items-center gap-1.5 truncate">
              <BedDouble className="w-4 h-4 text-[#5146D8] shrink-0" />
              <span>Selected Rooms ({selectedRooms.length})</span>
            </label>
            <span className="text-xs font-semibold text-[#5146D8] bg-[#F0EEFF] px-2.5 py-0.5 rounded-full border border-[#E0DEF8]">
              {nights} {nights === 1 ? "night" : "nights"}
            </span>
          </div>

          {/* Room list chips */}
          <div className="space-y-2">
            {selectedRooms.map((r, idx) => {
              const rTotal = nights * r.pricePerNight;
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#FFFFFF] border border-[#E8E6F2] shadow-sm gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-[#F0EEFF] border border-[#E0DEF8] text-[#5146D8] flex items-center justify-center font-bold text-xs shrink-0">
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-[#24213A] truncate flex items-center gap-1.5">
                        <span>{r.name}</span>
                        {idx === 0 && selectedRooms.length > 1 && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#5146D8] bg-[#F0EEFF] px-1.5 py-0.2 rounded border border-[#E0DEF8]">
                            Lead
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#77758F] font-medium">
                        ₹{r.pricePerNight.toLocaleString("en-IN")}/night · Max {r.maxCapacity} guests
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="font-bold text-xs text-[#24213A] font-mono tabular-nums">
                        ₹{rTotal.toLocaleString("en-IN")}
                      </div>
                      <div className="text-[10px] text-[#77758F]">
                        {nights}n × ₹{r.pricePerNight.toLocaleString("en-IN")}
                      </div>
                    </div>

                    {selectedRooms.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRoom(r.id)}
                        disabled={isSubmitting}
                        title="Remove room from group"
                        className="p-1 rounded-lg hover:bg-rose-50 text-[#77758F] hover:text-[#DC2626] transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Another Room Dropdown */}
          {availableRoomsToAdd.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <select
                value={roomToAddId}
                onChange={(e) => {
                  setRoomToAddId(e.target.value);
                  if (e.target.value) {
                    handleAddRoom(e.target.value);
                  }
                }}
                disabled={isSubmitting}
                className="flex-1 h-9 rounded-xl bg-[#FFFFFF] border border-[#E8E6F2] hover:border-[#5146D8]/40 px-3 text-xs text-[#24213A] font-medium outline-none transition-colors cursor-pointer"
              >
                <option value="">+ Add another room to this group booking...</option>
                {availableRoomsToAdd.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} (₹{r.pricePerNight.toLocaleString("en-IN")}/night · Max {r.maxCapacity} guests)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Primary Guest & Additional Guests Section */}
        <div className="bg-[#F6F5FC] border border-[#E8E6F2] rounded-2xl p-3 sm:p-4 space-y-3">
          <div className="flex justify-between items-center gap-2">
            <label className="text-xs font-semibold tracking-wider text-[#77758F] uppercase flex items-center gap-1.5 sm:gap-2 truncate">
              <Users className="w-3.5 h-3.5 text-[#5146D8] shrink-0" />
              <span className="truncate">Guests ({guests.length}/{totalCapacity})</span>
            </label>
            {isAtCapacity ? (
              <span className="text-[10px] text-[#DC2626] font-semibold uppercase tracking-wider bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 shrink-0">
                Max Capacity
              </span>
            ) : (
              <span className="text-[11px] text-[#77758F] font-medium shrink-0">
                Combined capacity: {totalCapacity} guests
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative min-w-0">
              <input
                type="text"
                value={guestInput}
                onChange={(e) => setGuestInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddGuest();
                  }
                }}
                disabled={isAtCapacity || isSubmitting}
                placeholder={isAtCapacity ? "Group capacity reached" : "Enter guest full name..."}
                className="w-full h-10 bg-[#FFFFFF] border border-[#E8E6F2] hover:border-[#5146D8]/40 rounded-xl px-3.5 sm:px-4 text-sm text-[#24213A] placeholder:text-[#77758F]/60 outline-none transition-all focus:border-[#5146D8] focus:ring-2 focus:ring-[#5146D8]/10 shadow-sm disabled:bg-[#F6F5FC] disabled:text-[#77758F] disabled:cursor-not-allowed min-w-0"
              />
            </div>
            <button
              type="button"
              onClick={handleAddGuest}
              disabled={!guestInput.trim() || isAtCapacity || isSubmitting}
              className="h-10 px-4 sm:px-5 rounded-xl bg-[#5146D8] hover:bg-[#4338CA] text-white text-sm font-semibold transition-all flex items-center gap-1.5 shadow-sm shadow-[#5146D8]/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-[#E8E6F2] disabled:text-[#77758F] disabled:shadow-none cursor-pointer shrink-0 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>

          {/* Guest chips */}
          <div className="flex flex-wrap gap-2 pt-1">
            {guests.length === 0 ? (
              <div className="w-full py-2.5 px-3.5 rounded-xl border border-dashed border-[#E8E6F2] bg-[#FFFFFF] text-center">
                <span className="text-xs font-medium text-[#77758F]">
                  No guests added yet. Add at least 1 guest (the primary contact).
                </span>
              </div>
            ) : (
              guests.map((guest, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors shadow-sm",
                    guest.isPrimary
                      ? "bg-[#F0EEFF] border-[#E8E6F2] text-[#5146D8]"
                      : "bg-[#FFFFFF] border-[#E8E6F2] text-[#24213A]"
                  )}
                >
                  <User className="w-3 h-3 text-[#5146D8]" />
                  <span className="font-medium">{guest.name}</span>
                  {guest.isPrimary && (
                    <span className="text-[#5146D8] text-[10px] font-semibold uppercase ml-0.5 tracking-wider">
                      (Primary)
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveGuest(idx)}
                    disabled={isSubmitting}
                    className="ml-1 p-0.5 rounded-full hover:bg-rose-50 text-[#77758F] hover:text-[#DC2626] transition-colors cursor-pointer"
                    title="Remove guest"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Contact Phone & Combined Total */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#77758F] ml-1">
              Primary Phone Number <span className="text-rose-500">*</span>
            </label>
            <div className="relative flex items-center w-full">
              <div className="absolute left-3.5 text-[#77758F] pointer-events-none">
                <Phone className="w-4 h-4" />
              </div>
              <input
                type="tel"
                placeholder="Enter 10-digit phone number"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
                disabled={isSubmitting}
                className="w-full h-10 rounded-xl bg-[#FFFFFF] border border-[#E8E6F2] hover:border-[#5146D8]/40 pl-10 pr-3.5 text-sm text-[#24213A] placeholder:text-[#77758F]/60 font-mono transition-all focus:outline-none focus:border-[#5146D8] focus:ring-2 focus:ring-[#5146D8]/10 shadow-sm disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 w-full min-w-0">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#77758F] ml-1 truncate">
              {isGroup ? "Combined Group Total" : "Calculated Total"} ({nights} {nights === 1 ? "night" : "nights"})
            </label>
            <div className="flex items-center justify-between h-10 px-3.5 sm:px-4 rounded-xl bg-[#FFFFFF] border border-[#E8E6F2] shadow-sm min-w-0 gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <IndianRupee className="w-4 h-4 text-[#5146D8] shrink-0" />
                <span className="font-bold text-sm text-[#24213A] font-mono tabular-nums truncate">
                  ₹{estimatedTotal.toLocaleString("en-IN")}
                </span>
              </div>
              <span className="text-xs font-mono tabular-nums text-[#77758F] shrink-0 whitespace-nowrap">
                {selectedRooms.length} {selectedRooms.length === 1 ? "room" : "rooms"}
              </span>
            </div>
          </div>
        </div>

        {/* Dates & Schedule */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5 w-full">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#77758F] ml-1">
                Check-in Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative flex items-center w-full">
                <div className="absolute left-3.5 text-[#77758F] pointer-events-none">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <input
                  type="date"
                  value={formData.checkIn}
                  onChange={(e) => setFormData({ ...formData, checkIn: e.target.value })}
                  required
                  disabled={isSubmitting}
                  style={{ colorScheme: "light" }}
                  className="w-full h-10 rounded-xl bg-[#FFFFFF] border border-[#E8E6F2] hover:border-[#5146D8]/40 pl-10 pr-3.5 text-sm text-[#24213A] transition-all focus:outline-none focus:border-[#5146D8] focus:ring-2 focus:ring-[#5146D8]/10 shadow-sm cursor-pointer disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 w-full">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#77758F] ml-1">
                Check-out Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative flex items-center w-full">
                <div className="absolute left-3.5 text-[#77758F] pointer-events-none">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <input
                  type="date"
                  value={formData.checkOut}
                  onChange={(e) => setFormData({ ...formData, checkOut: e.target.value })}
                  required
                  disabled={isSubmitting}
                  style={{ colorScheme: "light" }}
                  className="w-full h-10 rounded-xl bg-[#FFFFFF] border border-[#E8E6F2] hover:border-[#5146D8]/40 pl-10 pr-3.5 text-sm text-[#24213A] transition-all focus:outline-none focus:border-[#5146D8] focus:ring-2 focus:ring-[#5146D8]/10 shadow-sm cursor-pointer disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center p-2.5 rounded-xl bg-[#F6F5FC] border border-[#E8E6F2] text-xs font-medium text-[#77758F]">
            Standard check-in: 12:00 PM &nbsp;&bull;&nbsp; Standard check-out: 11:00 AM
          </div>
        </div>

        {/* Special Notes & Booking Source */}
        <div className="flex flex-col gap-1.5 w-full">
          <label className="text-xs font-semibold uppercase tracking-wider text-[#77758F] ml-1 flex items-center gap-1.5">
            <NotebookPen className="w-3.5 h-3.5 text-[#5146D8]" />
            <span>Booking Source & Notes</span>
          </label>
          <textarea
            rows={2}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            disabled={isSubmitting}
            placeholder="e.g. Booking source (Walk-in / Phone / OTA), arrival time, dietary notes..."
            className="w-full bg-[#FFFFFF] border border-[#E8E6F2] hover:border-[#5146D8]/40 rounded-xl p-3 text-sm text-[#24213A] placeholder:text-[#77758F]/60 focus:outline-none focus:border-[#5146D8] focus:ring-2 focus:ring-[#5146D8]/10 shadow-sm resize-none transition-all disabled:opacity-50 disabled:bg-[#F6F5FC]"
          />
        </div>

        {/* Pre-Arrival Advance Payment (Optional) */}
        <div className="bg-[#F7F7FC] border border-[#E8E6F2] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#24213A] flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={collectAdvance}
                onChange={(e) => setCollectAdvance(e.target.checked)}
                disabled={isSubmitting}
                className="w-4 h-4 rounded text-[#5146D8] focus:ring-[#5146D8]/20 border-[#E8E6F2] cursor-pointer"
              />
              <CreditCard className="w-3.5 h-3.5 text-[#5146D8]" />
              <span>Collect Advance Payment Deposit (Optional)</span>
            </label>
            <span className="text-[10px] text-[#059669] font-semibold bg-[#ECFDF5] px-2 py-0.5 rounded-full border border-[#A7F3D0]">
              Pre-Arrival
            </span>
          </div>

          {collectAdvance && (
            <div className="space-y-3 pt-2 border-t border-[#E8E6F2]">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-[#77758F] block mb-1">
                    Advance Amount (₹) *
                  </label>
                  <div className="relative">
                    <IndianRupee className="w-3.5 h-3.5 text-[#77758F] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={advanceAmount}
                      onChange={(e) => setAdvanceAmount(e.target.value)}
                      disabled={isSubmitting}
                      placeholder="e.g. 2000"
                      className="w-full h-9 rounded-xl bg-white border border-[#E8E6F2] pl-8 pr-2 text-xs font-semibold text-[#24213A] focus:outline-none focus:border-[#5146D8]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-[#77758F] block mb-1">
                    Payment Method *
                  </label>
                  <select
                    value={advanceMethod}
                    onChange={(e) => setAdvanceMethod(e.target.value as PaymentMethod)}
                    disabled={isSubmitting}
                    className="w-full h-9 rounded-xl bg-white border border-[#E8E6F2] px-2.5 text-xs text-[#24213A] focus:outline-none focus:border-[#5146D8]"
                  >
                    <option value="upi">UPI / QR Code</option>
                    <option value="cash">Direct Cash</option>
                    <option value="bank_transfer">Bank Transfer (NEFT/IMPS)</option>
                    <option value="card">Card Terminal</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-[#77758F] block mb-1">
                    Reference / UTR (Optional)
                  </label>
                  <input
                    type="text"
                    value={advanceRef}
                    onChange={(e) => setAdvanceRef(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="e.g. UPI Ref / Bank UTR"
                    className="w-full h-9 rounded-xl bg-white border border-[#E8E6F2] px-2.5 text-xs text-[#24213A] font-mono focus:outline-none focus:border-[#5146D8]"
                  />
                </div>
              </div>

              {parseFloat(advanceAmount) > 0 && (
                <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-white border border-[#E8E6F2]">
                  <span className="text-[#77758F]">Remaining Balance Payable at Arrival:</span>
                  <span className="font-bold text-[#5146D8]">
                    ₹{Math.max(0, estimatedTotal - (parseFloat(advanceAmount) || 0)).toLocaleString("en-IN")}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </form>
    </GlassModal>
  );
}
