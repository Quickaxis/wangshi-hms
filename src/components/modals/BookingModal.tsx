import { useState, useEffect } from "react";
import { GlassModal } from "../ui/GlassModal";
import { Room, BookingGuest } from "@/lib/types";
import { CreateBookingInput } from "@/app/actions/bookings";
import { User, Phone, Calendar as CalendarIcon, Users, IndianRupee, NotebookPen, Plus, X, AlertCircle } from "lucide-react";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";

interface BookingModalProps {
  room: Room;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (input: CreateBookingInput) => Promise<{ success: boolean; error?: string }>;
  defaultDate?: string;
}

export function BookingModal({ room, isOpen, onClose, onConfirm, defaultDate }: BookingModalProps) {
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

  // Calculate nights and estimated total
  const nights = Math.max(
    1,
    Math.round(
      (new Date(formData.checkOut).getTime() - new Date(formData.checkIn).getTime()) /
        (1000 * 60 * 60 * 24)
    ) || 1
  );
  const estimatedTotal = nights * room.pricePerNight;

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setGuests([]);
      setGuestInput("");
      setErrorMessage(null);
      setIsSubmitting(false);
      const inDate = defaultDate || format(new Date(), "yyyy-MM-dd");
      setFormData({
        phone: "",
        checkIn: inDate,
        checkOut: format(addDays(new Date(inDate), 1), "yyyy-MM-dd"),
        notes: "",
      });
    }
  }, [isOpen, defaultDate]);

  const handleAddGuest = () => {
    const trimmed = guestInput.trim();
    if (!trimmed) return;

    if (guests.length >= room.maxCapacity) return;

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
    if (guests.length === 0) {
      setErrorMessage("Please add at least one guest before confirming.");
      return;
    }

    if (!formData.phone.trim()) {
      setErrorMessage("Please enter a contact phone number for the primary guest.");
      return;
    }

    if (new Date(formData.checkOut) <= new Date(formData.checkIn)) {
      setErrorMessage("Check-out date must be after check-in date.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const bookingPayload: CreateBookingInput = {
      roomId: room.id,
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
    } else {
      setIsSubmitting(false);
      onClose();
    }
  };

  const isAtCapacity = guests.length >= room.maxCapacity;

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Book ${room.name}`}
      className="sm:max-w-xl max-h-[94dvh] sm:max-h-[90vh]"
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
            disabled={guests.length === 0 || isSubmitting}
            className={cn(
              "px-6 py-2.5 rounded-full text-xs font-semibold flex items-center justify-center gap-2 transition-all w-full sm:w-auto shadow-sm",
              guests.length === 0 || isSubmitting
                ? "bg-[#E8E6F2] text-[#77758F] cursor-not-allowed border border-[#E8E6F2] shadow-none"
                : "bg-[#5146D8] hover:bg-[#4338CA] text-white shadow-md shadow-[#5146D8]/20 cursor-pointer active:scale-95"
            )}
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Confirming...</span>
              </>
            ) : (
              <span>Confirm Booking</span>
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

        {/* Room & Price Info Summary */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#F6F5FC] border border-[#E8E6F2]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-[#24213A]">{room.name}</span>
            <span className="text-xs font-medium text-[#77758F]">({room.bathroomInfo})</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-bold text-sm text-[#24213A] font-mono tabular-nums">
              ₹{room.pricePerNight.toLocaleString("en-IN")}
            </span>
            <span className="text-xs font-normal text-[#77758F]">/ night</span>
          </div>
        </div>

        {/* Guests Section */}
        <div className="bg-[#F6F5FC] border border-[#E8E6F2] rounded-2xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold tracking-wider text-[#77758F] uppercase flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-[#5146D8]" />
              <span>Guests ({guests.length}/{room.maxCapacity})</span>
            </label>
            {isAtCapacity ? (
              <span className="text-[10px] text-[#DC2626] font-semibold uppercase tracking-wider bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                Max Capacity Reached
              </span>
            ) : (
              <span className="text-[11px] text-[#77758F] font-medium">
                Max {room.maxCapacity} {room.maxCapacity === 1 ? "guest" : "guests"}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
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
                placeholder={isAtCapacity ? "Room capacity reached" : "Enter guest full name..."}
                className="w-full h-10 bg-[#FFFFFF] border border-[#E8E6F2] hover:border-[#5146D8]/40 rounded-xl px-4 text-sm text-[#24213A] placeholder:text-[#77758F]/60 outline-none transition-all focus:border-[#5146D8] focus:ring-2 focus:ring-[#5146D8]/10 shadow-sm disabled:bg-[#F6F5FC] disabled:text-[#77758F] disabled:cursor-not-allowed"
              />
            </div>
            <button
              type="button"
              onClick={handleAddGuest}
              disabled={!guestInput.trim() || isAtCapacity || isSubmitting}
              className="h-10 px-5 rounded-xl bg-[#5146D8] hover:bg-[#4338CA] text-white text-sm font-semibold transition-all flex items-center gap-1.5 shadow-sm shadow-[#5146D8]/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-[#E8E6F2] disabled:text-[#77758F] disabled:shadow-none cursor-pointer shrink-0 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>

          {/* Guest chips or empty state */}
          <div className="flex flex-wrap gap-2 pt-1">
            {guests.length === 0 ? (
              <div className="w-full py-2.5 px-3.5 rounded-xl border border-dashed border-[#E8E6F2] bg-[#FFFFFF] text-center">
                <span className="text-xs font-medium text-[#77758F]">No guests added yet. Add at least 1 guest.</span>
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

        {/* Contact Phone & Calculated Total */}
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

          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#77758F] ml-1">
              Calculated Total ({nights} {nights === 1 ? "night" : "nights"})
            </label>
            <div className="flex items-center justify-between h-10 px-4 rounded-xl bg-[#FFFFFF] border border-[#E8E6F2] shadow-sm">
              <div className="flex items-center gap-1.5">
                <IndianRupee className="w-4 h-4 text-[#5146D8]" />
                <span className="font-bold text-sm text-[#24213A] font-mono tabular-nums">
                  ₹{estimatedTotal.toLocaleString("en-IN")}
                </span>
              </div>
              <span className="text-xs font-mono tabular-nums text-[#77758F]">
                ₹{room.pricePerNight.toLocaleString("en-IN")} × {nights} {nights === 1 ? "nt" : "nts"}
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

        {/* Special Notes */}
        <div className="flex flex-col gap-1.5 w-full">
          <label className="text-xs font-semibold uppercase tracking-wider text-[#77758F] ml-1 flex items-center gap-1.5">
            <NotebookPen className="w-3.5 h-3.5 text-[#5146D8]" />
            <span>Special Notes</span>
          </label>
          <textarea
            rows={3}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            disabled={isSubmitting}
            placeholder="Any special requests, arrival time, or dietary notes..."
            className="w-full bg-[#FFFFFF] border border-[#E8E6F2] hover:border-[#5146D8]/40 rounded-xl p-3 text-sm text-[#24213A] placeholder:text-[#77758F]/60 focus:outline-none focus:border-[#5146D8] focus:ring-2 focus:ring-[#5146D8]/10 shadow-sm resize-none transition-all disabled:opacity-50 disabled:bg-[#F6F5FC]"
          />
        </div>
      </form>
    </GlassModal>
  );
}
