"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useHMSContext } from "@/components/providers/HMSProvider";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { format, addDays, startOfDay } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { DbBooking, Room } from "@/lib/types";
import { BookingModal } from "@/components/modals/BookingModal";
import { ViewDetailsModal } from "@/components/modals/ViewDetailsModal";
import { ChevronLeft, ChevronRight, Loader2, Calendar as CalendarIcon, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CalendarPage() {
  const { rooms, createBooking } = useHMSContext();
  const [startDate, setStartDate] = useState<Date>(() => startOfDay(new Date()));
  const [windowBookings, setWindowBookings] = useState<DbBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [bookingRoom, setBookingRoom] = useState<Room | null>(null);
  const [selectedBookingDate, setSelectedBookingDate] = useState<string>("");
  const [viewingRoom, setViewingRoom] = useState<Room | null>(null);

  const supabase = useMemo(() => createClient(), []);

  // Generate 14 days from startDate
  const dates = useMemo(() => {
    return Array.from({ length: 14 }).map((_, i) => addDays(startDate, i));
  }, [startDate]);

  const windowStartStr = useMemo(() => format(dates[0], "yyyy-MM-dd"), [dates]);
  const windowEndStr = useMemo(() => format(dates[dates.length - 1], "yyyy-MM-dd"), [dates]);

  const fetchCalendarBookings = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session) {
        console.warn("No active session, skipping calendar fetch.");
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id,
          room_id,
          partner_id,
          check_in,
          check_out,
          created_at,
          status,
          number_of_guests,
          nightly_rate,
          total_amount,
          notes,
          partners ( id, name ),
          guests ( id, name, phone, email, is_primary )
        `)
        .neq("status", "cancelled")
        .lte("check_in", windowEndStr)
        .gte("check_out", windowStartStr);

      if (error) {
        console.error("Calendar bookings error", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setFetchError("Unable to load calendar data.");
      } else if (data) {
        // Scope to currently loaded rooms if rooms exist
        const allBookings = data as unknown as DbBooking[];
        if (rooms.length > 0) {
          const roomIds = new Set(rooms.map((r) => r.id));
          setWindowBookings(allBookings.filter((b) => roomIds.has(b.room_id)));
        } else {
          setWindowBookings(allBookings);
        }
      }
    } catch (err: any) {
      console.error("Calendar fetch exception:", err);
      setFetchError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, windowStartStr, windowEndStr, rooms]);

  useEffect(() => {
    fetchCalendarBookings();

    const channel = supabase
      .channel("calendar-page-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        fetchCalendarBookings();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchCalendarBookings]);

  // A booking occupies check-in through the night before check-out;
  // check-out date itself is available unless another booking starts that day.
  const getBookingForRoomOnDate = (roomId: string, date: Date): DbBooking | undefined => {
    const dateStr = format(date, "yyyy-MM-dd");
    return windowBookings.find((b) => {
      const isRoomMatch = b.room_id === roomId || b.rooms?.id === roomId;
      return isRoomMatch && b.check_in <= dateStr && b.check_out > dateStr;
    });
  };

  const handleCellClick = (room: Room, date: Date) => {
    const existingBooking = getBookingForRoomOnDate(room.id, date);
    if (existingBooking) {
      // Open View Details Modal
      const rawGuests = existingBooking.guests || [];
      const primaryGuest = rawGuests.find((g) => g.is_primary) || rawGuests[0];
      const roomWithDetails: Room = {
        ...room,
        status: "booked",
        currentBooking: {
          id: existingBooking.id,
          guests: rawGuests.map((g) => ({
            id: g.id,
            name: g.name,
            phone: g.phone,
            email: g.email,
            isPrimary: !!g.is_primary,
          })),
          guestPhone: primaryGuest?.phone || undefined,
          checkIn: existingBooking.check_in,
          checkOut: existingBooking.check_out,
          createdAt: existingBooking.created_at,
          bookedBy: existingBooking.partners?.name || "Partner",
          partnerId: existingBooking.partner_id,
          bookingAmount: existingBooking.total_amount,
          status: existingBooking.status,
          notes: existingBooking.notes || undefined,
        },
      };
      setViewingRoom(roomWithDetails);
    } else {
      // Inactive rooms cannot be booked
      if (room.is_active === false) return;

      // Open Booking Modal preselected for this room & date
      setSelectedBookingDate(format(date, "yyyy-MM-dd"));
      setBookingRoom(room);
    }
  };

  const isCurrentWindowToday = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    return dates.some((d) => format(d, "yyyy-MM-dd") === todayStr);
  }, [dates]);

  return (
    <div className="flex flex-col h-full w-full max-w-full min-w-0 overflow-y-auto overflow-x-hidden hide-scrollbar space-y-4 md:space-y-5 pb-20 md:pb-10">
      {/* 1. Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 md:gap-4 px-1 md:px-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-[#24213A] tracking-tight">Booking Calendar</h2>
          <p className="text-[#77758F] mt-1 text-xs md:text-sm tracking-wide">
            14-day availability matrix · Click on a date to manage bookings
          </p>
        </div>

        {/* 2. Clear Date Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-[#FFFFFF] border border-[#E8E7F2] rounded-2xl p-1 gap-1 text-xs text-[#24213A] shadow-sm">
            <button
              onClick={() => setStartDate((prev) => addDays(prev, -14))}
              className="p-1.5 hover:text-[#5146D8] rounded-xl hover:bg-[#F0EEFF] transition-colors cursor-pointer text-[#77758F]"
              title="Previous 14 Days"
              aria-label="Previous 14 days"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-3 font-semibold text-xs sm:text-sm text-[#24213A] tracking-wide whitespace-nowrap">
              {format(dates[0], "d MMM")} – {format(dates[dates.length - 1], "d MMM")}
            </span>

            <button
              onClick={() => {
                const today = startOfDay(new Date());
                setStartDate(today);
              }}
              className="p-1.5 hover:text-[#5146D8] rounded-xl hover:bg-[#F0EEFF] transition-colors cursor-pointer text-[#5146D8]"
              title="Jump to Current Date"
              aria-label="Jump to Current Date"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setStartDate((prev) => addDays(prev, 14))}
              className="p-1.5 hover:text-[#5146D8] rounded-xl hover:bg-[#F0EEFF] transition-colors cursor-pointer text-[#77758F]"
              title="Next 14 Days"
              aria-label="Next 14 days"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => {
              const today = startOfDay(new Date());
              setStartDate(today);
            }}
            className={cn(
              "px-4 py-2 rounded-2xl text-xs font-bold border transition-colors cursor-pointer",
              isCurrentWindowToday
                ? "bg-[#F0EEFF] text-[#5146D8] border-[#E0DEF8] shadow-sm"
                : "bg-[#FFFFFF] text-[#77758F] border-[#E8E7F2] hover:text-[#24213A] hover:bg-[#F7F7FC]"
            )}
          >
            Today
          </button>
        </div>
      </div>

      {/* 5. Single Merged Compact Legend */}
      <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 rounded-2xl bg-[#FFFFFF] border border-[#E8E7F2] text-xs text-[#77758F] flex-wrap gap-2 shadow-sm">
        <div className="flex items-center gap-3.5 sm:gap-6 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#10B981]" />
            <span className="text-[#24213A] font-medium text-xs">Available</span>
            <span className="text-[#77758F] text-[11px]">— Click to book</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
            <span className="text-[#24213A] font-medium text-xs">Booked</span>
            <span className="text-[#77758F] text-[11px]">— Click to view</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#77758F]" />
            <span className="text-[#24213A] font-medium text-xs">Inactive</span>
            <span className="text-[#77758F] text-[11px]">— Not bookable</span>
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-center mx-1 md:mx-0 shadow-sm">
          <p className="text-sm font-bold text-[#DC2626]">{fetchError}</p>
          <button 
            onClick={() => fetchCalendarBookings()}
            className="px-4 py-2 bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FECACA] font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* 3 & 4. Calendar Matrix Container */}
      <div className="p-1.5 sm:p-2 rounded-[24px] bg-[#FFFFFF] border border-[#E8E7F2] w-full max-w-full min-w-0 shadow-[0_4px_24px_rgba(36,33,58,0.03)] overflow-hidden">
        {/* Horizontal scroll strictly within calendar container */}
        <div className="w-full max-w-full overflow-x-auto overflow-y-hidden touch-pan-x hide-scrollbar">
          <table className="w-full text-left border-collapse table-fixed min-w-[944px] sm:min-w-[1058px] md:min-w-[1108px]">
            <colgroup>
              <col className="w-[160px] min-w-[160px] max-w-[160px] sm:w-[190px] sm:min-w-[190px] sm:max-w-[190px] md:w-[240px] md:min-w-[240px] md:max-w-[240px]" />
              {dates.map((_, i) => (
                <col
                  key={i}
                  className="w-[56px] min-w-[56px] max-w-[56px] sm:w-[62px] sm:min-w-[62px] sm:max-w-[62px]"
                />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-[#E8E7F2] bg-[#F7F7FC]/70">
                {/* 3. Sticky Room Column Header */}
                <th className="px-3.5 sm:px-4 py-3.5 font-bold text-[10px] sm:text-[11px] uppercase tracking-wider text-[#77758F] sticky left-0 bg-[#FFFFFF] z-20 border-r border-[#E8E7F2]">
                  ROOM ({rooms.length})
                </th>
                {dates.map((date, idx) => {
                  const isToday = format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                  return (
                    <th
                      key={idx}
                      className="px-1 py-2 text-center"
                    >
                      <div
                        className={cn(
                          "text-[9px] sm:text-[10px] uppercase tracking-wider font-bold",
                          isToday ? "text-[#5146D8]" : "text-[#77758F]"
                        )}
                      >
                        {format(date, "EEE")}
                      </div>
                      <div className="mt-0.5 flex items-center justify-center">
                        {isToday ? (
                          <div className="w-6 h-6 rounded-full bg-[#5146D8] text-white font-bold text-xs flex items-center justify-center shadow-sm">
                            {format(date, "d")}
                          </div>
                        ) : (
                          <div className="text-xs sm:text-sm font-semibold text-[#24213A]">
                            {format(date, "d")}
                          </div>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={15} className="px-6 py-16 text-center text-[#77758F]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 text-[#5146D8] animate-spin" />
                      <span>Loading calendar availability...</span>
                    </div>
                  </td>
                </tr>
              ) : rooms.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-6 py-16 text-center text-[#77758F]">
                    No rooms configured for this property.
                  </td>
                </tr>
              ) : (
                rooms.map((room, roomIdx) => (
                  <tr
                    key={room.id}
                    className={cn(
                      "group transition-colors hover:bg-[#F7F7FC]",
                      roomIdx !== rooms.length - 1 && "border-b border-[#E8E7F2]"
                    )}
                  >
                    {/* 3 & 4. Sticky Room Info Column */}
                    <td
                      className={cn(
                        "px-3.5 sm:px-4 py-3 sticky left-0 bg-[#FFFFFF] z-10 border-r border-[#E8E7F2]",
                        room.is_active === false && "opacity-70"
                      )}
                    >
                      <div className="flex flex-col min-w-0">
                        <div className="font-bold text-xs sm:text-sm text-[#24213A] leading-snug break-words">
                          {room.name}
                        </div>
                        <div className="text-[11px] text-[#5146D8] font-semibold mt-0.5">
                          ₹{room.pricePerNight.toLocaleString("en-IN")}<span className="text-[#77758F] font-normal text-[10px]">/night</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-[#77758F] mt-0.5">
                          <Users className="w-3 h-3 text-[#77758F] shrink-0" />
                          <span>Max {room.maxCapacity} Guests</span>
                        </div>
                      </div>
                    </td>

                    {/* Date Cells */}
                    {dates.map((date, idx) => {
                      const booking = getBookingForRoomOnDate(room.id, date);
                      const isBooked = !!booking;
                      const isInactive = room.is_active === false;

                      if (isBooked) {
                        return (
                          <td
                            key={idx}
                            className="p-1 text-center"
                          >
                            <button
                              type="button"
                              onClick={() => handleCellClick(room, date)}
                              title={`Booked: ${booking.guests?.[0]?.name || "Guest"} (${booking.check_in} → ${booking.check_out})`}
                              className="w-full h-12 sm:h-13 rounded-2xl flex items-center justify-center transition-all cursor-pointer p-1 bg-[#FEF2F2] border border-[#FECACA] hover:bg-[#FEE2E2]"
                            >
                              <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
                            </button>
                          </td>
                        );
                      }

                      if (isInactive) {
                        return (
                          <td
                            key={idx}
                            className="p-1 text-center"
                          >
                            <div
                              title={`${room.name} is inactive and non-bookable`}
                              className="w-full h-12 sm:h-13 rounded-2xl flex items-center justify-center p-1 bg-[#F7F7FC] border border-[#E8E7F2] cursor-not-allowed opacity-50"
                            >
                              <span className="text-[#77758F] text-xs font-bold leading-none">—</span>
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={idx}
                          className="p-1 text-center"
                        >
                          <button
                            type="button"
                            onClick={() => handleCellClick(room, date)}
                            title={`Available: Click to book ${room.name} on ${format(date, "d MMM")}`}
                            className="w-full h-12 sm:h-13 rounded-2xl flex items-center justify-center transition-all cursor-pointer p-1 bg-[#ECFDF5] border border-[#A7F3D0] hover:bg-[#D1FAE5]"
                          >
                            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Booking Modal */}
      {bookingRoom && (
        <BookingModal
          room={bookingRoom}
          isOpen={!!bookingRoom}
          onClose={() => setBookingRoom(null)}
          defaultDate={selectedBookingDate}
          onConfirm={async (data) => {
            return await createBooking(data);
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
