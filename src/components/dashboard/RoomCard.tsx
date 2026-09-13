import { Room } from "@/lib/types";
import { UI_Room } from "@/data/rooms";
import { GlassPanel } from "../ui/GlassPanel";
import { Users, GripVertical, Calendar, IndianRupee, User } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useState } from "react";

export function RoomCard({ room }: { room: UI_Room | Room }) {
  const [imgError, setImgError] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: room.id,
    data: { room },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    touchAction: "none",
  };

  const uiRoom = room as UI_Room;
  const isAvailable = room.status === "available";

  if (isDragging) {
    return (
      <div ref={setNodeRef} style={style} className="relative z-0 opacity-0 touch-none pointer-events-none">
        <GlassPanel className="p-1.5 h-[350px]" />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative z-10 touch-none group opacity-100 cursor-grab hover:-translate-y-1 transition-transform duration-300"
      {...attributes}
      {...listeners}
    >
      <div
        className={cn(
          "absolute -inset-[1px] rounded-[24px] z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none",
          isAvailable
            ? "bg-gradient-to-b from-[#4FE77B]/20 to-transparent"
            : "bg-gradient-to-b from-[#FF6978]/20 to-transparent"
        )}
      />

      <GlassPanel className="p-1.5 relative z-10 rounded-[24px] overflow-hidden glass-panel-secondary">
        {/* Room Image */}
        <div className="w-full h-[130px] md:h-[140px] relative rounded-[20px] overflow-hidden mb-2.5 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
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
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]",
                isAvailable ? "bg-[#4FE77B] text-[#4FE77B]" : "bg-[#FF6978] text-[#FF6978]"
              )}
            />
            <span className="text-[10px] font-semibold tracking-widest text-white uppercase">
              {isAvailable ? "Available" : "Booked"}
            </span>
          </div>

          <div className="absolute top-2.5 left-2.5 p-1.5 rounded-full glass-panel-strong border-none text-white/70 hover:text-white transition-colors cursor-grab backdrop-blur-xl bg-black/20">
            <GripVertical className="w-4 h-4" />
          </div>
        </div>

        <div className="px-3 pb-2">
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

          <div className="flex items-center gap-3 text-[11px] font-medium text-[#C7C3BA] mb-1">
            <div className="flex items-center gap-1.5">
              <Users className="w-3 h-3 text-[#96928A]" />
              <span>Max {room.maxCapacity}</span>
            </div>
          </div>

          {!isAvailable && room.currentBooking && (
            <div className="mt-2.5 pt-2.5 border-t border-[rgba(255,255,255,0.06)] space-y-1.5">
              {/* Primary Guest Name */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5 text-[#F5F1E8] font-medium text-[13px] tracking-wide truncate">
                  <User className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                  <span className="truncate">
                    {room.currentBooking.guests?.[0]?.name || "Guest"}
                  </span>
                  {room.currentBooking.guests?.length > 1 && (
                    <span className="text-[#96928A] text-[11px] shrink-0">
                      +{room.currentBooking.guests.length - 1}
                    </span>
                  )}
                </div>
                <div className="text-[#F5F1E8] text-[11px] font-medium bg-[rgba(0,0,0,0.2)] px-2 py-0.5 rounded-full border border-[rgba(255,255,255,0.05)] shrink-0">
                  ₹{room.currentBooking.bookingAmount.toLocaleString("en-IN")}
                </div>
              </div>

              {/* Stay Dates */}
              <div className="flex items-center gap-1.5 text-[10px] text-[#96928A]">
                <Calendar className="w-3 h-3 text-[#96928A] shrink-0" />
                <span>
                  {room.currentBooking.checkIn} → {room.currentBooking.checkOut}
                </span>
              </div>

              <button
                className="w-full mt-2 py-1.5 rounded-[8px] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.05)] text-[10px] uppercase tracking-widest text-[#C7C3BA] hover:text-white transition-colors cursor-pointer pointer-events-auto"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const event = new CustomEvent("openViewDetails", { detail: room });
                  window.dispatchEvent(event);
                }}
              >
                View Details
              </button>
            </div>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}
