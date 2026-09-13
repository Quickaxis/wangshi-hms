"use server";

import { createClient } from "@/lib/supabase/server";
import { BookingStatus } from "@/lib/types";

export interface CreateBookingInput {
  roomId: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  numberOfGuests: number;
  guests: {
    name: string;
    isPrimary?: boolean;
    phone?: string;
    email?: string;
  }[];
  guestPhone?: string;
  notes?: string;
}

export interface BookingActionResult {
  success: boolean;
  bookingId?: string;
  error?: string;
}

/**
 * Server Action to securely create a booking.
 * Validates partner session, room capacity, calculates pricing server-side,
 * and handles race conditions via PostgreSQL overlap check & exclusion constraint.
 */
export async function createBookingAction(input: CreateBookingInput): Promise<BookingActionResult> {
  try {
    const supabase = await createClient();

    // 1. Authenticate user & verify active partner
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "You must be logged in to create a booking." };
    }

    const { data: partner, error: partnerError } = await supabase
      .from("partners")
      .select("id, name, is_active")
      .eq("email", user.email)
      .single();

    if (partnerError || !partner || !partner.is_active) {
      return { success: false, error: "Your account is not authorized to create bookings." };
    }

    // 2. Validate dates
    if (!input.checkIn || !input.checkOut) {
      return { success: false, error: "Check-in and check-out dates are required." };
    }

    // Handle potential DD-MM-YYYY format from the UI
    const parseDate = (dateStr: string) => {
      if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split('-');
        return `${year}-${month}-${day}`;
      }
      return dateStr;
    };

    const formattedCheckIn = parseDate(input.checkIn);
    const formattedCheckOut = parseDate(input.checkOut);

    const checkInDate = new Date(formattedCheckIn);
    const checkOutDate = new Date(formattedCheckOut);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      return { success: false, error: "Invalid date format provided." };
    }

    if (checkOutDate <= checkInDate) {
      return { success: false, error: "Check-out date must be strictly after check-in date." };
    }

    // 3. Validate guests
    if (!input.guests || input.guests.length === 0) {
      return { success: false, error: "At least one guest is required." };
    }

    const guestCount = input.numberOfGuests || input.guests.length;

    console.log("--- BOOKING DEBUG LOG ---");
    console.log("Received Room ID:", input.roomId);
    console.log("Received Check-in:", input.checkIn);
    console.log("Received Check-out:", input.checkOut);
    console.log("Authenticated Partner ID:", partner.id);
    console.log("-------------------------");

    // 4. Fetch room from database
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, name, nightly_rate, max_guests")
      .eq("id", input.roomId)
      .single();

    if (roomError || !room) {
      return { success: false, error: "Room not found." };
    }

    if (guestCount > room.max_guests) {
      return {
        success: false,
        error: `Number of guests (${guestCount}) exceeds the maximum capacity of ${room.name} (${room.max_guests}).`,
      };
    }

    // 5. Pre-check for overlapping active bookings (excluding cancelled)
    const { data: conflicts, error: conflictError } = await supabase
      .from("bookings")
      .select("id")
      .eq("room_id", input.roomId)
      .neq("status", "cancelled")
      .lt("check_in", input.checkOut)
      .gt("check_out", input.checkIn);

    if (conflictError) {
      console.error("Conflict query error:", conflictError);
    } else if (conflicts && conflicts.length > 0) {
      return {
        success: false,
        error: "This room is already booked for the selected dates. Please choose another date or room.",
      };
    }

    // 6 & 7. Call the secure RPC function to create the booking atomically
    const { data: bookingId, error: rpcError } = await supabase.rpc("create_booking_atomic", {
      p_room_id: input.roomId,
      p_partner_id: partner.id,
      p_check_in: formattedCheckIn,
      p_check_out: formattedCheckOut,
      p_number_of_guests: guestCount,
      p_notes: input.notes?.trim() || null,
    });

    if (rpcError) {
      console.error("Booking RPC Error Details:", {
        message: rpcError.message,
        code: rpcError.code,
        details: rpcError.details,
        hint: rpcError.hint,
      });

      const errMessage = rpcError.message || "";
      if (errMessage.includes("ROOM_UNAVAILABLE")) {
        return { success: false, error: "This room is already booked for these dates." };
      }
      if (errMessage.includes("CHECK_OUT_INVALID")) {
        return { success: false, error: "Booking dates are invalid." };
      }
      if (errMessage.includes("CAPACITY_EXCEEDED")) {
        return { success: false, error: "Number of guests exceeds room capacity." };
      }
      // Handle Postgres RLS/policy violations explicitly
      if (rpcError.code === '42501' || errMessage.toLowerCase().includes('policy')) {
        return { success: false, error: "You are not authorized to create this booking." };
      }
      
      const detailedError = `RPC Error: ${rpcError.code} - ${rpcError.message} | Details: ${rpcError.details} | Hint: ${rpcError.hint}`;
      console.error("FINAL RPC ERROR RETURNED:", detailedError);
      return { success: false, error: detailedError };
    }

    // 8. Insert guests
    const guestsToInsert = input.guests.map((guest, idx) => ({
      booking_id: bookingId,
      name: guest.name.trim(),
      phone: (idx === 0 && input.guestPhone) ? input.guestPhone.trim() : (guest.phone || null),
      email: guest.email?.trim() || null,
      is_primary: idx === 0 || !!guest.isPrimary,
    }));

    const { error: guestError } = await supabase
      .from("guests")
      .insert(guestsToInsert);

    if (guestError) {
      console.error("Guest insertion error details:", {
        message: guestError.message,
        code: guestError.code,
        details: guestError.details,
        hint: guestError.hint,
      });
      // The booking was already created via RPC, but the guests failed. 
      // This is a partial failure state.
      return { success: false, error: `Guest creation failed: ${guestError.message || 'Unknown error'}` };
    }

    return { success: true, bookingId: bookingId };
  } catch (err: any) {
    console.error("createBookingAction exception:", err);
    return { success: false, error: err?.message || "An unexpected error occurred." };
  }
}

/**
 * Server Action to update booking status ('confirmed' | 'checked_in' | 'checked_out' | 'cancelled').
 */
export async function updateBookingStatusAction(
  bookingId: string,
  status: BookingStatus
): Promise<BookingActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "You must be logged in to update a booking." };
    }

    const { data: partner } = await supabase
      .from("partners")
      .select("id, is_active")
      .eq("email", user.email)
      .single();

    if (!partner || !partner.is_active) {
      return { success: false, error: "Unauthorized." };
    }

    const updatePayload: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("bookings")
      .update(updatePayload)
      .eq("id", bookingId);

    if (updateError) {
      console.error("Update booking error:", updateError);
      return { success: false, error: "Failed to update booking status." };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "An unexpected error occurred." };
  }
}

/**
 * Server Action to cancel a booking.
 */
export async function cancelBookingAction(bookingId: string): Promise<BookingActionResult> {
  return updateBookingStatusAction(bookingId, "cancelled");
}
