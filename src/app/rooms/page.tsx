"use client";

import { useHMSContext } from "@/components/providers/HMSProvider";
import { DisplayRoomCard } from "@/components/dashboard/DisplayRoomCard";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Check, BedDouble, Plus } from "lucide-react";
import Link from "next/link";

export default function RoomsPage() {
  const { rooms, isLoading, userProfile, selectedHomestayId } = useHMSContext();

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
        <h2 className="text-2xl font-bold md:font-medium text-[#24213A]">Property Rooms</h2>
        <p className="text-[#77758F] mt-1 text-sm tracking-wide">Manage and view all rooms and their current statuses.</p>
      </div>

      {!isLoading && rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-[#FFFFFF] rounded-2xl border border-[#E8E7F2] shadow-sm">
          <div className="w-16 h-16 rounded-full bg-[#F7F7FC] flex items-center justify-center mb-4">
            <BedDouble className="w-8 h-8 text-[#77758F]" />
          </div>
          <h3 className="text-xl font-bold text-[#24213A] mb-2">No rooms added yet</h3>
          <p className="text-[#77758F] text-sm max-w-md mb-6">
            There are currently no rooms configured for this homestay.
          </p>
          {userProfile?.role === 'super_admin' && (
            <Link 
              href={selectedHomestayId ? `/admin/homestays/${selectedHomestayId}/rooms` : "/admin/homestays"}
              className="px-6 py-2.5 bg-[#5146D8] text-white text-sm font-bold rounded-full hover:bg-[#4338CA] transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Room
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {rooms.map((room) => (
            <DisplayRoomCard key={room.id} room={room} />
          ))}
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-sm font-bold md:font-semibold tracking-[0.2em] text-[#77758F] uppercase mb-4">Property Facilities</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {facilities.map((facility, idx) => (
            <div key={idx} className="p-4 rounded-xl flex items-start gap-3 bg-[#FFFFFF] border border-[#E8E7F2] shadow-sm">
              <div className="mt-0.5 w-4 h-4 rounded-full bg-[#F0EEFF] flex items-center justify-center shrink-0">
                <Check className="w-2.5 h-2.5 text-[#5146D8]" />
              </div>
              <p className="text-sm text-[#24213A] font-medium leading-snug">{facility}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
