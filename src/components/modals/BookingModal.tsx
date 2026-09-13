import { useState, useEffect } from "react";
import { GlassModal } from "../ui/GlassModal";
import { GlassButton } from "../ui/GlassButton";
import { GlassInput } from "../ui/GlassInput";
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
      footer={
        <>
          <GlassButton variant="ghost" onClick={onClose} className="px-6" disabled={isSubmitting}>
            Cancel
          </GlassButton>
          <GlassButton
            variant="primary"
            onClick={handleSubmit}
            className="px-8"
            disabled={guests.length === 0 || isSubmitting}
          >
            {isSubmitting ? "Confirming..." : "Confirm Booking"}
          </GlassButton>
        </>
      }
    >
      <form id="booking-form" onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="p-3 rounded-xl bg-[rgba(255,105,120,0.15)] border border-[rgba(255,105,120,0.3)] flex items-center gap-2.5 text-xs text-[#FF6978]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Room & Price Info Summary */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] text-xs text-[#C7C3BA]">
          <div>
            <span className="font-semibold text-[#F5F1E8]">{room.name}</span>
            <span className="ml-2 text-[11px] text-[#96928A]">({room.bathroomInfo})</span>
          </div>
          <div className="flex items-center gap-1 font-semibold text-[#F5F1E8]">
            <span>₹{room.pricePerNight.toLocaleString("en-IN")}</span>
            <span className="text-[10px] text-[#96928A]">/ night</span>
          </div>
        </div>

        {/* Guests Section */}
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-[16px] p-4">
          <div className="flex justify-between items-center mb-3">
            <label className="text-xs font-semibold tracking-widest text-[#96928A] uppercase flex items-center gap-2">
              <Users className="w-3.5 h-3.5" />
              Guests ({guests.length}/{room.maxCapacity})
            </label>
            {isAtCapacity && (
              <span className="text-[10px] text-[#FF6978] tracking-wider uppercase font-semibold">
                Max Capacity
              </span>
            )}
          </div>

          <div className="flex gap-2 mb-3">
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
                placeholder={isAtCapacity ? "Capacity reached" : "Enter guest name..."}
                className="w-full bg-[rgba(0,0,0,0.2)] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-2 text-sm text-[#F5F1E8] placeholder-[#96928A] outline-none focus:border-[rgba(255,255,255,0.2)] transition-colors disabled:opacity-50"
              />
            </div>
            <button
              type="button"
              onClick={handleAddGuest}
              disabled={!guestInput.trim() || isAtCapacity || isSubmitting}
              className="px-4 py-2 rounded-xl bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.1)] text-white text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {guests.length === 0 ? (
              <span className="text-xs text-[#96928A] italic">No guests added yet.</span>
            ) : (
              guests.map((guest, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors",
                    guest.isPrimary
                      ? "bg-[rgba(245,158,11,0.1)] border-[rgba(245,158,11,0.2)] text-[#F59E0B]"
                      : "bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.08)] text-[#E5E5E5]"
                  )}
                >
                  <User className="w-3 h-3 opacity-70" />
                  <span>{guest.name}</span>
                  {guest.isPrimary && (
                    <span className="opacity-50 text-[10px] uppercase ml-1 tracking-wider">
                      (Primary)
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveGuest(idx)}
                    disabled={isSubmitting}
                    className="ml-1 p-0.5 rounded-full hover:bg-black/20 text-white/50 hover:text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GlassInput
            label="Primary Phone Number"
            placeholder="Enter 10-digit phone number"
            icon={<Phone className="w-4 h-4" />}
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            required
            disabled={isSubmitting}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold tracking-widest text-[#96928A] uppercase">
              Calculated Total ({nights} night{nights > 1 ? "s" : ""})
            </label>
            <div className="flex items-center gap-2 h-[42px] px-4 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] text-[#F5F1E8] font-semibold text-sm">
              <IndianRupee className="w-4 h-4 text-[#F59E0B]" />
              <span>₹{estimatedTotal.toLocaleString("en-IN")}</span>
              <span className="text-[10px] text-[#96928A] font-normal ml-auto">
                ₹{room.pricePerNight} × {nights}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <GlassInput
            label="Check-in"
            type="date"
            icon={<CalendarIcon className="w-4 h-4" />}
            value={formData.checkIn}
            onChange={(e) => setFormData({ ...formData, checkIn: e.target.value })}
            required
            disabled={isSubmitting}
          />
          <GlassInput
            label="Check-out"
            type="date"
            icon={<CalendarIcon className="w-4 h-4" />}
            value={formData.checkOut}
            onChange={(e) => setFormData({ ...formData, checkOut: e.target.value })}
            required
            disabled={isSubmitting}
          />
        </div>

        <GlassInput
          label="Special Notes"
          placeholder="Any special requests or arrival notes..."
          icon={<NotebookPen className="w-4 h-4" />}
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          disabled={isSubmitting}
        />
      </form>
    </GlassModal>
  );
}
