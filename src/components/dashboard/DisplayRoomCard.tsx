"use client";

import { Room } from "@/lib/types";
import { UI_Room } from "@/data/rooms";
import { GlassPanel } from "../ui/GlassPanel";
import { Users, GripVertical, Calendar, IndianRupee, NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useState } from "react";
import { formatISTDateTime, formatISTCompactDate, combineDateAndTime } from "@/lib/dateUtils";

export function DisplayRoomCard({ room }: { room: UI_Room | Room }) {
  const [imgError, setImgError] = useState(false);
  const uiRoom = room as UI_Room;
  const isAvailable = room.status === "available";

  return (
    <div className="relative z-10 opacity-100 group">
      <div className={cn(
        "absolute -inset-[1px] rounded-[24px] z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none",
        isAvailable ? "bg-gradient-to-b from-[#4FE77B]/20 to-transparent" : "bg-gradient-to-b from-[#FF6978]/20 to-transparent"
      )} />
      
      {/* 
        Responsive Card Wrapper 
        MOBILE (default): white glassmorphism, no borders
        DESKTOP (md:): dark frosted glass panel
      */}
      <div className="p-1.5 relative z-10 rounded-[24px] overflow-hidden glass-panel-secondary h-full flex flex-col">
        {/* Room Image - Full width on mobile */}
        <div className="w-full aspect-video sm:aspect-auto sm:h-[140px] relative rounded-[20px] overflow-hidden mb-2.5 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
          {!imgError && uiRoom.imageUrl ? (
            <Image 
              src={uiRoom.imageUrl} 
              alt={room.name} 
              fill 
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full bg-[rgba(255,255,255,0.05)] flex items-center justify-center">
              <span className="text-[#96928A] text-[10px] md:text-xs">No Image</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
          
          {/* Status Badge */}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 bg-[rgba(255,255,255,0.08)] backdrop-blur-md px-2.5 py-1 rounded-full shadow-[0_20px_80px_rgba(0,0,0,0.5)]">
            <span className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]", isAvailable ? "bg-[#4FE77B] text-[#4FE77B]" : "bg-[#FF6978] text-[#FF6978]")} />
            <span className="text-[10px] font-bold tracking-widest text-white uppercase">
              {isAvailable ? "Available" : "Booked"}
            </span>
          </div>
        </div>

        {/* Content Section */}
        {/* Content Section */}
        <div className="p-3 md:p-3 md:pb-2 flex-1 flex flex-col">
          <div className="flex justify-between items-start mb-1.5 md:mb-2">
            <div className="flex-1 min-w-0 pr-1 sm:pr-2">
              <h3 className="text-[#F5F1E8] font-bold md:font-medium text-[13px] sm:text-[15px] md:text-base tracking-wide leading-tight line-clamp-2 md:truncate">{room.name}</h3>
              <p className="text-[#96928A] text-[9px] md:text-[11px] mt-0.5 md:mt-0.5 tracking-wide truncate min-w-0">{room.bathroomInfo}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center justify-end gap-1 text-[#F2EEE3] text-xs sm:text-sm font-bold md:font-medium">
                ₹{room.pricePerNight.toLocaleString("en-IN")}
              </div>
              <p className="text-[#96928A] text-[9px] md:text-[10px] font-medium tracking-wide mt-0.5">/ night</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-medium text-[#C7C3BA] mb-2">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 md:w-3 md:h-3 text-[#96928A]" />
              <span>Max {room.maxCapacity}</span>
            </div>
          </div>
          
          <div className="flex items-start gap-1.5 text-[11px] font-medium mt-auto border-t border-[rgba(255,255,255,0.06)] pt-2 md:pt-3">
            <NotebookPen className="w-3.5 h-3.5 md:w-3 md:h-3 text-[#96928A] mt-0.5 shrink-0" />
            <span className="leading-tight text-[#96928A]">{room.breakfastInfo}</span>
          </div>

          {!isAvailable && room.currentBooking && (
            <div className="mt-4 md:mt-3 pt-4 md:pt-3 border-t border-[rgba(255,255,255,0.06)]">
              {/* Primary Guest Name & Count */}
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5 text-[#F5F1E8] font-bold text-sm md:text-[13px] tracking-wide truncate">
                    <span className="truncate">
                      {room.currentBooking.guests?.[0]?.name || "Guest"}
                    </span>
                  </div>
                  <div className="text-[#96928A] text-xs md:text-[11px] font-medium mt-0.5">
                    {room.currentBooking.guests?.length || 1} Guest{room.currentBooking.guests?.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="text-[#F5F1E8] text-xs md:text-[11px] font-bold md:font-medium bg-[rgba(0,0,0,0.2)] px-2.5 py-1 md:px-2 md:py-0.5 rounded-full border border-[rgba(255,255,255,0.05)] shrink-0">
                  {room.currentBooking.status.replace("_", " ").toUpperCase()}
                </div>
              </div>

              {/* Stay Dates */}
              <div className="flex flex-col mt-2 pt-2 border-t border-[rgba(255,255,255,0.05)]">
                <div className="flex items-center gap-2 text-xs md:text-[11px] font-bold text-[#C7C3BA]">
                  <Calendar className="w-3.5 h-3.5 text-[#96928A]" />
                  <span>
                    {formatISTCompactDate(room.currentBooking.checkIn)} 
                    <span className="mx-1 text-[#96928A] font-normal">→</span> 
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


