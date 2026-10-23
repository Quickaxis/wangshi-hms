"use server";

import { createClient } from "@/lib/supabase/server";
import { createBookingAction } from "@/app/actions/bookings";
import { DbBookingRequest } from "@/lib/types";

export interface BookingRequestActionResult {
  success: boolean;
  data?: DbBookingRequest[];
  error?: string;
}

/**
 * Fetch pending and historical booking requests for the active homestay.
 * Enforces tenant isolation: partners only see requests for their assigned homestay.
 */
export async function getBookingRequestsAction(homestayId?: string): Promise<BookingRequestActionResult> {
  try {
    const supabase = await createClient();

    // 1. Authenticate user & verify partner record
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "You must be logged in to view booking requests." };
    }

    const { data: partner, error: partnerError } = await supabase
      .from("partners")
      .select("id, role, homestay_id, is_active")
      .eq("email", user.email)
      .single();

    if (partnerError || !partner || !partner.is_active) {
      return { success: false, error: "Unauthorized access." };
    }

    // Determine target homestay
    const targetHomestayId = partner.role === 'super_admin' 
      ? (homestayId || partner.homestay_id) 
      : partner.homestay_id;

    if (!targetHomestayId && partner.role !== 'super_admin') {
      return { success: false, error: "No homestay assigned to your partner account." };
    }

    let query = supabase
      .from("booking_requests")
      .select(`
        id,
        homestay_id,
        room_id,
        booking_id,
        check_in,
        check_out,
        number_of_guests,
        guest_name,
        guest_phone,
        guest_email,
        notes,
        estimated_total,
        payment_method,
        status,
        created_at,
        updated_at,
        rooms ( id, room_number, name, nightly_rate )
      `)
      .order("created_at", { ascending: false });

    if (targetHomestayId) {
      query = query.eq("homestay_id", targetHomestayId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[HMS] Error querying booking_requests:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: (data || []) as unknown as DbBookingRequest[] };
  } catch (err: unknown) {
    console.error("[HMS] Exception in getBookingRequestsAction:", err);
    return { success: false, error: err instanceof Error ? err.message : "Internal server error." };
  }
}

/**
 * Approve a website booking request.
 * Converts the pending request into an official confirmed booking in the HMS
 * using the existing atomic booking action, and marks the request 'approved'.
 * 
 * STRICT, IDEMPOTENT & RECOVERABLE CONCURRENCY DEFENSE:
 * 1. If request is already marked 'approved', immediately returns success with its bookingId.
 * 2. If request.booking_id is already set (interrupted previous attempt), verifies the booking exists
 *    in bookings, finalizes request status to 'approved', and returns success without duplicating.
 * 3. If request.booking_id was not yet saved, queries bookings for the exact homestay, room, and dates,
 *    and verifies the strict, unambiguous request tag "[REF_REQUEST_UUID:<requestId>]" via literal match
 *    (preventing broad wildcard/ILIKE false matches while fully preserving customer notes).
 * 4. Otherwise, validates room, checks availability, creates the booking via createBookingAction,
 *    and updates request status with optimistic concurrency check and automatic retry backoff.
 */
