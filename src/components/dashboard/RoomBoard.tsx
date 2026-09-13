"use client";

import { useState, useEffect, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { RoomColumn } from "./RoomColumn";
import { Room, RoomStatus } from "@/lib/types";
import { RoomCard } from "./RoomCard";
import { DisplayRoomCard } from "./DisplayRoomCard";
import { UI_Room } from "@/data/rooms";
import { GlassPanel } from "../ui/GlassPanel";
import { BookingModal } from "../modals/BookingModal";
import { ViewDetailsModal } from "../modals/ViewDetailsModal";
import { useHMSContext } from "../providers/HMSProvider";
import { useAuth } from "../providers/AuthProvider";
import { cn } from "@/lib/utils";
import { Calendar, CalendarIcon, ChevronLeft, ChevronRight, Loader2, BedDouble, Users } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { formatISTFullDate, getISTDateString } from "@/lib/dateUtils";

export function RoomBoard() {
  const { rooms, selectedDate, setSelectedDate, isLoading, createBooking, currentISTDate } = useHMSContext();
  const { partner } = useAuth();

  const [isMounted, setIsMounted] = useState(false);
  const [activeRoom, setActiveRoom] = useState<UI_Room | null>(null);
  const [bookingRoom, setBookingRoom] = useState<UI_Room | null>(null);
  const [viewingRoom, setViewingRoom] = useState<Room | null>(null);
  const [mobileTab, setMobileTab] = useState<"all" | "available" | "booked">("all");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Listen for the custom event from RoomCard to open View Details
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const availableRooms = useMemo(() => rooms.filter((r) => r.status === "available"), [rooms]);
  const bookedRooms = useMemo(() => rooms.filter((r) => r.status === "booked"), [rooms]);

  const totalGuests = useMemo(
    () => bookedRooms.reduce((sum, r) => sum + (r.currentBooking?.guests?.length || 0), 0),
    [bookedRooms]
  );
  const totalRevenue = useMemo(
    () => rooms.reduce((sum, r) => sum + (r.currentBooking?.bookingAmount || 0), 0),
    [rooms]
  );
  const totalBookings = bookedRooms.length;
  const occupancy = rooms.length > 0 ? Math.round((totalBookings / rooms.length) * 100) : 0;

  // Time-based greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  }, []);

  const partnerDisplayName = partner?.name || "Partner";

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const room = rooms.find((r) => r.id === active.id);
    if (room) setActiveRoom(room);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveRoom(null);

    if (!over) return;

    const room = rooms.find((r) => r.id === active.id);
    if (!room) return;

    const targetStatus = over.id as RoomStatus;

    if (room.status === targetStatus) return;

    if (targetStatus === "booked") {
      // Dragging available room into booked area: open booking modal
      setTimeout(() => {
        setBookingRoom(room);
      }, 150);
    } else {
      // Dragging booked room into available area:
      // Requirement 9: Do NOT delete through drag-and-drop. Open view details / management modal instead.
      setTimeout(() => {
        setViewingRoom(room);
      }, 150);
    }
  };

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

  const handleToday = () => {
    setSelectedDate(getISTDateString());
  };

  return (
    <div className="w-full flex flex-col md:flex-1 md:min-h-0 relative z-0 pb-6">
      {/* Desktop Top Header & Stats */}
      <div className="hidden md:flex flex-col lg:flex-row justify-between items-start lg:items-end mb-6 gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl md:text-2xl font-bold text-[#F5F1E8] tracking-wide mb-1 flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
              <span>{greeting},</span>
              <span className="text-[#F59E0B]">{partnerDisplayName}</span>
            </h2>
            {isLoading && (
              <Loader2 className="w-4 h-4 text-[#F59E0B] animate-spin shrink-0" />
            )}
          </div>
          <p className="text-xs md:text-sm text-[#96928A] tracking-wider">
            Drag and drop rooms to manage bookings
          </p>
          
          {/* Date Selector Navigation */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-xl px-2.5 py-1 text-xs text-[#C7C3BA]">
              <button
                onClick={handlePrevDay}
                className="p-1 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Previous Day"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-center gap-1.5 px-2 font-medium text-[#F5F1E8]">
                <CalendarIcon className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>{formattedSelectedDate}</span>
              </div>
              <button
                onClick={handleNextDay}
                className="p-1 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Next Day"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {selectedDate !== getISTDateString() && (
              <button
                onClick={handleToday}
                className="px-2.5 py-1 rounded-xl text-[11px] font-medium bg-[rgba(245,158,11,0.15)] text-[#F59E0B] hover:bg-[rgba(245,158,11,0.25)] border border-[rgba(245,158,11,0.3)] transition-colors cursor-pointer"
              >
                Today
              </button>
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

      {/* Mobile Top Header & Stats */}
      <div className="flex md:hidden flex-col mb-4 gap-4 shrink-0">
        <div className="flex flex-col items-start w-full gap-1">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-medium text-gray-500 tracking-wide">
              {greeting},
            </h2>
            <h3 className="text-sm font-bold text-gray-900 tracking-wide">
              {partnerDisplayName}
            </h3>
          </div>
          <div className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span>{availableRooms.length} Available</span>
            <span className="text-gray-300">•</span>
            <span>{bookedRooms.length} Booked</span>
          </div>
        </div>

        <div className="w-full flex justify-between items-center bg-white px-3 py-2 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-gray-100">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span className="text-[13px] text-gray-800 font-bold tracking-wide">
              {currentISTDate ? formatISTFullDate(selectedDate) : "Loading..."}
            </span>
          </div>
          <div className="flex items-center gap-1">
             <button onClick={handlePrevDay} className="p-1 text-gray-400 hover:text-gray-600"><ChevronLeft className="w-4 h-4"/></button>
             {selectedDate !== getISTDateString() && (
                <button onClick={handleToday} className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#F59E0B]/10 text-[#F59E0B]">TODAY</button>
             )}
             <button onClick={handleNextDay} className="p-1 text-gray-400 hover:text-gray-600"><ChevronRight className="w-4 h-4"/></button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-1">
          <div className="bg-white rounded-[16px] p-3 flex flex-col justify-center border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex justify-between items-center w-full mb-1">
              <BedDouble className="w-4 h-4 text-gray-400" />
              <div className="text-lg font-bold text-gray-900">{rooms.length}</div>
            </div>
            <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Total Rooms</div>
          </div>
          
          <div className="bg-white rounded-[16px] p-3 flex flex-col justify-center border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex justify-between items-center w-full mb-1">
              <div className="w-2 h-2 rounded-full bg-[#10B981]" />
              <div className="text-lg font-bold text-gray-900">{availableRooms.length}</div>
            </div>
            <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Available</div>
          </div>
          
          <div className="bg-white rounded-[16px] p-3 flex flex-col justify-center border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex justify-between items-center w-full mb-1">
              <div className="w-2 h-2 rounded-full bg-[#EF4444]" />
              <div className="text-lg font-bold text-gray-900">{bookedRooms.length}</div>
            </div>
            <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Booked</div>
          </div>
          
          <div className="bg-white rounded-[16px] p-3 flex flex-col justify-center border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex justify-between items-center w-full mb-1">
              <Users className="w-4 h-4 text-gray-400" />
              <div className="text-lg font-bold text-gray-900">{totalGuests}</div>
            </div>
            <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Guests Today</div>
          </div>
        </div>

        {/* Mobile Filter Tabs */}
        <div className="flex items-center gap-2 mt-2 bg-gray-100 p-1.5 rounded-[16px]">
          {(['all', 'available', 'booked'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={cn(
                "flex-1 py-2.5 min-h-[44px] text-xs font-bold rounded-xl transition-all capitalize tracking-wide flex items-center justify-center",
                mobileTab === tab 
                  ? "bg-white text-gray-900 shadow-sm border border-gray-200" 
                  : "text-gray-500 hover:bg-gray-200"
              )}
            >
              {tab} {tab === 'all' ? rooms.length : tab === 'available' ? availableRooms.length : bookedRooms.length}
            </button>
          ))}
        </div>
      </div>

      {/* Main Drag-and-Drop Columns */}
      <DndContext
        id="hms-room-board"
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col md:grid md:grid-cols-2 gap-6 md:gap-8 md:flex-1 md:min-h-0 relative">
          {/* Vertical Divider for Desktop */}
          <div className="hidden md:block absolute left-1/2 top-10 bottom-10 w-px bg-gradient-to-b from-transparent via-[rgba(255,255,255,0.1)] to-transparent -translate-x-1/2" />

          <RoomColumn status="available" rooms={availableRooms} mobileVisible={mobileTab === 'all' || mobileTab === 'available'} />
          <RoomColumn status="booked" rooms={bookedRooms} mobileVisible={mobileTab === 'all' || mobileTab === 'booked'} />
        </div>

        {isMounted && (
          <DragOverlay
            dropAnimation={{ duration: 180, easing: "ease-out" }}
            className="z-50 pointer-events-none cursor-grabbing"
          >
            {activeRoom ? (
              <div className="scale-[1.02] -translate-y-[2px] shadow-[0_25px_60px_rgba(0,0,0,0.5)] border border-[rgba(255,255,255,0.25)] rounded-[24px]">
                <DisplayRoomCard room={activeRoom} />
              </div>
            ) : null}
          </DragOverlay>
        )}
      </DndContext>

      {/* Bottom Summary Bar */}
      <div className="pt-4 border-t border-gray-200 md:border-[rgba(255,255,255,0.06)] mt-6 shrink-0 mb-4 md:mb-0">
        <div className="text-gray-500 md:text-[#96928A] text-[10px] md:text-xs font-bold tracking-widest uppercase mb-3">
          Daily Overview
        </div>
        <div className="grid grid-cols-3 md:grid-cols-4 gap-2 md:gap-3 w-full">
          <GlassPanel className="p-2.5 md:p-3 rounded-xl flex flex-col justify-center bg-gray-50 border border-gray-100 shadow-sm md:glass-panel-secondary md:border md:shadow-lg md:flex-row md:items-center md:justify-between text-center md:text-left">
            <span className="text-[9px] md:text-xs font-bold uppercase tracking-wider text-gray-500 md:text-[#C7C3BA] mb-0.5 md:mb-0">Revenue</span>
            <span className="text-sm font-bold text-gray-900 md:text-[#F2EEE3]">
              ₹{totalRevenue.toLocaleString("en-IN")}
            </span>
          </GlassPanel>
          <GlassPanel className="p-2.5 md:p-3 rounded-xl flex flex-col justify-center bg-gray-50 border border-gray-100 shadow-sm md:glass-panel-secondary md:border md:shadow-lg md:flex-row md:items-center md:justify-between text-center md:text-left">
            <span className="text-[9px] md:text-xs font-bold uppercase tracking-wider text-gray-500 md:text-[#C7C3BA] mb-0.5 md:mb-0">Booked</span>
            <span className="text-sm font-bold text-gray-900 md:text-[#F2EEE3]">{totalBookings}/{rooms.length}</span>
          </GlassPanel>
          <GlassPanel className="p-2.5 md:p-3 rounded-xl flex flex-col justify-center bg-gray-50 border border-gray-100 shadow-sm md:glass-panel-secondary md:border md:shadow-lg md:flex-row md:items-center md:justify-between text-center md:text-left">
            <span className="text-[9px] md:text-xs font-bold uppercase tracking-wider text-gray-500 md:text-[#C7C3BA] mb-0.5 md:mb-0">Occupancy</span>
            <span className="text-sm font-bold text-gray-900 md:text-[#F2EEE3]">{occupancy}%</span>
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
    <GlassPanel className="px-5 py-3 rounded-full flex items-center gap-4 glass-panel-secondary border border-[rgba(255,255,255,0.08)]">
      {highlight && (
        <div
          className={cn(
            "w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]",
            highlight === "available"
              ? "bg-[#4FE77B] text-[#4FE77B]"
              : "bg-[#FF6978] text-[#FF6978]"
          )}
        />
      )}
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-[#F5F1E8]">{value}</span>
        <span className="text-xs font-medium text-[#96928A] tracking-wider">{title}</span>
      </div>
    </GlassPanel>
  );
}
