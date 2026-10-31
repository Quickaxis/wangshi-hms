"use client";

import { Room, RoomStatus } from "@/lib/types";
import { GlassPanel } from "../ui/GlassPanel";
import { RoomCard } from "./RoomCard";
import { cn } from "@/lib/utils";
import { BedDouble } from "lucide-react";

interface RoomColumnProps {
  status: RoomStatus;
  rooms: Room[];
}

export function RoomColumn({ status, rooms }: RoomColumnProps) {
  const isAvailable = status === "available";
  const title = isAvailable ? "Available Rooms" : "Booked Rooms";
  const count = rooms.length;

  return (
    <GlassPanel 
      className={cn(
        "flex flex-col h-auto md:h-full md:min-h-[500px] min-w-0 p-3 sm:p-4 md:p-5 transition-all duration-300 relative bg-[#FFFFFF] border border-[#E8E7F2] shadow-sm rounded-[24px]"
      )}
    >
      <div className="flex items-center justify-between mb-3 md:mb-5 pb-3 md:pb-4 border-b border-[#E8E7F2] shrink-0 gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className={cn("w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] shrink-0", isAvailable ? "bg-[#10B981] text-[#10B981]" : "bg-[#EF4444] text-[#EF4444]")} />
          <h2 className="text-xs sm:text-sm md:text-sm font-bold text-[#24213A] uppercase tracking-wider">{title}</h2>
        </div>
        <div className="text-[10px] sm:text-xs font-semibold tracking-wide text-[#5146D8] bg-[#F0EEFF] px-2.5 py-1 rounded-full border border-[#E0DEF8] shrink-0 whitespace-nowrap">
          {count} {count === 1 ? "Room" : "Rooms"}
        </div>
      </div>

      <div className="flex flex-col gap-3 md:gap-4 md:flex-1 md:overflow-y-auto hide-scrollbar pb-2 z-10">
        {rooms.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-[#77758F] bg-[#F7F7FC] rounded-2xl border border-[#E8E7F2]">
            <BedDouble className="w-8 h-8 text-[#8B83F6] mb-2" />
            <p className="text-sm font-semibold text-[#24213A]">
              {isAvailable ? "No available rooms" : "No booked rooms"}
            </p>
            <p className="text-xs text-[#77758F] mt-1 max-w-xs">
              {isAvailable 
                ? "All active rooms are occupied for this selected date."
                : "Select an available room and click 'Book Room' to create a reservation."}
            </p>
          </div>
        )}
        {rooms.map((room) => (
          <RoomCard key={room.id} room={room} />
        ))}
      </div>
    </GlassPanel>
  );
}
