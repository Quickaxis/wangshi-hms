"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { prototypeRooms, UI_Room, roomImageMap, defaultRoomImage } from "@/data/rooms";
import { BookingStatus, BookingGuest, CurrentBookingDetails, Partner, Homestay } from "@/lib/types";
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
import { usePathname } from "next/navigation";

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
  userProfile: Partner | null;
  selectedHomestayId: string | null;
  setSelectedHomestayId: (id: string | null) => void;
  homestays: Homestay[];
}

const HMSContext = createContext<HMSContextType | undefined>(undefined);

export function HMSProvider({
  children,
  initialRooms = [],
}: {
  children: React.ReactNode;
  initialRooms?: UI_Room[];
}) {
  const [rooms, setRooms] = useState<UI_Room[]>(initialRooms);
  const [selectedDate, setSelectedDate] = useState<string>(() => getISTDateString());
  const [currentISTDate, setCurrentISTDate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<Partner | null>(null);
  const [selectedHomestayId, setSelectedHomestayId] = useState<string | null>(null);
  const [homestays, setHomestays] = useState<Homestay[]>([]);
  const pathname = usePathname();

  // Stable Supabase client instance
  const supabase = useMemo(() => createClient(), []);

  const loadProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: partner } = await supabase
          .from("partners")
          .select("*")
          .eq("auth_user_id", user.id)
          .single();
        if (partner) {
          setUserProfile(partner as Partner);
          // Auto-select homestay for normal partners, or default to Wangshi for testing if not set
          if (partner.role !== 'super_admin' && partner.homestay_id) {
            setSelectedHomestayId(partner.homestay_id);
            // Fetch the specific homestay for the partner so TopBar and Sidebar have the correct context
            const { data: homestayData } = await supabase.from("homestays").select("*").eq("id", partner.homestay_id).single();
            if (homestayData) {
              setHomestays([homestayData as Homestay]);
            }
          } else if (partner.role === 'super_admin') {
            // Fetch homestays for super admin
            const { data: homestaysData } = await supabase.from("homestays").select("*").order("name");
            if (homestaysData) {
              setHomestays(homestaysData as Homestay[]);
              // Initialize selectedHomestayId only if not yet set and we have homestays available.
              // Note: Using a functional state update here is risky if we depend on it immediately in loadData, 
              // but loadData will run on next render if we add it correctly.
              setSelectedHomestayId((prev: string | null) => prev ? prev : (homestaysData[0]?.id || null));
            }
          }
        }
      } else {
        setUserProfile(null);
      }
    } catch (err) {
      console.error("Failed to load user profile:", err);
    }
  }, [supabase]);

  const loadData = useCallback(async () => {
    // If we don't have the user profile yet, we cannot correctly filter data via RLS or client logic.
    // Wait for it, or skip. But we actually rely on RLS anyway.
    try {
      // 1. Fetch rooms from database
      let roomsQuery = supabase.from("rooms").select("*").order("room_number", { ascending: true });
      
      // If super admin and a homestay is selected, filter rooms. Normal partners are filtered by RLS.
      if (userProfile?.role === 'super_admin' && selectedHomestayId) {
         roomsQuery = roomsQuery.eq("homestay_id", selectedHomestayId);
      }

      const { data: dbRooms, error: roomsError } = await roomsQuery;

      if (roomsError) {
        console.warn("Could not fetch rooms from database:", roomsError.message);
        return;
      }

      const activeRoomsList = dbRooms || [];

      // 2. Fetch active bookings overlapping selectedDate
      let bookingsQuery = supabase
        .from("bookings")
        .select(`
          id,
          room_id,
          partner_id,
          homestay_id,
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

      // If super admin and a homestay is selected, filter bookings. Normal partners are filtered by RLS.
      if (userProfile?.role === 'super_admin' && selectedHomestayId) {
        bookingsQuery = bookingsQuery.eq("homestay_id", selectedHomestayId);
      }

      const { data: activeBookings, error: bookingsError } = await bookingsQuery;

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
  }, [supabase, selectedDate, initialRooms, userProfile?.role, selectedHomestayId]);

  // Use a ref for loadData to use in realtime callbacks without recreating channels
  const loadDataRef = React.useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Refetch data when selected date, homestay, or user profile changes
  useEffect(() => {
    if (userProfile !== null) { // Only fetch if we have determined auth state
      loadDataRef.current();
    }
  }, [selectedDate, selectedHomestayId, userProfile?.id, userProfile?.role]);

  // Auto-sync selected homestay from admin route for super admins
  useEffect(() => {
    if (userProfile?.role === 'super_admin' && pathname) {
      const match = pathname.match(/^\/admin\/homestays\/([^\/]+)/);
      if (match && match[1] && match[1] !== 'new') {
        setSelectedHomestayId(match[1]);
      }
    }
  }, [pathname, userProfile?.role]);

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
    // Only set up realtime subscriptions after the profile is loaded
    if (!userProfile) return;

    // Channel for live booking and room status updates
    const channel = supabase
      .channel("hms-realtime-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => {
          loadDataRef.current();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "guests" },
        () => {
          loadDataRef.current();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms" },
        () => {
          loadDataRef.current();
        }
      )
      .subscribe();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadProfile().then(() => loadDataRef.current());
    });

    return () => {
      supabase.removeChannel(channel);
      subscription.unsubscribe();
    };
  }, [supabase, loadProfile, userProfile?.role]); // Only re-subscribe if role changes

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
        userProfile,
        selectedHomestayId,
        setSelectedHomestayId,
        homestays,
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
