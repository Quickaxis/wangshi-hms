import { Room, RoomStatus } from "@/lib/types";
import { GlassPanel } from "../ui/GlassPanel";
import { RoomCard } from "./RoomCard";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { BedDouble } from "lucide-react";

interface RoomColumnProps {
  status: RoomStatus;
  rooms: Room[];
  mobileVisible?: boolean;
}

export function RoomColumn({ status, rooms, mobileVisible = true }: RoomColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  const isAvailable = status === "available";
  const title = isAvailable ? "AVAILABLE ROOMS" : "BOOKED ROOMS";
  const count = rooms.length;

  return (
    <GlassPanel 
      ref={setNodeRef}
      className={cn(
        "flex flex-col h-auto md:h-full md:min-h-[500px] p-0 md:p-5 transition-all duration-300 relative overflow-hidden bg-transparent border-transparent shadow-none md:bg-[rgba(255,255,255,0.02)] md:border-[rgba(255,255,255,0.05)] md:shadow-lg",
        isOver && (isAvailable ? "shadow-[inset_0_0_50px_rgba(79,231,123,0.1)] border-[#4FE77B]/30" : "shadow-[inset_0_0_50px_rgba(255,105,120,0.1)] border-[#FF6978]/30"),
        !mobileVisible && "hidden md:flex"
      )}
    >
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-100 md:border-[rgba(255,255,255,0.06)] shrink-0">
        <div className="flex items-center gap-3">
          <div className={cn("w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] hidden md:block", isAvailable ? "bg-[#4FE77B] text-[#4FE77B]" : "bg-[#FF6978] text-[#FF6978]")} />
          <h2 className="text-base md:text-sm font-bold text-gray-800 md:text-[#F5F1E8] tracking-widest">{title}</h2>
        </div>
        <div className="text-xs font-bold md:font-semibold tracking-wide text-gray-600 md:text-[#96928A] bg-gray-50 md:bg-[rgba(255,255,255,0.05)] px-3 py-1 rounded-full border border-gray-200 md:border-[rgba(255,255,255,0.05)]">
          {count} {count === 1 ? "Room" : "Rooms"}
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-1 md:overflow-y-auto hide-scrollbar md:pb-6 z-10">
        {rooms.length === 0 && !isAvailable && (
          <div className="md:hidden flex items-center justify-center py-6 text-sm font-medium text-gray-500 bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
            No booked rooms
          </div>
        )}
        {rooms.map((room) => (
          <RoomCard key={room.id} room={room} />
        ))}
      </div>

      <div 
        ref={setNodeRef}
        className={cn(
          "mt-4 p-6 rounded-[20px] border-2 border-dashed transition-all duration-300 items-center justify-center text-center gap-3 shrink-0 hidden md:flex flex-col",
          isOver 
            ? (isAvailable ? "border-[#4FE77B]/50 bg-[#4FE77B]/10" : "border-[#FF6978]/50 bg-[#FF6978]/10")
            : "border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)]"
        )}
      >
        <div className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
          isOver 
            ? (isAvailable ? "bg-[#4FE77B]/20 text-[#4FE77B]" : "bg-[#FF6978]/20 text-[#FF6978]")
            : "bg-[rgba(255,255,255,0.05)] text-[#96928A]"
        )}>
          <BedDouble className="w-5 h-5" />
        </div>
        <div>
          <p className={cn(
            "text-sm font-medium transition-colors",
            isOver ? (isAvailable ? "text-[#4FE77B]" : "text-[#FF6978]") : "text-[#C7C3BA]"
          )}>
            {isAvailable ? "Drop to make available" : "Drop to book a room"}
          </p>
          <p className="text-xs text-[#96928A] mt-1">
            {isAvailable ? "Move from booked to available" : "Move from available to booked"}
          </p>
        </div>
      </div>
    </GlassPanel>
  );
}
