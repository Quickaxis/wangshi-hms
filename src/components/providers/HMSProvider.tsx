"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { prototypeRooms, UI_Room, roomImageMap, defaultRoomImage } from "@/data/rooms";
import { BookingStatus, BookingGuest, CurrentBookingDetails } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import {
  createBookingAction,
  updateBookingStatusAction,
  cancelBookingAction,
  CreateBookingInput,
  BookingActionResult,
} from "@/app/actions/bookings";
import { format } from "date-fns";
import { getISTDateString, getCurrentISTDate } from "@/lib/dateUtils";

interface HMSContextType {
  rooms: UI_Room[];
  selectedDate: string; // YYYY-MM-DD
  setSelectedDate: (date: string) => void;
  isLoading: boolean;
  refreshData: () => Promise<void>;
  createBooking: (input: CreateBookingInput) => Promise<BookingActionResult>;
  updateBookingStatus: (bookingId: string, status: BookingStatus) => Promise<BookingActionResult>;
  cancelBooking: (bookingId: string) => Promise<BookingActionResult>;
  currentISTDate: Date | null;
}

const HMSContext = createContext<HMSContextType | undefined>(undefined);

export function HMSProvider({
  children,
  initialRooms = prototypeRooms,
}: {
  children: React.ReactNode;
  initialRooms?: UI_Room[];
}) {
  const [rooms, setRooms] = useState<UI_Room[]>(initialRooms);
  const [selectedDate, setSelectedDate] = useState<string>(() => getISTDateString());
  const [currentISTDate, setCurrentISTDate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Stable Supabase client instance
  const supabase = useMemo(() => createClient(), []);

  const loadData = useCallback(async () => {
    try {
      // 1. Fetch rooms from database
      const { data: dbRooms, error: roomsError } = await supabase
        .from("rooms")
        .select("*")
        .order("room_number", { ascending: true });

      if (roomsError) {
        console.warn("Could not fetch rooms from database, falling back to local:", roomsError.message);
        return;
      }

      const activeRoomsList = (dbRooms && dbRooms.length > 0) ? dbRooms : initialRooms;

      // 2. Fetch active bookings overlapping selectedDate
      // An active booking covers selectedDate if:
      // status != 'cancelled' AND check_in <= selectedDate AND check_out > selectedDate
      const { data: activeBookings, error: bookingsError } = await supabase
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
        .lte("check_in", selectedDate)
        .gt("check_out", selectedDate);

      if (bookingsError) {
        console.warn("Could not fetch active bookings:", bookingsError.message);
      }

      // Map bookings by room_id
      const bookingByRoomId = new Map<string, any>();
      if (activeBookings) {
        for (const b of activeBookings) {
          bookingByRoomId.set(b.room_id, b);
        }
      }

      // 3. Compute dynamic room statuses
      const computedRooms: UI_Room[] = activeRoomsList.map((r: any) => {
        const matchingBooking = bookingByRoomId.get(r.id);
        const roomNumber = r.room_number || r.id.replace("room-", "");
        const image = roomImageMap[roomNumber] || defaultRoomImage;

        let currentBooking: CurrentBookingDetails | undefined = undefined;

        if (matchingBooking) {
          const rawGuests = matchingBooking.guests || [];
          const guestsList: BookingGuest[] = rawGuests.map((g: any) => ({
            id: g.id,
            name: g.name,
            phone: g.phone,
            email: g.email,
            isPrimary: !!g.is_primary,
          }));

          const primaryGuest = rawGuests.find((g: any) => g.is_primary) || rawGuests[0];

          currentBooking = {
            id: matchingBooking.id,
            guests: guestsList,
            guestPhone: primaryGuest?.phone || undefined,
            checkIn: matchingBooking.check_in,
            checkOut: matchingBooking.check_out,
            createdAt: matchingBooking.created_at,
            bookedBy: matchingBooking.partners?.name || "Partner",
            partnerId: matchingBooking.partner_id,
            bookingAmount: matchingBooking.total_amount,
            status: matchingBooking.status as BookingStatus,
            notes: matchingBooking.notes || undefined,
          };
        }

        return {
          id: r.id,
          room_number: roomNumber,
          name: r.name,
          description: r.description,
          bathroomInfo: r.bathroom_type || r.bathroomInfo || "Attached toilet & bathroom",
          bathroom_type: r.bathroom_type || r.bathroomInfo,
          maxCapacity: r.max_guests || r.maxCapacity || 3,
          max_guests: r.max_guests || r.maxCapacity || 3,
          pricePerNight: r.nightly_rate || r.pricePerNight || 2500,
          nightly_rate: r.nightly_rate || r.pricePerNight || 2500,
          breakfastInfo: r.breakfast_details || r.breakfastInfo || "Complimentary breakfast included",
          breakfast_included: r.breakfast_included ?? true,
          breakfast_details: r.breakfast_details || r.breakfastInfo,
          status: matchingBooking ? "booked" : "available",
          imageUrl: image,
          currentBooking,
        };
      });

      setRooms(computedRooms);
    } catch (err) {
      console.error("Failed to load HMS data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, selectedDate, initialRooms]);

  // Initial load and reload on selectedDate change
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Setup the global Ticking IST clock (updates once per minute)
  useEffect(() => {
    setCurrentISTDate(getCurrentISTDate()); // Initialize on mount to prevent hydration mismatch
    
    const interval = setInterval(() => {
      setCurrentISTDate(getCurrentISTDate());
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  // Realtime subscription setup
  useEffect(() => {
    // Channel for live booking and room status updates
    const channel = supabase
      .channel("hms-realtime-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => {
          loadData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "guests" },
        () => {
          loadData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms" },
        () => {
          loadData();
        }
      )
      .subscribe();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadData();
    });

    return () => {
      supabase.removeChannel(channel);
      subscription.unsubscribe();
    };
  }, [supabase, loadData]);

  // Actions wrapped with local refresh
  const createBooking = async (input: CreateBookingInput): Promise<BookingActionResult> => {
    const result = await createBookingAction(input);
    if (result.success) {
      await loadData();
    }
    return result;
  };

  const updateBookingStatus = async (
    bookingId: string,
    status: BookingStatus
  ): Promise<BookingActionResult> => {
    const result = await updateBookingStatusAction(bookingId, status);
    if (result.success) {
      await loadData();
    }
    return result;
  };

  const cancelBooking = async (bookingId: string): Promise<BookingActionResult> => {
    const result = await cancelBookingAction(bookingId);
    if (result.success) {
      await loadData();
    }
    return result;
  };

  return (
    <HMSContext.Provider
      value={{
        rooms,
        selectedDate,
        setSelectedDate,
        isLoading,
        refreshData: loadData,
        createBooking,
        updateBookingStatus,
        cancelBooking,
        currentISTDate,
      }}
    >
      {children}
    </HMSContext.Provider>
  );
}

export function useHMSContext() {
  const context = useContext(HMSContext);
  if (context === undefined) {
    throw new Error("useHMSContext must be used within an HMSProvider");
  }
  return context;
}
