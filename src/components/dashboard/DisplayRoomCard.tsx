"use client";

import { Room } from "@/lib/types";
import { UI_Room } from "@/data/rooms";
import { GlassPanel } from "../ui/GlassPanel";
import { Users, GripVertical, Calendar, IndianRupee, NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useState } from "react";

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
      
      <GlassPanel className="p-1.5 relative z-10 rounded-[24px] overflow-hidden glass-panel-secondary h-full flex flex-col">
        {/* Room Image */}
        <div className="w-full h-[160px] relative rounded-[20px] overflow-hidden mb-2.5 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] shrink-0">
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
              <span className="text-[#96928A] text-xs">No Image</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
          
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 glass-panel-strong px-2.5 py-1 rounded-full border-none">
            <span className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]", isAvailable ? "bg-[#4FE77B] text-[#4FE77B]" : "bg-[#FF6978] text-[#FF6978]")} />
            <span className="text-[10px] font-semibold tracking-widest text-white uppercase">
              {isAvailable ? "Available" : "Booked"}
            </span>
          </div>
        </div>

        <div className="px-3 pb-2 flex-1 flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="text-[#F5F1E8] font-medium text-base tracking-wide">{room.name}</h3>
              <p className="text-[#96928A] text-[11px] mt-0.5 tracking-wide">{room.bathroomInfo}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-[#F2EEE3] text-sm font-medium">
                ₹{room.pricePerNight.toLocaleString("en-IN")}
              </div>
              <p className="text-[#96928A] text-[10px] tracking-wide mt-0.5">/ night</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-medium text-[#C7C3BA] mb-2">
            <div className="flex items-center gap-1.5">
              <Users className="w-3 h-3 text-[#96928A]" />
              <span>Max {room.maxCapacity}</span>
            </div>
          </div>
          
          <div className="flex items-start gap-1.5 text-[11px] font-medium text-[#C7C3BA] mt-auto border-t border-[rgba(255,255,255,0.06)] pt-3">
            <NotebookPen className="w-3 h-3 text-[#96928A] mt-0.5 shrink-0" />
            <span className="leading-tight text-[#96928A]">{room.breakfastInfo}</span>
          </div>

          {!isAvailable && room.currentBooking && (
            <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
              <div className="flex justify-between items-center mb-2">
                <div className="text-[#F5F1E8] font-medium text-[13px] tracking-wide truncate pr-2">
                  {(() => {
                    const g = room.currentBooking.guests;
                    if (!g || g.length === 0) return "No guests";
                    if (g.length === 1) return g[0].name;
                    if (g.length === 2) return `${g[0].name}, ${g[1].name}`;
                    return `${g[0].name} + ${g.length - 1} others`;
                  })()} <span className="text-[#96928A]">({room.currentBooking.guests.length})</span>
                </div>
                <div className="text-[#F5F1E8] text-[12px] font-medium bg-[rgba(0,0,0,0.2)] px-2 py-0.5 rounded-full border border-[rgba(255,255,255,0.05)] shrink-0">
                  ₹{room.currentBooking.bookingAmount.toLocaleString("en-IN")}
                </div>
              </div>
            </div>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}
