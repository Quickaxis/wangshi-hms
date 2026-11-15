"use server";

import { createClient } from "@/lib/supabase/server";
import { BookingStatus } from "@/lib/types";
import { getOrCreateBookingFolioAction } from "@/app/actions/invoices";

export interface CreateBookingInput {
  roomId?: string; // Single room ID (backward compatibility)
  roomIds?: string[]; // Multiple room IDs for group booking
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
  groupId?: string;
  bookingIds?: string[];
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
      .select("id, name, is_active, role, homestay_id")
      .eq("email", user.email)
      .single();

    if (partnerError || !partner || !partner.is_active) {
      return { success: false, error: "Your account is not authorized to create bookings." };
    }

    // 2. Resolve target rooms (single or multiple)
    const targetRoomIds = input.roomIds && input.roomIds.length > 0 
      ? input.roomIds 
      : (input.roomId ? [input.roomId] : []);

    if (targetRoomIds.length === 0) {
      return { success: false, error: "Please select at least one room to book." };
    }

    // Check for duplicate room selections
    const uniqueRoomIds = Array.from(new Set(targetRoomIds));
    if (uniqueRoomIds.length !== targetRoomIds.length) {
      return { success: false, error: "The same room cannot be selected multiple times in a booking." };
    }

    // 3. Validate dates
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

    // 4. Validate guests
    if (!input.guests || input.guests.length === 0) {
      return { success: false, error: "At least one guest is required." };
    }

    const guestCount = input.numberOfGuests || input.guests.length;

    // 5. Fetch and validate all rooms from database
    const { data: rooms, error: roomsError } = await supabase
      .from("rooms")
      .select("id, name, nightly_rate, max_guests, is_active, homestay_id")
      .in("id", targetRoomIds);

    if (roomsError || !rooms || rooms.length !== targetRoomIds.length) {
      return { success: false, error: "One or more selected rooms could not be found." };
    }

    const inactiveRoom = rooms.find((r) => r.is_active === false);
    if (inactiveRoom) {
      return { success: false, error: `Room "${inactiveRoom.name}" is currently inactive and cannot be booked.` };
    }

    const homestayId = rooms[0].homestay_id;
    if (rooms.some((r) => r.homestay_id !== homestayId)) {
      return { success: false, error: "All selected rooms must belong to the same homestay." };
    }

    if (partner.role !== 'super_admin' && partner.homestay_id !== homestayId) {
      return { success: false, error: "You are not authorized to book rooms in this homestay." };
    }

    const combinedCapacity = rooms.reduce((sum, r) => sum + (r.max_guests || 2), 0);
    if (guestCount > combinedCapacity) {
      return {
        success: false,
        error: `Number of guests (${guestCount}) exceeds combined capacity of selected rooms (${combinedCapacity}).`,
      };
    }

    // 6. Pre-check for overlapping active bookings for all selected rooms
    const { data: conflicts, error: conflictError } = await supabase
      .from("bookings")
      .select("id, room_id, rooms(name)")
      .in("room_id", targetRoomIds)
      .neq("status", "cancelled")
      .lt("check_in", formattedCheckOut)
      .gt("check_out", formattedCheckIn);

    if (conflictError) {
      console.error("Conflict query error:", conflictError);
    } else if (conflicts && conflicts.length > 0) {
      const conflictedNames = Array.from(new Set(conflicts.map((c: any) => c.rooms?.name || "A selected room"))).join(", ");
      return {
        success: false,
        error: `Room ${conflictedNames} is already booked for the selected dates. Please adjust dates or room selection.`,
      };
    }

    const guestsPayload = input.guests.map((g, idx) => ({
      name: g.name.trim(),
      phone: (idx === 0 && input.guestPhone) ? input.guestPhone.trim() : (g.phone || null),
      email: g.email?.trim() || null,
      is_primary: idx === 0 || !!g.isPrimary
    }));

    // 7. Atomic group booking RPC (handles 1 or more rooms with atomic locking and GiST constraints)
    const { data: groupRes, error: groupRpcError } = await supabase.rpc("create_group_booking_atomic", {
      p_room_ids: targetRoomIds,
      p_partner_id: partner.id,
      p_check_in: formattedCheckIn,
      p_check_out: formattedCheckOut,
      p_number_of_guests: guestCount,
      p_notes: input.notes?.trim() || null,
      p_guests: guestsPayload
    });

    if (!groupRpcError && groupRes) {
      const createdBookingId = groupRes.lead_booking_id;
      // Automatically initialize Live Guest Folio
      try {
        await getOrCreateBookingFolioAction(createdBookingId);
      } catch (folioErr) {
        console.warn("[HMS Bookings] Folio auto-initialization error:", folioErr);
      }

      return { 
        success: true, 
        bookingId: createdBookingId, 
        groupId: groupRes.group_id, 
        bookingIds: groupRes.booking_ids 
      };
    }

