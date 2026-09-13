"use client";

import { useState } from "react";
import { GlassModal } from "../ui/GlassModal";
import { GlassButton } from "../ui/GlassButton";
import { Room } from "@/lib/types";
import {
  User,
  Phone,
  Calendar as CalendarIcon,
  Users,
  IndianRupee,
  NotebookPen,
  Briefcase,
  CheckCircle,
  LogOut,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { useHMSContext } from "../providers/HMSProvider";
import { cn } from "@/lib/utils";

interface ViewDetailsModalProps {
  room: Room | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ViewDetailsModal({ room, isOpen, onClose }: ViewDetailsModalProps) {
  const { rooms, updateBookingStatus, cancelBooking } = useHMSContext();
  const [isUpdating, setIsUpdating] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  if (!room) return null;

  // Find fresh room from context
  const activeRoom = rooms.find((r) => r.id === room.id) || room;
  const booking = activeRoom.currentBooking;
  const isAvailable = activeRoom.status === "available";

  const handleStatusUpdate = async (status: "confirmed" | "checked_in" | "checked_out") => {
    if (!booking) return;
    setIsUpdating(true);
    setFeedbackMsg(null);
    const result = await updateBookingStatus(booking.id, status);
    setIsUpdating(false);
    if (result.success) {
      setFeedbackMsg({ type: "success", text: `Status updated to ${status.replace("_", " ")}.` });
      if (status === "checked_out") {
        setTimeout(() => onClose(), 800);
      }
    } else {
      setFeedbackMsg({ type: "error", text: result.error || "Failed to update status." });
    }
  };

  const handleCancelBooking = async () => {
    if (!booking) return;
    const confirmed = window.confirm("Are you sure you want to cancel this booking?");
    if (!confirmed) return;

    setIsUpdating(true);
    setFeedbackMsg(null);
    const result = await cancelBooking(booking.id);
    setIsUpdating(false);
    if (result.success) {
      setFeedbackMsg({ type: "success", text: "Booking successfully cancelled." });
      setTimeout(() => onClose(), 800);
    } else {
      setFeedbackMsg({ type: "error", text: result.error || "Failed to cancel booking." });
    }
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={isAvailable ? `Room Details: ${activeRoom.name}` : `Booking Details: ${activeRoom.name}`}
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            {!isAvailable && booking && (
              <>
                {booking.status === "confirmed" && (
                  <GlassButton
                    variant="primary"
                    onClick={() => handleStatusUpdate("checked_in")}
                    disabled={isUpdating}
                    className="px-4 text-xs flex items-center gap-1.5 bg-[rgba(79,231,123,0.15)] hover:bg-[rgba(79,231,123,0.25)] border-[rgba(79,231,123,0.3)] text-[#4FE77B]"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Check In
                  </GlassButton>
                )}
                {booking.status === "checked_in" && (
                  <GlassButton
                    variant="primary"
                    onClick={() => handleStatusUpdate("checked_out")}
                    disabled={isUpdating}
                    className="px-4 text-xs flex items-center gap-1.5 bg-[rgba(245,158,11,0.15)] hover:bg-[rgba(245,158,11,0.25)] border-[rgba(245,158,11,0.3)] text-[#F59E0B]"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Check Out
                  </GlassButton>
                )}
                <GlassButton
                  variant="ghost"
                  onClick={handleCancelBooking}
                  disabled={isUpdating}
                  className="px-3 text-xs flex items-center gap-1 text-[#FF6978] hover:bg-[rgba(255,105,120,0.1)]"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel Stay
                </GlassButton>
              </>
            )}
          </div>
          <GlassButton variant="ghost" onClick={onClose} className="px-6 text-xs">
            Close
          </GlassButton>
        </div>
      }
    >
      <div className="space-y-6">
        {feedbackMsg && (
          <div
            className={cn(
              "p-3 rounded-xl flex items-center gap-2.5 text-xs border",
              feedbackMsg.type === "success"
                ? "bg-[rgba(79,231,123,0.1)] border-[rgba(79,231,123,0.25)] text-[#4FE77B]"
                : "bg-[rgba(255,105,120,0.1)] border-[rgba(255,105,120,0.25)] text-[#FF6978]"
            )}
          >
            {feedbackMsg.type === "success" ? (
              <CheckCircle className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {isAvailable ? (
          <div className="space-y-4">
            <h3 className="text-xs font-semibold tracking-widest text-[#96928A] uppercase">
              Room Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="glass-panel-secondary p-3 rounded-xl flex items-center gap-3">
                <Users className="w-4 h-4 text-[#96928A]" />
                <div>
                  <p className="text-[10px] text-[#96928A] tracking-wider uppercase">Capacity</p>
                  <p className="text-sm font-medium text-[#F5F1E8]">Max {activeRoom.maxCapacity} Guests</p>
                </div>
              </div>

              <div className="glass-panel-secondary p-3 rounded-xl flex items-center gap-3">
                <IndianRupee className="w-4 h-4 text-[#96928A]" />
                <div>
                  <p className="text-[10px] text-[#96928A] tracking-wider uppercase">Price</p>
                  <p className="text-sm font-medium text-[#F5F1E8]">
                    ₹{activeRoom.pricePerNight.toLocaleString("en-IN")}/night
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="glass-panel-secondary p-3 rounded-xl flex items-center gap-3">
                <NotebookPen className="w-4 h-4 text-[#96928A]" />
                <div>
                  <p className="text-[10px] text-[#96928A] tracking-wider uppercase">Bathroom</p>
                  <p className="text-sm font-medium text-[#F5F1E8]">{activeRoom.bathroomInfo}</p>
                </div>
              </div>

              <div className="glass-panel-secondary p-3 rounded-xl flex items-center gap-3">
                <NotebookPen className="w-4 h-4 text-[#96928A]" />
                <div>
                  <p className="text-[10px] text-[#96928A] tracking-wider uppercase">Breakfast</p>
                  <p className="text-sm font-medium text-[#F5F1E8]">{activeRoom.breakfastInfo}</p>
                </div>
              </div>
            </div>
          </div>
        ) : booking ? (
          <>
            {/* Status Badge */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-widest text-[#96928A] uppercase">
                Booking Status
              </span>
              <span
                className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-semibold tracking-widest uppercase border",
                  booking.status === "checked_in"
                    ? "bg-[rgba(79,231,123,0.15)] border-[rgba(79,231,123,0.3)] text-[#4FE77B]"
                    : booking.status === "confirmed"
                    ? "bg-[rgba(245,158,11,0.15)] border-[rgba(245,158,11,0.3)] text-[#F59E0B]"
                    : "bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)] text-[#96928A]"
                )}
              >
                {booking.status.replace("_", " ")}
              </span>
            </div>

            {/* Guest List Section */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-semibold tracking-widest text-[#96928A] uppercase">
                  Guests ({booking.guests.length}/{activeRoom.maxCapacity})
                </h3>
              </div>

              <div className="glass-panel-secondary p-4 rounded-xl space-y-2">
                {booking.guests.length === 0 ? (
                  <p className="text-xs text-[#96928A] italic">No guests currently attached.</p>
                ) : (
                  booking.guests.map((guest, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center p-2 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)]"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                            guest.isPrimary
                              ? "bg-[#F59E0B]/20 text-[#F59E0B]"
                              : "bg-[rgba(255,255,255,0.1)] text-[#96928A]"
                          )}
                        >
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#F5F1E8]">{guest.name}</p>
                          {guest.isPrimary && (
                            <p className="text-[10px] text-[#F59E0B] tracking-wider uppercase">
                              Primary Guest
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Phone & Booking Info */}
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="glass-panel-secondary p-3 rounded-xl flex flex-col gap-1">
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarIcon className="w-3.5 h-3.5 text-[#F18F9B]" />
                    <span className="text-[10px] text-[#96928A] tracking-wider uppercase">Stay Dates</span>
                  </div>
                  <p className="text-[13px] font-medium text-[#F5F1E8]">In: {booking.checkIn}</p>
                  <p className="text-[13px] font-medium text-[#F5F1E8]">Out: {booking.checkOut}</p>
                </div>

                <div className="grid grid-rows-2 gap-4">
                  <div className="glass-panel-secondary p-3 rounded-xl flex items-center gap-3">
                    <Phone className="w-4 h-4 text-[#96928A]" />
                    <div>
                      <p className="text-[10px] text-[#96928A] tracking-wider uppercase">Phone</p>
                      <p className="text-sm font-medium text-[#F5F1E8]">{booking.guestPhone || "N/A"}</p>
                    </div>
                  </div>
                  <div className="glass-panel-secondary p-3 rounded-xl flex items-center gap-3">
                    <IndianRupee className="w-4 h-4 text-[#96928A]" />
                    <div>
                      <p className="text-[10px] text-[#96928A] tracking-wider uppercase">Amount</p>
                      <p className="text-sm font-medium text-[#F5F1E8]">
                        ₹{booking.bookingAmount.toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Partner & Notes */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="glass-panel-secondary p-3 rounded-xl flex items-start gap-3 col-span-1 md:col-span-2">
                  <NotebookPen className="w-4 h-4 text-[#96928A] mt-0.5" />
                  <div>
                    <p className="text-[10px] text-[#96928A] tracking-wider uppercase">Special Notes</p>
                    <p className="text-[13px] text-[#C7C3BA] mt-1">{booking.notes || "None"}</p>
                  </div>
                </div>

                <div className="glass-panel-secondary p-3 rounded-xl flex items-center gap-3 col-span-1 md:col-span-2">
                  <Briefcase className="w-4 h-4 text-[#96928A]" />
                  <div>
                    <p className="text-[10px] text-[#96928A] tracking-wider uppercase">Booked By Partner</p>
                    <p className="text-[13px] font-medium text-[#F5F1E8]">{booking.bookedBy}</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </GlassModal>
  );
}
