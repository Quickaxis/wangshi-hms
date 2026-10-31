"use client";

import { BookingRequestsView } from "@/components/dashboard/BookingRequestsView";
import { useHMSContext } from "@/components/providers/HMSProvider";

export default function WebsiteRequestsPage() {
  const { selectedHomestayId } = useHMSContext();

  return (
    <div className="flex flex-col h-full overflow-y-auto hide-scrollbar space-y-6 pb-10">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-[#24213A]">Website Requests</h2>
        <p className="text-[#77758F] mt-1 text-xs md:text-sm tracking-wide">
          Review incoming booking submissions from the website. Approving a request confirms the reservation and locks room inventory.
        </p>
      </div>

      <BookingRequestsView homestayId={selectedHomestayId || undefined} />
    </div>
  );
}
