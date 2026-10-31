"use client";

import { Room } from "@/lib/types";
import { UI_Room } from "@/data/rooms";
import { GlassPanel } from "../ui/GlassPanel";
import { Users, Calendar, IndianRupee, NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";
import { RoomImage } from "./RoomImage";
import { formatISTDateTime, formatISTCompactDate, combineDateAndTime } from "@/lib/dateUtils";

export function DisplayRoomCard({ room }: { room: UI_Room | Room }) {
  const uiRoom = room as UI_Room;
  const isInactive = room.is_active === false;
  const isAvailable = room.status === "available" && !isInactive;

  return (
    <div className={cn("relative z-10 opacity-100 group", isInactive && "opacity-60")}>
      <div className={cn(
        "absolute -inset-[1px] rounded-[24px] z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none",
        isInactive
          ? "bg-transparent"
          : isAvailable
          ? "bg-gradient-to-b from-[#4FE77B]/20 to-transparent"
          : "bg-gradient-to-b from-[#FF6978]/20 to-transparent"
      )} />
      
      {/* 
        Responsive Card Wrapper 
        MOBILE (default): white glassmorphism, no borders
        DESKTOP (md:): dark frosted glass panel
      */}
      <div className="p-1.5 relative z-10 rounded-[24px] overflow-hidden glass-panel-secondary h-full flex flex-col border border-[#E8E7F2] shadow-sm">
        {/* Room Image - Full width on mobile */}
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
                isInactive ? "bg-[#77758F] text-[#77758F]" : isAvailable ? "bg-[#10B981] text-[#10B981]" : "bg-[#EF4444] text-[#EF4444]"
              )}
            />
            <span className={cn(
              "text-[10px] font-bold tracking-widest uppercase",
              isInactive ? "text-[#77758F]" : "text-[#24213A]"
            )}>
              {isInactive ? "Inactive" : isAvailable ? "Available" : "Booked"}
            </span>
          </div>
        </div>

        {/* Content Section */}
        <div className="p-3.5 md:p-4 flex-1 flex flex-col">
          <div className="flex justify-between items-start mb-1.5 md:mb-2">
            <div className="flex-1 min-w-0 pr-2">
              <h3 className="text-base sm:text-lg font-bold text-[#24213A] tracking-wide leading-tight truncate">{room.name}</h3>
              {room.bathroomInfo && (
                <p className="text-[#77758F] text-xs mt-0.5 tracking-wide truncate min-w-0">{room.bathroomInfo}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center justify-end gap-1 text-[#5146D8] text-sm sm:text-base font-bold">
                ₹{room.pricePerNight.toLocaleString("en-IN")}
              </div>
              <p className="text-[#77758F] text-[10px] font-medium tracking-wide mt-0.5">/ night</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-medium text-[#77758F] my-2">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#77758F]" />
              <span>Max {room.maxCapacity} Guests</span>
            </div>
          </div>
          
          {room.breakfastInfo && (
            <div className="flex items-start gap-1.5 text-xs font-medium mt-auto border-t border-[#E8E7F2] pt-2 md:pt-3">
              <NotebookPen className="w-3.5 h-3.5 text-[#5146D8] mt-0.5 shrink-0" />
              <span className="leading-tight text-[#77758F] truncate">{room.breakfastInfo}</span>
            </div>
          )}

          {!isAvailable && room.currentBooking && (
            <div className="mt-4 md:mt-3 pt-4 md:pt-3 border-t border-[#E8E7F2]">
              {/* Primary Guest Name & Count */}
              <div className="flex justify-between items-start">
                <div className="flex flex-col min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-1.5 text-[#24213A] font-bold text-sm md:text-[13px] tracking-wide truncate">
                    <span className="truncate">
                      {room.currentBooking.guests?.[0]?.name || "Guest"}
                    </span>
                  </div>
                  <div className="text-[#77758F] text-xs md:text-[11px] font-medium mt-0.5">
                    {room.currentBooking.guests?.length || 1} Guest{room.currentBooking.guests?.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="text-[#5146D8] text-xs md:text-[11px] font-bold md:font-medium bg-[#F0EEFF] px-2.5 py-1 md:px-2 md:py-0.5 rounded-full border border-[#E0DEF8] shrink-0">
                  {room.currentBooking.status.replace("_", " ").toUpperCase()}
                </div>
              </div>

              {/* Stay Dates */}
              <div className="flex flex-col mt-2 pt-2 border-t border-[#E8E7F2]">
                <div className="flex items-center gap-2 text-xs md:text-[11px] font-bold text-[#77758F]">
                  <Calendar className="w-3.5 h-3.5 text-[#5146D8]" />
                  <span>
                    {formatISTCompactDate(room.currentBooking.checkIn)} 
                    <span className="mx-1 text-[#77758F] font-normal">→</span> 
                    {formatISTCompactDate(room.currentBooking.checkOut)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


