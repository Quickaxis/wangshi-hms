"use client";

import { Room } from "@/lib/types";
import { UI_Room } from "@/data/rooms";
import { Users, Calendar, IndianRupee, User, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { RoomImage } from "./RoomImage";
import { formatISTCompactDate } from "@/lib/dateUtils";

interface RoomCardProps {
  room: UI_Room | Room;
}

export function RoomCard({ room }: RoomCardProps) {
  const uiRoom = room as UI_Room;
  const isInactive = room.is_active === false;
  const isAvailable = room.status === "available" && !isInactive;

  return (
    <div
      className={cn(
        "relative z-10 group opacity-100 transition-all duration-300 w-full",
        isInactive && "opacity-60"
      )}
    >
      <div
        className={cn(
          "absolute -inset-[1px] rounded-[24px] z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none",
          isInactive
            ? "bg-transparent"
            : isAvailable
            ? "bg-gradient-to-b from-[#4FE77B]/20 to-transparent"
            : "bg-gradient-to-b from-[#FF6978]/20 to-transparent"
        )}
      />

      <div className="p-1.5 relative z-10 rounded-[24px] overflow-hidden glass-panel-secondary h-full flex flex-col border border-[#E8E7F2] shadow-sm">
        {/* Room Image */}
        <div className="w-full aspect-video sm:aspect-auto sm:h-[140px] relative rounded-[20px] overflow-hidden mb-2.5 bg-[#F7F7FC] border border-[#E8E7F2]">
          <RoomImage
            imageUrl={uiRoom.imageUrl}
            alt={room.name}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

          {/* Status Badge */}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-full border border-[#E8E7F2] shadow-sm">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]",
                isInactive
                  ? "bg-[#77758F] text-[#77758F]"
                  : isAvailable
                  ? "bg-[#10B981] text-[#10B981]"
                  : "bg-[#EF4444] text-[#EF4444]"
              )}
            />
            <span
              className={cn(
                "text-[10px] font-bold tracking-widest uppercase",
                isInactive ? "text-[#77758F]" : "text-[#24213A]"
              )}
            >
              {isInactive ? "Inactive" : isAvailable ? "Available" : "Booked"}
            </span>
          </div>
        </div>

        {/* Content Section */}
        <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-2 md:mb-3">
              <div className="flex-1 min-w-0 pr-2">
                <h3 className="text-sm sm:text-base md:text-lg font-bold text-[#24213A] tracking-wide leading-tight truncate">
                  {room.name}
                </h3>
                <div className="flex items-center gap-1.5 text-xs text-[#77758F] mt-1 font-medium flex-wrap">
                  <div className="flex items-center gap-1 shrink-0">
                    <Users className="w-3.5 h-3.5 shrink-0 text-[#77758F]" />
                    <span>Max {room.maxCapacity} Guests</span>
                  </div>
                  {room.bathroomInfo && (
                    <>
                      <span className="shrink-0 text-[#77758F]">•</span>
                      <span className="truncate max-w-[140px] sm:max-w-none text-[#77758F]">
                        {room.bathroomInfo}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="flex items-center justify-end gap-1 text-[#5146D8] text-sm sm:text-base font-bold leading-tight">
                  ₹{room.pricePerNight.toLocaleString("en-IN")}
                </div>
                <p className="text-[#77758F] text-[10px] font-medium tracking-wide mt-0.5">/ night</p>
              </div>
            </div>

            {/* Booked Info Display */}
            {!isAvailable && room.currentBooking && (
              <div className="mt-2.5 pt-2.5 border-t border-[#E8E7F2] space-y-2">
                {/* Primary Guest Name & Count */}
                <div className="flex justify-between items-start">
                  <div className="flex flex-col min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5 text-[#24213A] font-bold text-sm tracking-wide truncate">
                      <User className="w-3.5 h-3.5 text-[#5146D8] shrink-0" />
                      <span className="truncate">
                        {room.currentBooking.guests?.[0]?.name || "Guest"}
                      </span>
                    </div>
                    <div className="text-[#77758F] text-xs font-medium ml-5 mt-0.5">
                      {room.currentBooking.guests?.length || 1} Guest{room.currentBooking.guests?.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="text-[#5146D8] text-xs font-semibold bg-[#F0EEFF] px-2.5 py-1 rounded-full border border-[#E0DEF8] shrink-0">
                    {room.currentBooking.status.replace("_", " ").toUpperCase()}
                  </div>
                </div>

                {/* Stay Dates */}
                <div className="flex flex-col mt-2 pt-2 border-t border-[#E8E7F2]">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#77758F]">
                    <Calendar className="w-3.5 h-3.5 text-[#5146D8]" />
                    <span>
                      {formatISTCompactDate(room.currentBooking.checkIn)}
                      <span className="mx-1.5 text-[#77758F] font-normal">→</span>
                      {formatISTCompactDate(room.currentBooking.checkOut)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-3 pt-3 border-t border-[#E8E7F2]">
            {isInactive ? (
              <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#F7F7FC] border border-[#E8E7F2] text-xs font-semibold text-[#77758F] cursor-not-allowed">
                <Ban className="w-3.5 h-3.5" />
                <span>Room Inactive / Non-bookable</span>
              </div>
            ) : isAvailable ? (
              <button
                type="button"
                className="w-full py-2.5 md:py-2 rounded-xl bg-[#5146D8] hover:bg-[#4338CA] text-xs font-bold uppercase tracking-wider text-white transition-colors cursor-pointer shadow-sm shadow-[#5146D8]/20"
                onClick={() => {
                  const event = new CustomEvent("openBookingModal", { detail: room });
                  window.dispatchEvent(event);
                }}
              >
                Book Room
              </button>
            ) : (
              <button
                type="button"
                className="w-full py-2.5 md:py-2 rounded-xl bg-[#F0EEFF] hover:bg-[#E0DEF8] border border-[#E0DEF8] text-xs font-bold uppercase tracking-wider text-[#5146D8] transition-colors cursor-pointer"
                onClick={() => {
                  const event = new CustomEvent("openViewDetails", { detail: room });
                  window.dispatchEvent(event);
                }}
              >
                View Booking
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
