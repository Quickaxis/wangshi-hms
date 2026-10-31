"use client";

import { useState, useEffect, useMemo } from "react";
import { RoomColumn } from "./RoomColumn";
import { Room } from "@/lib/types";
import { DisplayRoomCard } from "./DisplayRoomCard";
import { UI_Room } from "@/data/rooms";
import { GlassPanel } from "../ui/GlassPanel";
import { BookingModal } from "../modals/BookingModal";
import { ViewDetailsModal } from "../modals/ViewDetailsModal";
import { useHMSContext } from "../providers/HMSProvider";
import { useAuth } from "../providers/AuthProvider";
import { cn } from "@/lib/utils";
import { CalendarIcon, ChevronLeft, ChevronRight, Loader2, BedDouble, Plus } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { formatISTFullDate, getISTDateString } from "@/lib/dateUtils";
import Link from "next/link";

export function RoomBoard() {
  const { rooms, selectedDate, setSelectedDate, isLoading, createBooking, selectedHomestayId } = useHMSContext();
  const { partner } = useAuth();

  const [bookingRoom, setBookingRoom] = useState<UI_Room | null>(null);
  const [viewingRoom, setViewingRoom] = useState<Room | null>(null);
  const [mobileTab, setMobileTab] = useState<"available" | "booked">("available");

  // Listen for the custom events from RoomCard to open View Details and Booking
  useEffect(() => {
    const handleOpenViewDetails = (e: CustomEvent<Room>) => {
      setViewingRoom(e.detail);
    };
    const handleOpenBooking = (e: CustomEvent<Room>) => {
      setBookingRoom(e.detail as UI_Room);
    };
    window.addEventListener("openViewDetails", handleOpenViewDetails as EventListener);
    window.addEventListener("openBookingModal", handleOpenBooking as EventListener);
    return () => {
      window.removeEventListener("openViewDetails", handleOpenViewDetails as EventListener);
      window.removeEventListener("openBookingModal", handleOpenBooking as EventListener);
    };
  }, []);

  const activeRooms = useMemo(() => rooms.filter((r) => r.is_active !== false), [rooms]);
  const availableRooms = useMemo(() => rooms.filter((r) => r.is_active !== false && r.status === "available"), [rooms]);
  const bookedRooms = useMemo(() => rooms.filter((r) => r.status === "booked"), [rooms]);
  const inactiveRooms = useMemo(() => rooms.filter((r) => r.is_active === false && r.status !== "booked"), [rooms]);

  const totalGuests = useMemo(
    () => bookedRooms.reduce((sum, r) => sum + (r.currentBooking?.guests?.length || 0), 0),
    [bookedRooms]
  );
  const totalRevenue = useMemo(
    () => rooms.reduce((sum, r) => sum + (r.currentBooking?.bookingAmount || 0), 0),
    [rooms]
  );
  const totalBookings = bookedRooms.length;
  const occupancy = activeRooms.length > 0 ? Math.round((totalBookings / activeRooms.length) * 100) : 0;

  // Time-based greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  }, []);

  const partnerDisplayName = partner?.name || "Partner";

  const formattedSelectedDate = useMemo(() => {
    try {
      return formatISTFullDate(selectedDate);
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  const handlePrevDay = () => {
    try {
      const prev = subDays(new Date(selectedDate), 1);
      setSelectedDate(format(prev, "yyyy-MM-dd"));
    } catch (e) {
      console.error(e);
    }
  };

  const handleNextDay = () => {
    try {
      const next = addDays(new Date(selectedDate), 1);
      setSelectedDate(format(next, "yyyy-MM-dd"));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="w-full flex flex-col min-h-full relative z-0 pb-10 md:pb-6">
      {/* Top Header & Stats */}
      {/* Top Header & Stats */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-4 md:mb-6 gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl md:text-2xl font-bold text-[#24213A] tracking-wide mb-1 flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
              <span>{greeting},</span>
              <span className="text-[#5146D8]">{partnerDisplayName}</span>
            </h2>
            {isLoading && (
              <Loader2 className="w-4 h-4 text-[#5146D8] animate-spin shrink-0" />
            )}
          </div>
          <p className="text-xs md:text-sm text-[#77758F] tracking-wider">
            Manage room reservations and live availability
          </p>
          
          {/* Date Selector Navigation */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center bg-[#FFFFFF] border border-[#E8E7F2] rounded-xl px-2.5 py-1 text-xs text-[#24213A] shadow-sm">
              <button
                onClick={handlePrevDay}
                className="p-1 hover:text-[#5146D8] rounded-lg transition-colors cursor-pointer text-[#77758F]"
                title="Previous Day"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-center gap-1.5 px-2 font-medium text-[#24213A]">
                <CalendarIcon className="w-3.5 h-3.5 text-[#5146D8]" />
                <span>{formattedSelectedDate}</span>
              </div>
              <button
                onClick={handleNextDay}
                className="p-1 hover:text-[#5146D8] rounded-lg transition-colors cursor-pointer text-[#77758F]"
                title="Next Day"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {selectedDate === getISTDateString() && (
              <div
                className="px-2.5 py-1 rounded-xl text-[11px] font-medium bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8] transition-colors cursor-default"
              >
                Today
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 shrink-0">
          <StatCard title="Total Rooms" value={rooms.length} />
          <StatCard title="Available" value={availableRooms.length} highlight="available" />
          <StatCard title="Booked" value={bookedRooms.length} highlight="booked" />
          <StatCard title="Guests Today" value={totalGuests} />
        </div>
      </div>

      {/* Main Room View */}
      {!isLoading && rooms.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-center glass-panel-secondary rounded-[32px] border border-[#E8E7F2] p-8">
          <div className="w-16 h-16 rounded-full bg-[#F0EEFF] flex items-center justify-center mb-4">
            <BedDouble className="w-8 h-8 text-[#5146D8]" />
          </div>
          <h3 className="text-xl font-bold text-[#24213A] mb-2">No rooms added yet</h3>
          <p className="text-[#77758F] text-sm max-w-md mb-6">
            There are currently no rooms configured for this homestay.
          </p>
          {partner?.role === 'super_admin' && (
            <Link 
              href={selectedHomestayId ? `/admin/homestays/${selectedHomestayId}/rooms` : "/admin/homestays"}
              className="px-6 py-2.5 bg-[#5146D8] text-white text-sm font-bold rounded-full hover:bg-[#4338CA] transition-colors flex items-center gap-2 shadow-md shadow-[#5146D8]/20"
            >
              <Plus className="w-4 h-4" />
              Add Room
            </Link>
          )}
        </div>
      ) : (
        <div className="w-full flex flex-col md:flex-1 md:min-h-0">
          {/* Desktop Two-Column Board */}
          <div className="hidden md:grid md:grid-cols-2 gap-8 md:flex-1 md:min-h-0 relative w-full">
            <div className="hidden md:block absolute left-1/2 top-10 bottom-10 w-px bg-gradient-to-b from-transparent via-[#E8E7F2] to-transparent -translate-x-1/2" />
            <RoomColumn status="available" rooms={availableRooms} />
            <RoomColumn status="booked" rooms={bookedRooms} />
          </div>

          {/* Mobile Segmented Switcher & Single Column Full-Width View */}
          <div className="block md:hidden w-full space-y-3">
            <div className="flex items-center p-1 bg-[#FFFFFF] border border-[#E8E7F2] rounded-2xl w-full shadow-sm">
              <button
                type="button"
                onClick={() => setMobileTab("available")}
                className={cn(
                  "flex-1 py-2 px-3 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer",
                  mobileTab === "available"
                    ? "bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0] shadow-sm"
                    : "text-[#77758F] hover:text-[#24213A]"
                )}
              >
                <span className="w-2 h-2 rounded-full bg-[#10B981] shadow-[0_0_8px_#10B981]" />
                <span>Available Rooms</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F0EEFF] text-[#5146D8]">
                  {availableRooms.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMobileTab("booked")}
                className={cn(
                  "flex-1 py-2 px-3 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer",
                  mobileTab === "booked"
                    ? "bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA] shadow-sm"
                    : "text-[#77758F] hover:text-[#24213A]"
                )}
              >
                <span className="w-2 h-2 rounded-full bg-[#EF4444] shadow-[0_0_8px_#EF4444]" />
                <span>Booked Rooms</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F0EEFF] text-[#5146D8]">
                  {bookedRooms.length}
                </span>
              </button>
            </div>

            {mobileTab === "available" ? (
              <RoomColumn status="available" rooms={availableRooms} />
            ) : (
              <RoomColumn status="booked" rooms={bookedRooms} />
            )}
          </div>
        </div>
      )}

      {/* Inactive / Maintenance Rooms Section */}
      {inactiveRooms.length > 0 && (
        <div className="mt-4 p-4 rounded-2xl glass-panel-secondary border border-[#E8E7F2]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#77758F]" />
              <h3 className="text-xs font-bold text-[#77758F] tracking-widest uppercase">
                Inactive / Maintenance Rooms ({inactiveRooms.length})
              </h3>
            </div>
            <span className="text-[10px] text-[#8F8CA4]">Not available for new bookings</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {inactiveRooms.map((room) => (
              <DisplayRoomCard key={room.id} room={room} />
            ))}
          </div>
        </div>
      )}

      {/* Bottom Summary Bar */}
      <div className="pt-6 border-t border-[#E8E7F2] mt-8 md:mt-10 shrink-0 mb-6 pb-2 relative z-10 w-full clear-both">
        <div className="text-[#77758F] text-[10px] md:text-xs font-bold tracking-widest uppercase mb-3">
          Daily Overview
        </div>
        <div className="grid grid-cols-3 gap-2 md:gap-3 w-full">
          <GlassPanel className="p-2.5 md:p-3 rounded-xl flex flex-col justify-center glass-panel-secondary border border-[#E8E7F2] md:shadow-sm md:flex-row md:items-center md:justify-between text-center md:text-left">
            <span className="text-[9px] md:text-xs font-bold uppercase tracking-wider text-[#77758F] mb-0.5 md:mb-0">Revenue</span>
            <span className="text-sm font-bold text-[#24213A]">
              ₹{totalRevenue.toLocaleString("en-IN")}
            </span>
          </GlassPanel>
          <GlassPanel className="p-2.5 md:p-3 rounded-xl flex flex-col justify-center glass-panel-secondary border border-[#E8E7F2] md:shadow-sm md:flex-row md:items-center md:justify-between text-center md:text-left">
            <span className="text-[9px] md:text-xs font-bold uppercase tracking-wider text-[#77758F] mb-0.5 md:mb-0">Booked</span>
            <span className="text-sm font-bold text-[#24213A]">{totalBookings}/{activeRooms.length || rooms.length}</span>
          </GlassPanel>
          <GlassPanel className="p-2.5 md:p-3 rounded-xl flex flex-col justify-center glass-panel-secondary border border-[#E8E7F2] md:shadow-sm md:flex-row md:items-center md:justify-between text-center md:text-left">
            <span className="text-[9px] md:text-xs font-bold uppercase tracking-wider text-[#77758F] mb-0.5 md:mb-0">Occupancy</span>
            <span className="text-sm font-bold text-[#24213A]">{occupancy}%</span>
          </GlassPanel>
        </div>
      </div>

      {/* Booking Modal */}
      {bookingRoom && (
        <BookingModal
          room={bookingRoom}
          isOpen={!!bookingRoom}
          onClose={() => setBookingRoom(null)}
          defaultDate={selectedDate}
          onConfirm={async (bookingData) => {
            return await createBooking(bookingData);
          }}
        />
      )}

      {/* View Details Modal */}
      {viewingRoom && (
        <ViewDetailsModal
          room={viewingRoom}
          isOpen={!!viewingRoom}
          onClose={() => setViewingRoom(null)}
        />
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  highlight,
}: {
  title: string;
  value: number;
  highlight?: "available" | "booked";
}) {
  return (
    <GlassPanel className="px-3 md:px-4 py-2.5 rounded-2xl glass-panel-secondary border border-[#E8E7F2] shadow-sm flex items-center gap-3">
      <div className="flex items-center gap-2">
        {highlight === "available" && (
          <span className="w-2 h-2 rounded-full bg-[#10B981] shadow-[0_0_8px_#10B981]" />
        )}
        {highlight === "booked" && (
          <span className="w-2 h-2 rounded-full bg-[#EF4444] shadow-[0_0_8px_#EF4444]" />
        )}
        <span className="text-base md:text-lg font-bold text-[#24213A]">{value}</span>
      </div>
      <span className="text-[10px] md:text-xs text-[#77758F] uppercase font-bold tracking-wider">
        {title}
      </span>
    </GlassPanel>
  );
}
