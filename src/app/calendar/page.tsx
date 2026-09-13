"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useHMSContext } from "@/components/providers/HMSProvider";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { format, addDays, startOfDay } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { DbBooking, Room } from "@/lib/types";
import { BookingModal } from "@/components/modals/BookingModal";
import { ViewDetailsModal } from "@/components/modals/ViewDetailsModal";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

export default function CalendarPage() {
  const { rooms, createBooking } = useHMSContext();
  const [startDate, setStartDate] = useState<Date>(() => startOfDay(new Date()));
  const [selectedMobileDate, setSelectedMobileDate] = useState<Date>(() => startOfDay(new Date()));
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
        setWindowBookings(data as unknown as DbBooking[]);
      }
    } catch (err: any) {
      console.error("Calendar fetch exception:", err);
      setFetchError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, windowStartStr, windowEndStr]);

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

  // Find booking for room on specific date
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
      // Open View Details
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
      // Open Booking Modal preselected for this room & date
      setSelectedBookingDate(format(date, "yyyy-MM-dd"));
      setBookingRoom(room);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto hide-scrollbar space-y-4 md:space-y-6 pb-20 md:pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 md:gap-4 px-1 md:px-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 md:text-[#F5F1E8]">Booking Calendar</h2>
          <p className="text-gray-500 md:text-[#96928A] mt-1 text-xs md:text-sm tracking-wide">
            14-day date-based availability matrix calculated from live bookings.
          </p>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-50 md:bg-[rgba(255,255,255,0.03)] border border-gray-200 md:border-[rgba(255,255,255,0.08)] rounded-xl px-2 py-1 text-xs text-gray-600 md:text-[#C7C3BA]">
            <button
              onClick={() => {
                const newStart = addDays(startDate, -7);
                setStartDate(newStart);
                setSelectedMobileDate(newStart);
              }}
              className="p-1.5 hover:bg-gray-100 md:hover:bg-transparent md:hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Previous Week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 md:px-3 font-bold md:font-medium text-gray-800 md:text-[#F5F1E8]">
              {format(dates[0], "d MMM")} – {format(dates[dates.length - 1], "d MMM")}
            </span>
            <button
              onClick={() => {
                const newStart = addDays(startDate, 7);
                setStartDate(newStart);
                setSelectedMobileDate(newStart);
              }}
              className="p-1.5 hover:bg-gray-100 md:hover:bg-transparent md:hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Next Week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => {
              const today = startOfDay(new Date());
              setStartDate(today);
              setSelectedMobileDate(today);
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 md:bg-[rgba(245,158,11,0.15)] text-[#F59E0B] hover:bg-amber-100 md:hover:bg-[rgba(245,158,11,0.25)] border border-amber-200 md:border-[rgba(245,158,11,0.3)] transition-colors cursor-pointer"
          >
            Today
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-center mx-1 md:mx-0">
          <p className="text-sm font-bold text-red-600">Unable to load calendar</p>
          <button 
            onClick={() => fetchCalendarBookings()}
            className="px-4 py-2 bg-red-100 text-red-700 font-bold text-xs rounded-xl hover:bg-red-200 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* MOBILE ONLY: Date Strip & Vertical List */}
      <div className="md:hidden flex flex-col gap-4">
        {/* Date Strip */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 px-1 snap-x">
          {dates.map((date, idx) => {
            const isSelected = format(date, "yyyy-MM-dd") === format(selectedMobileDate, "yyyy-MM-dd");
            const isToday = format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
            return (
              <button
                key={idx}
                onClick={() => setSelectedMobileDate(date)}
                className={`flex flex-col items-center justify-center min-w-[60px] p-2 rounded-[16px] transition-all snap-center border ${
                  isSelected 
                    ? "bg-[#F59E0B] border-[#F59E0B] text-white shadow-md shadow-amber-500/20" 
                    : isToday 
                      ? "bg-amber-50 border-amber-200 text-amber-900" 
                      : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isSelected ? "text-amber-100" : isToday ? "text-amber-600" : "text-gray-400"}`}>
                  {format(date, "EEE")}
                </span>
                <span className={`text-lg font-bold mt-0.5 ${isSelected ? "text-white" : "text-gray-900"}`}>
                  {format(date, "d")}
                </span>
              </button>
            );
          })}
        </div>

        {/* Mobile Room List */}
        <div className="flex flex-col gap-3 px-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Loader2 className="w-6 h-6 text-[#F59E0B] animate-spin" />
              <span className="text-gray-500 text-sm font-medium">Loading availability...</span>
            </div>
          ) : (
            rooms.map((room) => {
              const booking = getBookingForRoomOnDate(room.id, selectedMobileDate);
              const isBooked = !!booking;
              const guestName = booking?.guests?.[0]?.name;

              return (
                <div 
                  key={room.id}
                  onClick={() => handleCellClick(room, selectedMobileDate)}
                  className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col gap-3 active:scale-[0.98] transition-transform cursor-pointer"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-gray-900">{room.name}</span>
                      <span className="text-xs font-medium text-gray-500 mt-0.5">₹{room.pricePerNight.toLocaleString("en-IN")} / night</span>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      isBooked ? "bg-red-50 text-red-600 border border-red-100" : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                    }`}>
                      {isBooked ? "Booked" : "Available"}
                    </div>
                  </div>

                  {isBooked && (
                    <div className="mt-1 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Guest</span>
                        <span className="text-xs font-bold text-gray-800">{guestName || "Guest"}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Duration</span>
                        <span className="text-[11px] font-bold text-gray-600">{format(new Date(booking.check_in), "d MMM")} - {format(new Date(booking.check_out), "d MMM")}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* DESKTOP ONLY: Data Table */}
      <GlassPanel className="hidden md:block p-1 rounded-[24px] glass-panel-secondary border border-[rgba(255,255,255,0.05)] overflow-hidden">
        <div className="w-full overflow-x-auto hide-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1050px]">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.05)]">
                <th className="px-6 py-4 font-semibold text-[11px] uppercase tracking-widest text-[#96928A] min-w-[170px] sticky left-0 bg-[rgba(20,18,17,0.95)] z-10 backdrop-blur-xl">
                  Room
                </th>
                {dates.map((date, idx) => {
                  const isToday = format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                  return (
                    <th key={idx} className="px-2 py-3 text-center min-w-[58px]">
                      <div
                        className={`text-[10px] uppercase tracking-wider ${
                          isToday ? "text-[#F59E0B] font-bold" : "text-[#96928A]"
                        }`}
                      >
                        {format(date, "EEE")}
                      </div>
                      <div
                        className={`text-sm font-medium mt-0.5 ${
                          isToday
                            ? "text-[#F59E0B] font-bold bg-[rgba(245,158,11,0.15)] rounded-full w-6 h-6 flex items-center justify-center mx-auto"
                            : "text-[#F5F1E8]"
                        }`}
                      >
                        {format(date, "d")}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={15} className="px-6 py-16 text-center text-[#96928A]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 text-[#F59E0B] animate-spin" />
                      <span>Loading calendar availability...</span>
                    </div>
                  </td>
                </tr>
              ) : (
                rooms.map((room, roomIdx) => (
                  <tr
                    key={room.id}
                    className={`group transition-colors hover:bg-[rgba(255,255,255,0.02)] ${
                      roomIdx !== rooms.length - 1 ? "border-b border-[rgba(255,255,255,0.03)]" : ""
                    }`}
                  >
                    <td className="px-6 py-4 sticky left-0 bg-[rgba(20,18,17,0.95)] z-10 backdrop-blur-xl">
                      <div className="font-medium text-[#F5F1E8]">{room.name}</div>
                      <div className="text-[10px] text-[#96928A]">
                        ₹{room.pricePerNight.toLocaleString("en-IN")}/night
                      </div>
                    </td>
                    {dates.map((date, idx) => {
                      const booking = getBookingForRoomOnDate(room.id, date);
                      const isBooked = !!booking;
                      const guestName = booking?.guests?.[0]?.name;

                      return (
                        <td key={idx} className="p-1 text-center">
                          <button
                            onClick={() => handleCellClick(room, date)}
                            title={
                              isBooked
                                ? `Booked: ${guestName || "Guest"} (${booking?.check_in} to ${booking?.check_out})`
                                : `Available: Click to book ${room.name} on ${format(date, "d MMM")}`
                            }
                            className={`w-full h-11 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer p-1 ${
                              isBooked
                                ? "bg-[rgba(255,105,120,0.12)] border border-[rgba(255,105,120,0.25)] hover:bg-[rgba(255,105,120,0.2)]"
                                : "bg-[rgba(79,231,123,0.04)] border border-[rgba(79,231,123,0.1)] hover:bg-[rgba(79,231,123,0.12)]"
                            }`}
                          >
                            {isBooked ? (
                              <>
                                <div className="w-1.5 h-1.5 rounded-full bg-[#FF6978] shadow-[0_0_8px_#FF6978] mb-0.5" />
                                <span className="text-[9px] text-[#FF6978] font-medium truncate max-w-[48px]">
                                  {guestName || "Booked"}
                                </span>
                              </>
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full bg-[#4FE77B]/40" />
                            )}
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
      </GlassPanel>

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