    // Fallback: If single room and group RPC is pending migration, fallback to create_booking_atomic
    if (targetRoomIds.length === 1 && groupRpcError && (groupRpcError.code === 'PGRST202' || groupRpcError.code === '42883')) {
      const { data: singleBookingId, error: singleRpcErr } = await supabase.rpc("create_booking_atomic", {
        p_room_id: targetRoomIds[0],
        p_partner_id: partner.id,
        p_check_in: formattedCheckIn,
        p_check_out: formattedCheckOut,
        p_number_of_guests: guestCount,
        p_notes: input.notes?.trim() || null,
        p_guests: guestsPayload
      });

      if (!singleRpcErr && singleBookingId) {
        try {
          await getOrCreateBookingFolioAction(singleBookingId);
        } catch (folioErr) {
          console.warn("[HMS Bookings] Single folio auto-initialization error:", folioErr);
        }
        return { success: true, bookingId: singleBookingId };
      }
      return { success: false, error: singleRpcErr?.message || "Failed to create booking." };
    }

    if (groupRpcError) {
      console.error("Booking RPC Error Details:", {
        message: groupRpcError.message,
        code: groupRpcError.code,
        details: groupRpcError.details,
        hint: groupRpcError.hint,
      });

      const errMessage = groupRpcError.message || "";
      if (groupRpcError.code === 'PGRST202' || groupRpcError.code === '42883') {
        return { 
          success: false, 
          error: "The multi-room group booking database migration (scripts/migration_group_bookings.sql) has not been applied to this database yet. Please apply the migration in Supabase SQL Editor." 
        };
      }
      if (errMessage.includes("ROOM_UNAVAILABLE")) {
        return { success: false, error: errMessage.replace("ROOM_UNAVAILABLE: ", "") };
      }
      if (errMessage.includes("CHECK_OUT_INVALID")) {
        return { success: false, error: "Booking dates are invalid." };
      }
      if (errMessage.includes("CAPACITY_EXCEEDED")) {
        return { success: false, error: "Number of guests exceeds room capacity." };
      }
      if (groupRpcError.code === '42501' || errMessage.toLowerCase().includes('policy')) {
        return { success: false, error: "You are not authorized to create this booking." };
      }

      return { success: false, error: errMessage || "Failed to create group booking." };
    }

    return { success: true };
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

/**
 * Server Action to cancel an entire group booking safely.
 * Cancels all active rooms (confirmed or checked_in) while preserving checked_out rooms.
 */
export async function cancelGroupBookingAction(groupId: string): Promise<BookingActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "You must be logged in to cancel a group booking." };
    }

    const { data: partner } = await supabase
      .from("partners")
      .select("id, is_active, role, homestay_id")
      .eq("email", user.email)
      .single();

    if (!partner || !partner.is_active) {
      return { success: false, error: "Unauthorized." };
    }

    const { data: groupBookings, error: fetchErr } = await supabase
      .from("bookings")
      .select("id, homestay_id, status")
      .eq("group_id", groupId);

    if (fetchErr || !groupBookings || groupBookings.length === 0) {
      return { success: false, error: "Group booking not found." };
    }

    if (partner.role !== 'super_admin' && partner.homestay_id !== groupBookings[0].homestay_id) {
      return { success: false, error: "Unauthorized access to this homestay's bookings." };
    }

    const cancelableIds = groupBookings
      .filter((b) => b.status === 'confirmed' || b.status === 'checked_in')
      .map((b) => b.id);

    if (cancelableIds.length > 0) {
      const { error: updateError } = await supabase
        .from("bookings")
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .in("id", cancelableIds);

      if (updateError) {
        return { success: false, error: `Failed to cancel group rooms: ${updateError.message}` };
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "An unexpected error occurred." };
  }
}

/**
 * Server Action to batch update status of eligible rooms in a group booking.
 */
export async function updateGroupBookingStatusAction(
  groupId: string,
  targetStatus: BookingStatus
): Promise<BookingActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "You must be logged in." };
    }

    const { data: partner } = await supabase
      .from("partners")
      .select("id, is_active, role, homestay_id")
      .eq("email", user.email)
      .single();

    if (!partner || !partner.is_active) {
      return { success: false, error: "Unauthorized." };
    }

    const { data: groupBookings, error: fetchErr } = await supabase
      .from("bookings")
      .select("id, homestay_id, status")
      .eq("group_id", groupId);

    if (fetchErr || !groupBookings || groupBookings.length === 0) {
      return { success: false, error: "Group booking not found." };
    }

    if (partner.role !== 'super_admin' && partner.homestay_id !== groupBookings[0].homestay_id) {
      return { success: false, error: "Unauthorized." };
    }

    let eligibleIds: string[] = [];
    if (targetStatus === 'checked_in') {
      eligibleIds = groupBookings.filter((b) => b.status === 'confirmed').map((b) => b.id);
    } else if (targetStatus === 'checked_out') {
      eligibleIds = groupBookings.filter((b) => b.status === 'checked_in').map((b) => b.id);
    } else if (targetStatus === 'cancelled') {
      eligibleIds = groupBookings.filter((b) => b.status !== 'checked_out' && b.status !== 'cancelled').map((b) => b.id);
    }

    if (eligibleIds.length > 0) {
      const { error: updateError } = await supabase
        .from("bookings")
        .update({ status: targetStatus, updated_at: new Date().toISOString() })
        .in("id", eligibleIds);

      if (updateError) {
        return { success: false, error: `Failed to update rooms: ${updateError.message}` };
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "An unexpected error occurred." };
  }
}
