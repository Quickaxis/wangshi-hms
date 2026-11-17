"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useHMSContext } from "@/components/providers/HMSProvider";
import { format, addDays, startOfDay, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { DbBooking, Room, DbInvoice } from "@/lib/types";
import { BookingModal } from "@/components/modals/BookingModal";
import { ViewDetailsModal } from "@/components/modals/ViewDetailsModal";
import { InvoiceEditorModal } from "@/components/modals/InvoiceEditorModal";
import { getOrCreateBookingFolioAction } from "@/app/actions/invoices";
import { formatPhoneNumberForCall } from "@/lib/phoneUtils";
import { formatISTCompactDate } from "@/lib/dateUtils";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Calendar as CalendarIcon,
  Users,
  User,
  Phone,
  Search,
  CheckCircle,
  LogOut,
  Receipt,
  Eye,
  Plus,
  LayoutGrid,
  ListFilter,
  Building2,
  BedDouble,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Safe date range string formatting
function formatSafeDateRange(checkInStr: string, checkOutStr: string) {
  try {
    const inParts = checkInStr.split("-");
    const outParts = checkOutStr.split("-");
    if (inParts.length === 3 && outParts.length === 3) {
      const inDate = new Date(parseInt(inParts[0]), parseInt(inParts[1]) - 1, parseInt(inParts[2]));
      const outDate = new Date(parseInt(outParts[0]), parseInt(outParts[1]) - 1, parseInt(outParts[2]));
      return `${format(inDate, "d MMM")} – ${format(outDate, "d MMM")}`;
    }
    return `${checkInStr} – ${checkOutStr}`;
  } catch {
    return `${checkInStr} – ${checkOutStr}`;
  }
}

function calculateStayNights(checkInStr: string, checkOutStr: string) {
  try {
    const inParts = checkInStr.split("-");
    const outParts = checkOutStr.split("-");
    if (inParts.length === 3 && outParts.length === 3) {
      const inDate = new Date(parseInt(inParts[0]), parseInt(inParts[1]) - 1, parseInt(inParts[2]));
      const outDate = new Date(parseInt(outParts[0]), parseInt(outParts[1]) - 1, parseInt(outParts[2]));
      const diff = outDate.getTime() - inDate.getTime();
      return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
    }
    return 1;
  } catch {
    return 1;
  }
}

function getBookingStatusBadge(status?: string) {
  switch (status?.toLowerCase()) {
    case "checked_in":
      return {
        cardBg: "bg-[#ECFDF5] border-[#A7F3D0] hover:bg-[#D1FAE5] text-[#065F46]",
        badgeBg: "bg-[#D1FAE5] text-[#047857] border-[#A7F3D0]",
        label: "Checked In",
        dotColor: "bg-[#10B981]",
      };
    case "confirmed":
      return {
        cardBg: "bg-[#FFFBEB] border-[#FDE68A] hover:bg-[#FEF3C7] text-[#92400E]",
        badgeBg: "bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]",
        label: "Confirmed",
        dotColor: "bg-[#F59E0B]",
      };
    case "checked_out":
      return {
        cardBg: "bg-[#EFF6FF] border-[#BFDBFE] hover:bg-[#DBEAFE] text-[#1E40AF]",
        badgeBg: "bg-[#DBEAFE] text-[#1D4ED8] border-[#BFDBFE]",
        label: "Checked Out",
        dotColor: "bg-[#3B82F6]",
      };
    case "pending":
      return {
        cardBg: "bg-[#F5F3FF] border-[#DDD6FE] hover:bg-[#EDE9FE] text-[#5B21B6]",
        badgeBg: "bg-[#EDE9FE] text-[#6D28D9] border-[#DDD6FE]",
        label: "Pending",
        dotColor: "bg-[#8B5CF6]",
      };
    default:
      return {
        cardBg: "bg-[#F0EEFF] border-[#E0DEF8] hover:bg-[#E5E2FA] text-[#3730A3]",
        badgeBg: "bg-[#E0DEF8] text-[#5146D8] border-[#C7D2FE]",
        label: status || "Booked",
        dotColor: "bg-[#5146D8]",
      };
  }
}

export default function CalendarPage() {
  const { rooms, createBooking, selectedHomestayId, homestays } = useHMSContext();
  const currentHomestay = homestays?.find((h) => h.id === selectedHomestayId) || homestays?.[0];

  // View mode switcher: "matrix" (14-day grid) | "occupancy" (room-by-room operational list)
  const [viewMode, setViewMode] = useState<"matrix" | "occupancy">("matrix");

  // Matrix View State
  const [startDate, setStartDate] = useState<Date>(() => startOfDay(new Date()));
  const [windowBookings, setWindowBookings] = useState<DbBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Occupancy at a Glance State
  const [occupancyDate, setOccupancyDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [occupancySearchQuery, setOccupancySearchQuery] = useState<string>("");

  // Modals State
  const [bookingRoom, setBookingRoom] = useState<Room | null>(null);
  const [selectedBookingDate, setSelectedBookingDate] = useState<string>("");
  const [viewingRoom, setViewingRoom] = useState<Room | null>(null);

  // Direct Folio Modal State
  const [folioBooking, setFolioBooking] = useState<DbBooking | null>(null);
  const [folioInvoice, setFolioInvoice] = useState<DbInvoice | null>(null);
  const [isFolioModalOpen, setIsFolioModalOpen] = useState(false);

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
      const {
        data: { session },
        error: authError,
      } = await supabase.auth.getSession();
      if (authError || !session) {
        console.warn("No active session, skipping calendar fetch.");
        setIsLoading(false);
        return;
      }

      let query = supabase
        .from("bookings")
        .select(`
          id,
          room_id,
          homestay_id,
          partner_id,
          check_in,
          check_out,
          created_at,
          status,
          number_of_guests,
          nightly_rate,
          total_amount,
          notes,
          group_id,
          is_group_lead,
          partners ( id, name ),
          guests ( id, name, phone, email, is_primary ),
          rooms ( id, room_number, name )
        `)
        .neq("status", "cancelled")
        .lte("check_in", windowEndStr)
        .gte("check_out", windowStartStr);

      if (selectedHomestayId) {
        query = query.eq("homestay_id", selectedHomestayId);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Calendar bookings error", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setFetchError("Unable to load calendar data.");
      } else if (data) {
        const allBookings = (data as unknown as DbBooking[]) || [];

        // Identify group bookings that do not have their lead guest info in this window
        const groupIdsWithGuests = new Set(
          allBookings
            .filter((b) => b.group_id && b.guests && b.guests.some((g) => g.name && g.name.trim().toLowerCase() !== "guest"))
            .map((b) => b.group_id)
        );

        const missingGroupIds = Array.from(
          new Set(
            allBookings
              .filter((b) => b.group_id && !groupIdsWithGuests.has(b.group_id))
              .map((b) => b.group_id as string)
          )
        );

        if (missingGroupIds.length > 0) {
          try {
            const { data: externalLeadBookings } = await supabase
              .from("bookings")
              .select(`
                id,
                room_id,
                homestay_id,
                partner_id,
                check_in,
                check_out,
                created_at,
                status,
                number_of_guests,
                nightly_rate,
                total_amount,
                notes,
                group_id,
                is_group_lead,
                partners ( id, name ),
                guests ( id, name, phone, email, is_primary ),
                rooms ( id, room_number, name )
              `)
              .in("group_id", missingGroupIds)
              .eq("is_group_lead", true);

            if (externalLeadBookings && externalLeadBookings.length > 0) {
              allBookings.push(...(externalLeadBookings as unknown as DbBooking[]));
            }
          } catch (leadFetchErr) {
            console.warn("Could not fetch external group lead bookings:", leadFetchErr);
          }
        }

        if (rooms.length > 0) {
          const roomIds = new Set(rooms.map((r) => r.id));
          setWindowBookings(allBookings.filter((b) => roomIds.has(b.room_id) || b.is_group_lead));
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
  }, [supabase, windowStartStr, windowEndStr, rooms, selectedHomestayId]);

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

  // A booking occupies check-in through the night before check-out
  const getBookingForRoomOnDate = (roomId: string, date: Date | string): DbBooking | undefined => {
    const dateStr = typeof date === "string" ? date : format(date, "yyyy-MM-dd");
    return windowBookings.find((b) => {
      const isRoomMatch = b.room_id === roomId || b.rooms?.id === roomId;
      return isRoomMatch && b.check_in <= dateStr && b.check_out > dateStr;
    });
  };

  // Map group_id -> primary guest details across all bookings in the window
  const groupGuestMap = useMemo(() => {
    const map = new Map<
      string,
      {
        guest: { id?: string; name: string; phone?: string | null; email?: string | null; is_primary?: boolean };
        allGuests: any[];
      }
    >();

    windowBookings.forEach((b) => {
      if (!b.group_id) return;

      const guests = b.guests || [];
      if (guests.length === 0) return;

      const primary =
        guests.find((g) => g.is_primary && g.name && g.name.trim().toLowerCase() !== "guest") ||
        guests.find((g) => g.name && g.name.trim().toLowerCase() !== "guest") ||
        guests[0];

      if (!primary) return;

      const existing = map.get(b.group_id);
      if (!existing) {
        map.set(b.group_id, {
          guest: {
            id: primary.id,
            name: primary.name,
            phone: primary.phone || null,
            email: primary.email || null,
            is_primary: !!primary.is_primary,
          },
          allGuests: guests,
        });
      } else {
        const isExistingGeneric = existing.guest.name?.trim().toLowerCase() === "guest";
        const isCurrentValid = primary.name && primary.name.trim().toLowerCase() !== "guest";
        const isCurrentLead = b.is_group_lead;

        if ((isCurrentLead && isCurrentValid) || (isExistingGeneric && isCurrentValid)) {
          map.set(b.group_id, {
            guest: {
              id: primary.id || existing.guest.id,
              name: primary.name,
              phone: primary.phone || existing.guest.phone || null,
              email: primary.email || existing.guest.email || null,
              is_primary: !!primary.is_primary,
            },
            allGuests: guests.length > 0 ? guests : existing.allGuests,
          });
        }
      }
    });

    return map;
  }, [windowBookings]);

  // Resolves the effective guest for any booking, seamlessly falling back to parent group's primary guest
  const getEffectiveGuest = useCallback(
    (booking?: DbBooking | null) => {
      if (!booking) {
        return {
          name: "Guest",
          phone: null as string | null,
          email: null as string | null,
          isPrimary: true,
          guests: [] as any[],
          isGroup: false,
        };
      }

      const rawGuests = booking.guests || [];
      const ownPrimary = rawGuests.find((g) => g.is_primary) || rawGuests[0];
      const hasValidOwnName =
        ownPrimary &&
        ownPrimary.name &&
        ownPrimary.name.trim() !== "" &&
        ownPrimary.name.trim().toLowerCase() !== "guest";

      // If booking belongs to a group, check group's primary guest
      let groupPrimary: any = undefined;
      if (booking.group_id) {
        const groupInfo = groupGuestMap.get(booking.group_id);
        if (groupInfo && groupInfo.guest && groupInfo.guest.name && groupInfo.guest.name.trim().toLowerCase() !== "guest") {
          groupPrimary = groupInfo;
        }
      }

      // If child booking in group has NO valid own guest, fall back to group primary contact
      if (groupPrimary && !hasValidOwnName) {
        return {
          name: groupPrimary.guest.name.trim(),
          phone: groupPrimary.guest.phone || ownPrimary?.phone || null,
          email: groupPrimary.guest.email || ownPrimary?.email || null,
          isPrimary: true,
          guests: groupPrimary.allGuests && groupPrimary.allGuests.length > 0 ? groupPrimary.allGuests : rawGuests,
          isGroup: true,
        };
      }

      // Otherwise if own booking has valid name, use it
      if (hasValidOwnName) {
        return {
          name: ownPrimary.name.trim(),
          phone: ownPrimary.phone || (groupPrimary?.guest?.phone) || null,
          email: ownPrimary.email || (groupPrimary?.guest?.email) || null,
          isPrimary: !!ownPrimary.is_primary,
          guests: rawGuests,
          isGroup: !!booking.group_id,
        };
      }

      // If group primary exists (even if generic fallback), prefer it over blank
      if (groupPrimary) {
        return {
          name: groupPrimary.guest.name.trim() || "Guest",
          phone: groupPrimary.guest.phone || null,
          email: groupPrimary.guest.email || null,
          isPrimary: true,
          guests: groupPrimary.allGuests,
          isGroup: true,
        };
      }

      return {
        name: ownPrimary?.name?.trim() || "Guest",
        phone: ownPrimary?.phone || null,
        email: ownPrimary?.email || null,
        isPrimary: !!ownPrimary?.is_primary,
        guests: rawGuests,
        isGroup: !!booking.group_id,
      };
    },
    [groupGuestMap]
  );

  const handleCellClick = (room: Room, date: Date) => {
    const existingBooking = getBookingForRoomOnDate(room.id, date);
    if (existingBooking) {
      // Open View Details Modal with group primary guest fallback
      const effectiveGuest = getEffectiveGuest(existingBooking);
      const guestsList =
        effectiveGuest.guests.length > 0
          ? effectiveGuest.guests.map((g: any, idx: number) => ({
              id: g.id || `g-${existingBooking.id}-${idx}`,
              name: g.name,
              phone: g.phone || null,
              email: g.email || null,
              isPrimary: !!g.is_primary,
            }))
          : [
              {
                id: `g-${existingBooking.id}`,
                name: effectiveGuest.name,
                phone: effectiveGuest.phone || null,
                email: effectiveGuest.email || null,
                isPrimary: true,
              },
            ];

      const roomWithDetails: Room = {
        ...room,
        homestay_id: existingBooking.homestay_id || room.homestay_id,
        status: "booked",
        currentBooking: {
          id: existingBooking.id,
          groupId: existingBooking.group_id || undefined,
          isGroupLead: existingBooking.is_group_lead ?? undefined,
          guests: guestsList,
          guestPhone: effectiveGuest.phone || undefined,
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

  // Open Folio from Occupancy Table
  const handleOpenFolioForBooking = async (booking: DbBooking, room: Room) => {
    const effectiveGuest = getEffectiveGuest(booking);
    const guestsList =
      effectiveGuest.guests.length > 0
        ? effectiveGuest.guests
        : [
            {
              id: `g-${booking.id}`,
              name: effectiveGuest.name,
              phone: effectiveGuest.phone || null,
              email: effectiveGuest.email || null,
              is_primary: true,
            },
          ];

    const enrichedBooking: DbBooking = {
      ...booking,
      guests: guestsList as any,
    };

    try {
      const res = await getOrCreateBookingFolioAction(enrichedBooking.id);
      if (res.success && res.invoice) {
        setFolioInvoice(res.invoice);
      } else {
        setFolioInvoice(null);
      }
      setFolioBooking(enrichedBooking);
      setIsFolioModalOpen(true);
    } catch (err) {
      console.error("Failed to load folio:", err);
      setFolioInvoice(null);
      setFolioBooking(enrichedBooking);
      setIsFolioModalOpen(true);
    }
  };

  const isCurrentWindowToday = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    return dates.some((d) => format(d, "yyyy-MM-dd") === todayStr);
  }, [dates]);

  // Operational metrics for Occupancy at a glance
  const occupancyMetrics = useMemo(() => {
    let occupied = 0;
    let arriving = 0;
    let departing = 0;

    rooms.forEach((r) => {
      const b = getBookingForRoomOnDate(r.id, occupancyDate);
      if (b) occupied++;
    });

    windowBookings.forEach((b) => {
      if (b.check_in === occupancyDate) arriving++;
      if (b.check_out === occupancyDate) departing++;
    });

    const vacant = Math.max(0, rooms.length - occupied);

    return {
      total: rooms.length,
      occupied,
      vacant,
      arriving,
      departing,
    };
  }, [rooms, windowBookings, occupancyDate]);

  // Filtered rooms for Occupancy View with group-aware search
  const filteredOccupancyRooms = useMemo(() => {
    if (!occupancySearchQuery.trim()) return rooms;
    const q = occupancySearchQuery.toLowerCase().trim();

    return rooms.filter((r) => {
      const booking = getBookingForRoomOnDate(r.id, occupancyDate);
      const effectiveGuest = getEffectiveGuest(booking);
      const matchesRoom =
        r.name.toLowerCase().includes(q) ||
        (r.room_number && r.room_number.toLowerCase().includes(q));
      const matchesGuest =
        effectiveGuest.name.toLowerCase().includes(q) ||
        (effectiveGuest.phone && effectiveGuest.phone.includes(q)) ||
        (effectiveGuest.email && effectiveGuest.email.toLowerCase().includes(q));

      return matchesRoom || matchesGuest;
    });
  }, [rooms, occupancySearchQuery, occupancyDate, getEffectiveGuest]);

  return (
    <div className="flex flex-col h-full w-full max-w-full min-w-0 overflow-y-auto overflow-x-hidden hide-scrollbar space-y-4 md:space-y-5 pb-20 md:pb-10">
      {/* 1. Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 md:gap-4 px-1 md:px-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-bold text-[#24213A] tracking-tight">
              Booking Calendar
            </h2>
            {currentHomestay && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-[#5146D8] bg-[#F0EEFF] px-2.5 py-0.5 rounded-full border border-[#E0DEF8]">
                <Building2 className="w-3 h-3" />
                {currentHomestay.name}
              </span>
            )}
          </div>
          <p className="text-[#77758F] mt-1 text-xs md:text-sm tracking-wide">
            14-day availability matrix & room occupancy · Complete guest details and direct calling
          </p>
        </div>

        {/* View Mode Toggle & Navigation */}
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-between sm:justify-end">
          {/* View Mode Tabs */}
          <div className="flex items-center bg-[#FFFFFF] border border-[#E8E7F2] rounded-2xl p-1 text-xs shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode("matrix")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer",
                viewMode === "matrix"
                  ? "bg-[#5146D8] text-white shadow-sm"
                  : "text-[#77758F] hover:text-[#24213A] hover:bg-[#F7F7FC]"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Calendar Matrix</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("occupancy")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer",
                viewMode === "occupancy"
                  ? "bg-[#5146D8] text-white shadow-sm"
                  : "text-[#77758F] hover:text-[#24213A] hover:bg-[#F7F7FC]"
              )}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Occupancy at a Glance</span>
            </button>
          </div>

          {/* Matrix Date Controls */}
          {viewMode === "matrix" && (
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
          )}

          {viewMode === "matrix" && (
            <button
              onClick={() => {
                const today = startOfDay(new Date());
                setStartDate(today);
              }}
              className={cn(
                "px-3.5 py-2 rounded-2xl text-xs font-bold border transition-colors cursor-pointer",
                isCurrentWindowToday
                  ? "bg-[#F0EEFF] text-[#5146D8] border-[#E0DEF8] shadow-sm"
                  : "bg-[#FFFFFF] text-[#77758F] border-[#E8E7F2] hover:text-[#24213A] hover:bg-[#F7F7FC]"
              )}
            >
              Today
            </button>
          )}
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

      {/* ===================================================================== */}
      {/* 2. MATRIX VIEW: 14-DAY CALENDAR GRID WITH PROMINENT GUEST DETAILS     */}
      {/* ===================================================================== */}
      {viewMode === "matrix" && (
        <>
          {/* Calendar Status Legend */}
          <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 rounded-2xl bg-[#FFFFFF] border border-[#E8E7F2] text-xs text-[#77758F] shadow-sm overflow-hidden w-full max-w-full">
            <div className="flex items-center gap-x-4 sm:gap-x-6 gap-y-1.5 flex-wrap">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] shrink-0" />
                <span className="text-[#24213A] font-medium text-xs">Available</span>
                <span className="text-[#77758F] text-[10px] hidden min-[480px]:inline">
                  — Click cell to book
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#059669] shrink-0" />
                <span className="text-[#24213A] font-medium text-xs">Checked In</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#D97706] shrink-0" />
                <span className="text-[#24213A] font-medium text-xs">Confirmed</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#77758F] shrink-0" />
                <span className="text-[#24213A] font-medium text-xs">Inactive</span>
              </div>
            </div>
            <span className="text-[11px] font-bold text-[#5146D8] hidden sm:inline">
              Click any booking to view details & call guest
            </span>
          </div>

          {/* Calendar Matrix Container */}
          <div className="p-1 sm:p-2 rounded-[20px] sm:rounded-[24px] bg-[#FFFFFF] border border-[#E8E7F2] w-full max-w-full min-w-0 shadow-[0_4px_24px_rgba(36,33,58,0.03)] overflow-hidden">
            <div
              className="w-full max-w-full overflow-x-auto overscroll-x-contain hms-editor-scrollbar"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <table className="w-full text-left border-collapse table-fixed min-w-[2100px] sm:min-w-[2450px] md:min-w-[2700px]">
                <colgroup>
                  {/* Sticky room column width */}
                  <col className="w-[140px] sm:w-[190px] md:w-[220px]" />
                  {/* 14 date columns with generous width for guest card details */}
                  {dates.map((_, i) => (
                    <col
                      key={i}
                      className="w-[140px] sm:w-[160px] md:w-[175px]"
                    />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-[#E8E7F2] bg-[#F7F7FC]/80">
                    {/* Sticky Room Column Header */}
                    <th className="w-[140px] min-w-[140px] max-w-[140px] sm:w-[190px] sm:min-w-[190px] sm:max-w-[190px] md:w-[220px] md:min-w-[220px] md:max-w-[220px] px-3 sm:px-4 py-3 font-bold text-[10px] sm:text-[11px] uppercase tracking-wider text-[#77758F] sticky left-0 bg-[#FFFFFF] z-20 border-r border-[#E8E7F2] shadow-[2px_0_5px_rgba(36,33,58,0.03)]">
                      <div className="flex items-center justify-between">
                        <span>ROOM ({rooms.length})</span>
                        <BedDouble className="w-3.5 h-3.5 text-[#77758F]" />
                      </div>
                    </th>
                    {dates.map((date, idx) => {
                      const isToday =
                        format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                      return (
                        <th
                          key={idx}
                          className="w-[140px] min-w-[140px] sm:w-[160px] sm:min-w-[160px] md:w-[175px] md:min-w-[175px] px-2 py-2.5 text-center border-r border-[#E8E7F2]/50"
                        >
                          <div
                            className={cn(
                              "text-[10px] sm:text-[11px] uppercase tracking-wider font-bold",
                              isToday ? "text-[#5146D8]" : "text-[#77758F]"
                            )}
                          >
                            {format(date, "EEE")}
                          </div>
                          <div className="mt-1 flex items-center justify-center gap-1">
                            {isToday ? (
                              <div className="px-2 py-0.5 rounded-full bg-[#5146D8] text-white font-bold text-xs flex items-center justify-center shadow-sm">
                                {format(date, "d MMM")} (Today)
                              </div>
                            ) : (
                              <div className="text-xs sm:text-sm font-semibold text-[#24213A]">
                                {format(date, "d MMM")}
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
                      <td colSpan={15} className="px-6 py-20 text-center text-[#77758F]">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Loader2 className="w-7 h-7 text-[#5146D8] animate-spin" />
                          <span className="font-medium text-sm">Loading calendar availability...</span>
                        </div>
                      </td>
                    </tr>
                  ) : rooms.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="px-6 py-20 text-center text-[#77758F]">
                        No rooms configured for this property.
                      </td>
                    </tr>
                  ) : (
                    rooms.map((room, roomIdx) => (
                      <tr
                        key={room.id}
                        className={cn(
                          "group transition-colors hover:bg-[#FBFBFE]",
                          roomIdx !== rooms.length - 1 && "border-b border-[#E8E7F2]"
                        )}
                      >
                        {/* Sticky Room Info Column */}
                        <td className="w-[140px] min-w-[140px] max-w-[140px] sm:w-[190px] sm:min-w-[190px] sm:max-w-[190px] md:w-[220px] md:min-w-[220px] md:max-w-[220px] px-3 sm:px-4 py-3 sticky left-0 bg-[#FFFFFF] z-10 border-r border-[#E8E7F2] shadow-[2px_0_5px_rgba(36,33,58,0.03)] align-top">
                          <div className={cn("flex flex-col min-w-0", room.is_active === false && "opacity-60")}>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs sm:text-sm text-[#24213A] leading-snug line-clamp-2">
                                {room.name}
                              </span>
                              {room.room_number && (
                                <span className="text-[10px] font-bold text-[#5146D8] bg-[#F0EEFF] px-1.5 py-0.5 rounded-md border border-[#E0DEF8] shrink-0">
                                  #{room.room_number}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#5146D8] font-semibold mt-1 truncate">
                              ₹{room.pricePerNight.toLocaleString("en-IN")}
                              <span className="text-[#77758F] font-normal text-[10px]">/night</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-[#77758F] mt-0.5">
                              <Users className="w-3 h-3 text-[#77758F] shrink-0" />
                              <span>Max {room.maxCapacity} Guests</span>
                            </div>
                          </div>
                        </td>

                        {/* 14 Date Cells with Complete Guest & Booking Details */}
                        {dates.map((date, idx) => {
                          const booking = getBookingForRoomOnDate(room.id, date);
                          const isBooked = !!booking;
                          const isInactive = room.is_active === false;

                          if (isBooked) {
                            const effectiveGuest = getEffectiveGuest(booking);
                            const guestName = effectiveGuest.name;
                            const guestCount = booking.number_of_guests || effectiveGuest.guests.length || 1;
                            const callInfo = formatPhoneNumberForCall(effectiveGuest.phone);
                            const statusCfg = getBookingStatusBadge(booking.status);
                            const stayRange = formatSafeDateRange(booking.check_in, booking.check_out);

                            return (
                              <td
                                key={idx}
                                className="w-[140px] min-w-[140px] sm:w-[160px] sm:min-w-[160px] md:w-[175px] md:min-w-[175px] p-1.5 align-top border-r border-[#E8E7F2]/40"
                              >
                                <button
                                  type="button"
                                  onClick={() => handleCellClick(room, date)}
                                  className={cn(
                                    "w-full h-full min-h-[92px] rounded-xl sm:rounded-2xl p-2 text-left flex flex-col justify-between transition-all cursor-pointer shadow-[0_1px_3px_rgba(36,33,58,0.04)] hover:shadow-md border",
                                    statusCfg.cardBg
                                  )}
                                  title={`Booked: ${guestName} | Room ${room.room_number || room.name} | ${stayRange} | ${guestCount} Guests · ${statusCfg.label}`}
                                >
                                  {/* Top Row: Room badge + Status Badge */}
                                  <div className="flex items-center justify-between gap-1 w-full">
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-[#FFFFFF]/90 text-[#24213A] border border-[#E8E7F2] truncate max-w-[55%]">
                                      {room.room_number ? `#${room.room_number}` : room.name}
                                    </span>
                                    <span
                                      className={cn(
                                        "text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border shrink-0",
                                        statusCfg.badgeBg
                                      )}
                                    >
                                      {statusCfg.label}
                                    </span>
                                  </div>

                                  {/* Middle Row: Prominent Guest Name */}
                                  <div className="my-1 min-w-0">
                                    <div className="flex items-center gap-1">
                                      <User className="w-3 h-3 text-[#5146D8] shrink-0" />
                                      <span className="text-xs font-bold text-[#24213A] truncate leading-tight block">
                                        {guestName}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Bottom Row: Stay Dates & Guests / Call indicator */}
                                  <div className="space-y-0.5 w-full pt-1 border-t border-black/5 text-[9.5px]">
                                    <div className="flex items-center justify-between text-[#77758F] font-medium">
                                      <span className="truncate">{stayRange}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[#77758F] font-semibold">
                                      <span>
                                        {guestCount} {guestCount === 1 ? "Guest" : "Guests"}
                                      </span>
                                      {callInfo && (
                                        <span
                                          className="text-[#059669] flex items-center gap-0.5 font-bold"
                                          title={`Phone: ${callInfo.displayPhone}`}
                                        >
                                          <Phone className="w-2.5 h-2.5" />
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              </td>
                            );
                          }

                          if (isInactive) {
                            return (
                              <td
                                key={idx}
                                className="w-[140px] min-w-[140px] sm:w-[160px] sm:min-w-[160px] md:w-[175px] md:min-w-[175px] p-1.5 align-top border-r border-[#E8E7F2]/40"
                              >
                                <div
                                  title={`${room.name} is inactive and non-bookable`}
                                  className="w-full h-full min-h-[92px] rounded-xl sm:rounded-2xl p-2 text-left flex flex-col justify-between bg-[#F7F7FC] border border-[#E8E7F2] cursor-not-allowed opacity-60"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-[#77758F] shrink-0" />
                                    <span className="text-[10px] font-bold text-[#77758F] uppercase tracking-wider">
                                      Inactive
                                    </span>
                                  </div>
                                  <div className="text-center py-1">
                                    <span className="text-[10px] text-[#77758F] font-semibold">—</span>
                                  </div>
                                  <div className="text-[9px] text-[#77758F] truncate text-right">
                                    Not Bookable
                                  </div>
                                </div>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={idx}
                              className="w-[140px] min-w-[140px] sm:w-[160px] sm:min-w-[160px] md:w-[175px] md:min-w-[175px] p-1.5 align-top border-r border-[#E8E7F2]/40"
                            >
                              <button
                                type="button"
                                onClick={() => handleCellClick(room, date)}
                                title={`Available: Click to book ${room.name} on ${format(date, "d MMM")}`}
                                className="w-full h-full min-h-[92px] rounded-xl sm:rounded-2xl p-2 text-left flex flex-col justify-between transition-all cursor-pointer bg-[#FAFAFD] border border-dashed border-[#E2E0F0] hover:bg-[#ECFDF5] hover:border-[#10B981] group shadow-[0_1px_2px_rgba(36,33,58,0.02)]"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
                                  <span className="text-[10px] font-bold text-[#059669] uppercase tracking-wider">
                                    Available
                                  </span>
                                </div>
                                <div className="text-center py-1">
                                  <span className="text-[11px] font-semibold text-[#77758F] group-hover:text-[#5146D8] transition-colors">
                                    + Book
                                  </span>
                                </div>
                                <div className="text-[10px] text-[#5146D8] font-bold truncate text-right">
                                  ₹{room.pricePerNight.toLocaleString("en-IN")}
                                  <span className="text-[9px] text-[#77758F] font-normal">/nt</span>
                                </div>
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
        </>
      )}

      {/* ===================================================================== */}
      {/* 3. OCCUPANCY AT A GLANCE: ROOM-WISE GUEST IDENTIFICATION & CALLING    */}
      {/* ===================================================================== */}
      {viewMode === "occupancy" && (
        <div className="space-y-4">
          {/* Operational Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-2xl shadow-sm">
              <span className="text-[10px] font-bold uppercase text-[#77758F] block">Total Rooms</span>
              <span className="text-lg font-bold text-[#24213A]">{occupancyMetrics.total}</span>
            </div>
            <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-2xl shadow-sm">
              <span className="text-[10px] font-bold uppercase text-[#059669] block">Occupied</span>
              <span className="text-lg font-bold text-[#059669]">{occupancyMetrics.occupied}</span>
            </div>
            <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-2xl shadow-sm">
              <span className="text-[10px] font-bold uppercase text-[#5146D8] block">Vacant</span>
              <span className="text-lg font-bold text-[#5146D8]">{occupancyMetrics.vacant}</span>
            </div>
            <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-2xl shadow-sm">
              <span className="text-[10px] font-bold uppercase text-[#D97706] block">Arriving</span>
              <span className="text-lg font-bold text-[#D97706]">{occupancyMetrics.arriving}</span>
            </div>
            <div className="bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-2xl shadow-sm col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold uppercase text-[#2563EB] block">Departing</span>
              <span className="text-lg font-bold text-[#2563EB]">{occupancyMetrics.departing}</span>
            </div>
          </div>

          {/* Occupancy Filters & Date Selector */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#FFFFFF] border border-[#E8E7F2] p-3 rounded-2xl shadow-sm">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-[#77758F] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search room name, room # or guest name/phone..."
                value={occupancySearchQuery}
                onChange={(e) => setOccupancySearchQuery(e.target.value)}
                className="w-full bg-[#F7F7FC] border border-[#E8E7F2] rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#24213A] placeholder-[#77758F] outline-none focus:border-[#5146D8]"
              />
            </div>

            {/* Date Navigator */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <div className="flex items-center bg-[#F7F7FC] border border-[#E8E7F2] rounded-xl p-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const current = parseISO(occupancyDate);
                    setOccupancyDate(format(addDays(current, -1), "yyyy-MM-dd"));
                  }}
                  className="p-1 hover:text-[#5146D8] rounded-lg transition-colors cursor-pointer text-[#77758F]"
                  title="Previous Day"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <input
                  type="date"
                  value={occupancyDate}
                  onChange={(e) => setOccupancyDate(e.target.value)}
                  className="bg-transparent px-2 font-semibold text-xs text-[#24213A] outline-none cursor-pointer"
                />

                <button
                  type="button"
                  onClick={() => {
                    const current = parseISO(occupancyDate);
                    setOccupancyDate(format(addDays(current, 1), "yyyy-MM-dd"));
                  }}
                  className="p-1 hover:text-[#5146D8] rounded-lg transition-colors cursor-pointer text-[#77758F]"
                  title="Next Day"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setOccupancyDate(format(new Date(), "yyyy-MM-dd"))}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer",
                  occupancyDate === format(new Date(), "yyyy-MM-dd")
                    ? "bg-[#F0EEFF] text-[#5146D8] border-[#E0DEF8]"
                    : "bg-[#FFFFFF] text-[#77758F] border-[#E8E7F2] hover:bg-[#F7F7FC]"
                )}
              >
                Today
              </button>
            </div>
          </div>

          {/* Occupancy Table / List */}
          <div className="bg-[#FFFFFF] border border-[#E8E7F2] rounded-[24px] shadow-sm overflow-hidden">
            <div className="overflow-x-auto hms-editor-scrollbar">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="border-b border-[#E8E7F2] bg-[#F7F7FC]/70 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#77758F]">
                    <th className="px-4 py-3">Room & Details</th>
                    <th className="px-4 py-3">Current Occupant / Guest</th>
                    <th className="px-4 py-3">Stay Dates & Duration</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E7F2] text-xs">
                  {filteredOccupancyRooms.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-[#77758F]">
                        No rooms match the current search query or date.
                      </td>
                    </tr>
                  ) : (
                    filteredOccupancyRooms.map((room) => {
                      const booking = getBookingForRoomOnDate(room.id, occupancyDate);
                      const isOccupied = !!booking;
                      const effectiveGuest = getEffectiveGuest(booking);
                      const callInfo = formatPhoneNumberForCall(effectiveGuest.phone);
                      const nights = booking ? calculateStayNights(booking.check_in, booking.check_out) : 0;
                      const statusCfg = booking ? getBookingStatusBadge(booking.status) : null;

                      return (
                        <tr key={room.id} className="hover:bg-[#F9F9FD] transition-colors">
                          {/* Room Column */}
                          <td className="px-4 py-3.5 align-middle">
                            <div className="font-bold text-sm text-[#24213A] flex items-center gap-1.5">
                              <span>{room.name}</span>
                              {room.room_number && (
                                <span className="text-[10px] font-bold text-[#5146D8] bg-[#F0EEFF] px-2 py-0.5 rounded-md border border-[#E0DEF8]">
                                  #{room.room_number}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#77758F] mt-0.5">
                              Max {room.maxCapacity} Guests · ₹{room.pricePerNight.toLocaleString("en-IN")}/nt
                            </div>
                          </td>

                          {/* Guest Column with Direct Calling */}
                          <td className="px-4 py-3.5 align-middle">
                            {isOccupied && effectiveGuest ? (
                              <div className="space-y-1">
                                <div className="font-bold text-sm text-[#24213A] flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5 text-[#5146D8]" />
                                  <span>{effectiveGuest.name}</span>
                                  {effectiveGuest.guests.length > 1 && (
                                    <span className="text-[10px] font-medium text-[#77758F] bg-[#F7F7FC] px-1.5 py-0.2 rounded border border-[#E8E7F2]">
                                      +{effectiveGuest.guests.length - 1} more
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {callInfo ? (
                                    <a
                                      href={callInfo.telHref}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#ECFDF5] hover:bg-[#D1FAE5] text-[#059669] border border-[#A7F3D0] rounded-lg text-[11px] font-bold transition-colors"
                                      title={`Click to call ${effectiveGuest.name}`}
                                    >
                                      <Phone className="w-3 h-3" />
                                      <span>{callInfo.displayPhone}</span>
                                    </a>
                                  ) : (
                                    <span className="text-[11px] text-[#77758F] italic">
                                      No phone recorded
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                                <span className="font-semibold text-xs text-[#059669]">
                                  Vacant & Ready
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Stay Dates */}
                          <td className="px-4 py-3.5 align-middle">
                            {isOccupied && booking ? (
                              <div>
                                <div className="font-semibold text-xs text-[#24213A]">
                                  {formatSafeDateRange(booking.check_in, booking.check_out)}
                                </div>
                                <div className="text-[11px] text-[#77758F] mt-0.5">
                                  {nights} {nights === 1 ? "Night" : "Nights"}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-[#77758F]">—</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3.5 align-middle">
                            {isOccupied && statusCfg ? (
                              <span
                                className={cn(
                                  "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border inline-block",
                                  statusCfg.badgeBg
                                )}
                              >
                                {statusCfg.label}
                              </span>
                            ) : room.is_active === false ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#F7F7FC] border border-[#E8E7F2] text-[#77758F] inline-block">
                                Inactive
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#ECFDF5] border border-[#A7F3D0] text-[#059669] inline-block">
                                Available
                              </span>
                            )}
                          </td>

                          {/* Amount */}
                          <td className="px-4 py-3.5 align-middle">
                            {isOccupied && booking ? (
                              <span className="font-bold text-xs text-[#5146D8]">
                                ₹{Number(booking.total_amount || 0).toLocaleString("en-IN")}
                              </span>
                            ) : (
                              <span className="text-[11px] text-[#77758F]">
                                ₹{room.pricePerNight.toLocaleString("en-IN")}/nt
                              </span>
                            )}
                          </td>

                          {/* Quick Actions */}
                          <td className="px-4 py-3.5 align-middle text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isOccupied && booking ? (
                                <>
                                  {callInfo && (
                                    <a
                                      href={callInfo.telHref}
                                      className="p-1.5 bg-[#059669] hover:bg-[#047857] text-white rounded-lg transition-colors shadow-sm"
                                      title={`Call ${effectiveGuest.name} (${callInfo.displayPhone})`}
                                    >
                                      <Phone className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleCellClick(room, parseISO(occupancyDate))}
                                    className="px-2.5 py-1.5 bg-[#F0EEFF] hover:bg-[#E0DEF8] text-[#5146D8] border border-[#E0DEF8] rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                                    title="View Guest & Booking Details"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Details</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenFolioForBooking(booking, room)}
                                    className="px-2.5 py-1.5 bg-[#FFFFFF] hover:bg-[#F7F7FC] text-[#24213A] border border-[#E8E7F2] rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                                    title="Open Guest Folio & Billing"
                                  >
                                    <Receipt className="w-3.5 h-3.5 text-[#5146D8]" />
                                    <span>Folio</span>
                                  </button>
                                </>
                              ) : room.is_active !== false ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedBookingDate(occupancyDate);
                                    setBookingRoom(room);
                                  }}
                                  className="px-3 py-1.5 bg-[#ECFDF5] hover:bg-[#D1FAE5] text-[#059669] border border-[#A7F3D0] rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Book Room</span>
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 4. MODALS & OVERLAYS                                                  */}
      {/* ===================================================================== */}

      {/* Booking Modal (Create New Booking) */}
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

      {/* View Details Modal (Complete Details, Call Guest, Stay History, Folio) */}
      {viewingRoom && (
        <ViewDetailsModal
          room={viewingRoom}
          isOpen={!!viewingRoom}
          onClose={() => {
            setViewingRoom(null);
            fetchCalendarBookings();
          }}
        />
      )}

      {/* Direct Folio / Invoice Modal from Occupancy List */}
      {folioBooking && isFolioModalOpen && (
        <InvoiceEditorModal
          isOpen={isFolioModalOpen}
          onClose={() => {
            setIsFolioModalOpen(false);
            setFolioBooking(null);
            setFolioInvoice(null);
          }}
          existingInvoice={folioInvoice}
          initialTab="items"
          booking={{
            id: folioBooking.id,
            room_id: folioBooking.room_id,
            partner_id: folioBooking.partner_id || "",
            homestay_id: folioBooking.homestay_id || selectedHomestayId || "",
            check_in: folioBooking.check_in,
            check_out: folioBooking.check_out,
            status: folioBooking.status,
            number_of_guests: folioBooking.number_of_guests || 1,
            nightly_rate: folioBooking.nightly_rate,
            total_amount: folioBooking.total_amount,
            notes: folioBooking.notes || null,
            created_at: folioBooking.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            rooms: {
              id: folioBooking.room_id,
              room_number: folioBooking.rooms?.room_number || "",
              name: folioBooking.rooms?.name || "Room",
              nightly_rate: folioBooking.nightly_rate,
            } as any,
            guests: (folioBooking.guests || []).map((g, idx) => ({
              id: g.id || `guest-${idx}`,
              booking_id: folioBooking.id,
              name: g.name,
              phone: g.phone || null,
              email: g.email || null,
              is_primary: g.is_primary,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })),
          }}
          onSaved={(_id, _inv, shouldClose = true) => {
            if (shouldClose) {
              setIsFolioModalOpen(false);
              setFolioBooking(null);
              setFolioInvoice(null);
            }
            fetchCalendarBookings();
          }}
        />
      )}
    </div>
  );
}