export async function approveBookingRequestAction(
  requestId: string,
  overrideRoomId?: string
): Promise<{ success: boolean; bookingId?: string; error?: string }> {
  try {
    const supabase = await createClient();

    // 1. Authenticate user & partner
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "You must be logged in to approve requests." };
    }

    const { data: partner } = await supabase
      .from("partners")
      .select("id, role, homestay_id, is_active")
      .eq("email", user.email)
      .single();

    if (!partner || !partner.is_active) {
      return { success: false, error: "Unauthorized." };
    }

    // 2. Fetch the target booking request
    const { data: request, error: reqError } = await supabase
      .from("booking_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (reqError || !request) {
      return { success: false, error: "Booking request not found." };
    }

    // Verify tenant authorization
    if (partner.role !== 'super_admin' && partner.homestay_id !== request.homestay_id) {
      return { success: false, error: "You are not authorized to manage requests for this homestay." };
    }

    // Idempotent check: already approved
    if (request.status === 'approved') {
      return { success: true, bookingId: request.booking_id || undefined };
    }

    if (request.status === 'rejected') {
      return { success: false, error: "This request has already been declined and cannot be approved." };
    }

    const targetRoomId = overrideRoomId || request.room_id;
    if (!targetRoomId) {
      return { success: false, error: "Cannot approve request: no physical room assigned." };
    }

    // Strict, unambiguous machine tag for crash recovery
    const requestTag = `[REF_REQUEST_UUID:${request.id}]`;

    // -------------------------------------------------------------
    // RECOVERY PATH A: request.booking_id is already set on the request
    // -------------------------------------------------------------
    if (request.booking_id) {
      const { data: linkedBooking } = await supabase
        .from("bookings")
        .select("id, room_id, status")
        .eq("id", request.booking_id)
        .single();

      if (linkedBooking && linkedBooking.status !== 'cancelled') {
        const { error: markApprovedError } = await supabase
          .from("booking_requests")
          .update({
            status: 'approved',
            room_id: linkedBooking.room_id || targetRoomId,
            updated_at: new Date().toISOString()
          })
          .eq("id", requestId);

        if (markApprovedError) {
          console.error("[HMS] Error finalizing approved status on linked booking:", markApprovedError);
          return {
            success: false,
            bookingId: linkedBooking.id,
            error: `Booking exists (${linkedBooking.id}), but updating request status failed: ${markApprovedError.message}. Click Approve again to retry.`
          };
        }

        return { success: true, bookingId: linkedBooking.id };
      }
    }

    // -------------------------------------------------------------
    // RECOVERY PATH B: request.booking_id was not saved, but a booking was
    // created in bookings during a prior interrupted attempt.
    // Query exact homestay, room, and dates, then perform strict literal tag verification.
    // -------------------------------------------------------------
    const { data: candidateBookings, error: matchError } = await supabase
      .from("bookings")
      .select("id, room_id, notes, status, check_in, check_out")
      .eq("homestay_id", request.homestay_id)
      .eq("room_id", targetRoomId)
      .eq("check_in", request.check_in)
      .eq("check_out", request.check_out)
      .neq("status", "cancelled");

    const matchingBookings = (candidateBookings || []).filter(b => 
      typeof b.notes === 'string' && b.notes.includes(requestTag)
    );

    if (!matchError && matchingBookings.length > 0) {
      const priorBooking = matchingBookings[0];
      console.log(`[HMS] Recovered existing booking ${priorBooking.id} for request ${request.id} via strict tag match. Linking without duplicating...`);

      const { error: linkPriorError } = await supabase
        .from("booking_requests")
        .update({
          status: 'approved',
          room_id: priorBooking.room_id,
          booking_id: priorBooking.id,
          updated_at: new Date().toISOString()
        })
        .eq("id", requestId);

      if (linkPriorError) {
        console.error("[HMS] Error linking prior booking to request:", linkPriorError);
        return {
          success: false,
          bookingId: priorBooking.id,
          error: `Booking exists (${priorBooking.id}), but linking failed: ${linkPriorError.message}. Click Approve again to retry.`
        };
      }

      return { success: true, bookingId: priorBooking.id };
    }

    // -------------------------------------------------------------
    // FRESH CREATION PATH: No prior booking exists
    // -------------------------------------------------------------

    // Verify room belongs to this homestay
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, homestay_id, name, max_guests")
      .eq("id", targetRoomId)
      .single();

    if (roomError || !room) {
      return { success: false, error: "Target room not found in this homestay." };
    }

    if (room.homestay_id !== request.homestay_id) {
      return { success: false, error: "Assigned room belongs to a different homestay." };
    }

    // Pre-check for overlapping active bookings (excluding cancelled)
    const { data: conflicts, error: conflictError } = await supabase
      .from("bookings")
      .select("id")
      .eq("room_id", targetRoomId)
      .neq("status", "cancelled")
      .lt("check_in", request.check_out)
      .gt("check_out", request.check_in);

    if (conflictError) {
      console.error("[HMS] Conflict check error:", conflictError);
    } else if (conflicts && conflicts.length > 0) {
      return {
        success: false,
        error: `Room "${room.name}" is already booked for these dates (${request.check_in} to ${request.check_out}). Please choose another room or date.`
      };
    }

    // Format notes with strict unambiguous request tag while fully preserving user notes
    const bookingNotes = request.notes 
      ? `${requestTag} Pay at Property. ${request.notes.trim()}` 
      : `${requestTag} Pay at Property.`;

    // Convert to confirmed booking using existing atomic createBookingAction
    const bookingResult = await createBookingAction({
      roomId: targetRoomId,
      checkIn: request.check_in,
      checkOut: request.check_out,
      numberOfGuests: request.number_of_guests,
      guestPhone: request.guest_phone,
      notes: bookingNotes,
      guests: [
        {
          name: request.guest_name,
          phone: request.guest_phone,
          email: request.guest_email || undefined,
          isPrimary: true
        }
      ]
    });

    if (!bookingResult.success || !bookingResult.bookingId) {
      return { success: false, error: bookingResult.error || "Failed to create atomic booking." };
    }

    // Update request status to 'approved' and record booking_id with retry loop and optimistic lock
    let updateSuccess = false;
    let lastUpdateError: any = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error: updateError } = await supabase
        .from("booking_requests")
        .update({
          status: 'approved',
          room_id: targetRoomId,
          booking_id: bookingResult.bookingId,
          updated_at: new Date().toISOString()
        })
        .eq("id", requestId)
        .eq("status", "pending");

      if (!updateError) {
        updateSuccess = true;
        break;
      }

      lastUpdateError = updateError;
      console.warn(`[HMS] Update attempt ${attempt} failed for request ${requestId}:`, updateError.message);
      if (attempt < 3) {
        await new Promise(res => setTimeout(res, attempt * 200));
      }
    }

    if (!updateSuccess) {
      console.error(`[HMS] CRITICAL: Booking created with ID ${bookingResult.bookingId} but request status update failed after 3 attempts:`, lastUpdateError);
      return { 
        success: false, 
        bookingId: bookingResult.bookingId, 
        error: `Booking was confirmed in the system (Booking ID: ${bookingResult.bookingId}), but request status failed to update (${lastUpdateError?.message || "database timeout"}). Please click 'Approve' again to complete synchronization.` 
      };
    }

    return { success: true, bookingId: bookingResult.bookingId };
  } catch (err: unknown) {
    console.error("[HMS] Exception in approveBookingRequestAction:", err);
    return { success: false, error: err instanceof Error ? err.message : "Internal server error." };
  }
}

