"use client";

import { useHMSContext } from "@/components/providers/HMSProvider";
import { DisplayRoomCard } from "@/components/dashboard/DisplayRoomCard";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Check } from "lucide-react";

export default function RoomsPage() {
  const { rooms } = useHMSContext();

  const facilities = [
    "Parking available",
    "Hot water available for shower",
    "Driver accommodation & fooding — Complimentary",
    "Breakfast included as specified for each room",
    "Bonfire & Barbecue — ₹500",
    "Self-cooking facility available",
    "Own gas cylinder — No additional cooking charge"
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto hide-scrollbar space-y-8 pb-10">
      <div>
        <h2 className="text-2xl font-medium text-[#F5F1E8]">Property Rooms</h2>
        <p className="text-[#96928A] mt-1 text-sm tracking-wide">Manage and view all rooms and their current statuses.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {rooms.map((room) => (
          <DisplayRoomCard key={room.id} room={room} />
        ))}
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-semibold tracking-[0.2em] text-[#C7C3BA] uppercase mb-4">Property Facilities</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {facilities.map((facility, idx) => (
            <GlassPanel key={idx} className="p-4 rounded-xl flex items-start gap-3 glass-panel-secondary">
              <div className="mt-0.5 w-4 h-4 rounded-full bg-[rgba(245,158,11,0.2)] flex items-center justify-center shrink-0">
                <Check className="w-2.5 h-2.5 text-[#F59E0B]" />
              </div>
              <p className="text-sm text-[#F5F1E8] font-medium leading-snug">{facility}</p>
            </GlassPanel>
          ))}
        </div>
      </div>
    </div>
  );
}