/**
 * Reject / Decline a website booking request.
 */
export async function rejectBookingRequestAction(
  requestId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    // 1. Authenticate user & partner
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "You must be logged in to decline requests." };
    }

    const { data: partner } = await supabase
      .from("partners")
      .select("id, role, homestay_id, is_active")
      .eq("email", user.email)
      .single();

    if (!partner || !partner.is_active) {
      return { success: false, error: "Unauthorized." };
    }

    // 2. Fetch the target booking request
    const { data: request, error: reqError } = await supabase
      .from("booking_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (reqError || !request) {
      return { success: false, error: "Booking request not found." };
    }

    // Verify tenant authorization
    if (partner.role !== 'super_admin' && partner.homestay_id !== request.homestay_id) {
      return { success: false, error: "You are not authorized to manage requests for this homestay." };
    }

    // Idempotent: already rejected
    if (request.status === 'rejected') {
      return { success: true };
    }

    // Cannot decline if already has a confirmed booking
    if (request.booking_id) {
      return { success: false, error: `Cannot decline: an active booking (${request.booking_id}) has already been created for this request.` };
    }

    if (request.status !== 'pending') {
      return { success: false, error: `This request has already been marked as ${request.status}.` };
    }

    // 3. Mark request as rejected with retry loop
    const updatedNotes = reason 
      ? (request.notes ? `${request.notes}\n[Declined: ${reason}]` : `[Declined: ${reason}]`)
      : request.notes;

    let updateSuccess = false;
    let lastUpdateError: any = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error: updateError } = await supabase
        .from("booking_requests")
        .update({
          status: 'rejected',
          notes: updatedNotes,
          updated_at: new Date().toISOString()
        })
        .eq("id", requestId)
        .eq("status", "pending");

      if (!updateError) {
        updateSuccess = true;
        break;
      }
      lastUpdateError = updateError;
      if (attempt < 3) {
        await new Promise(res => setTimeout(res, attempt * 200));
      }
    }

    if (!updateSuccess) {
      return { success: false, error: lastUpdateError?.message || "Failed to update request." };
    }

    return { success: true };
  } catch (err: unknown) {
    console.error("[HMS] Exception in rejectBookingRequestAction:", err);
    return { success: false, error: err instanceof Error ? err.message : "Internal server error." };
  }
}
