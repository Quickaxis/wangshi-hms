import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchBookingNotification } from "@/app/actions/notifications";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Idempotency-Key",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      homestay_id,
      room_id,
      guest_name,
      guest_phone,
      guest_email,
      check_in,
      check_out,
      number_of_guests = 1,
      notes = "",
      estimated_total = 0,
      payment_method = "pay_at_property",
      booking_reference,
    } = body;

    // 1. Validate required fields
    if (!homestay_id || !guest_name || !guest_phone || !check_in || !check_out) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: homestay_id, guest_name, guest_phone, check_in, check_out." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (new Date(check_out) <= new Date(check_in)) {
      return NextResponse.json(
        { success: false, error: "Check-out date must be after check-in date." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const adminClient = createAdminClient();

    // 2. Validate homestay exists and is active
    const { data: homestay, error: hsError } = await adminClient
      .from("homestays")
      .select("id, name, is_active")
      .eq("id", homestay_id)
      .single();

    if (hsError || !homestay) {
      return NextResponse.json(
        { success: false, error: "Homestay not found." },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (!homestay.is_active) {
      return NextResponse.json(
        { success: false, error: "This homestay is currently inactive." },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // 3. Optional room validation and lookup
    let roomName: string | undefined;
    if (room_id) {
      const { data: room } = await adminClient
        .from("rooms")
        .select("name, homestay_id")
        .eq("id", room_id)
        .maybeSingle();

      if (room) {
        roomName = room.name;
      }
    }

    // 4. Duplicate Submission Protection (5-minute window for same phone, room, check_in, check_out)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    let dupQuery = adminClient
      .from("booking_requests")
      .select("id, status, created_at")
      .eq("homestay_id", homestay_id)
      .eq("guest_phone", guest_phone)
      .eq("check_in", check_in)
      .eq("check_out", check_out)
      .gte("created_at", fiveMinutesAgo);

    if (room_id) {
      dupQuery = dupQuery.eq("room_id", room_id);
    }

    const { data: existingDup } = await dupQuery.maybeSingle();

    if (existingDup) {
      // Return existing without duplicating notifications
      return NextResponse.json(
        {
          success: true,
          booking_request_id: existingDup.id,
          message: "Booking request already received. We are processing it.",
          is_duplicate: true,
        },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 5. Insert new booking request
    const { data: inserted, error: insertError } = await adminClient
      .from("booking_requests")
      .insert({
        homestay_id,
        room_id: room_id || null,
        guest_name: guest_name.trim(),
        guest_phone: guest_phone.trim(),
        guest_email: guest_email?.trim() || null,
        check_in,
        check_out,
        number_of_guests: Number(number_of_guests) || 1,
        notes: notes?.trim() || null,
        estimated_total: Number(estimated_total) || 0,
        payment_method,
        status: "pending",
      })
      .select("id, created_at")
      .single();

    if (insertError) {
      console.error("[HOSPIRO Public API] Insert booking_request error:", insertError);
      return NextResponse.json(
        { success: false, error: "Failed to record booking request." },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // 6. Dispatch Web Push & in-app notification to homestay staff
    const notifResult = await dispatchBookingNotification({
      homestayId: homestay_id,
      bookingRequestId: inserted.id,
      guestName: guest_name.trim(),
      guestPhone: guest_phone.trim(),
      roomName,
      checkIn: check_in,
      checkOut: check_out,
      numberOfGuests: Number(number_of_guests) || 1,
      estimatedTotal: Number(estimated_total) || 0,
      bookingReference: booking_reference || inserted.id.substring(0, 8).toUpperCase(),
    });

    return NextResponse.json(
      {
        success: true,
        booking_request_id: inserted.id,
        message: "Booking request submitted successfully.",
        notification_dispatched: notifResult.success,
      },
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error("[HOSPIRO Public API] Exception in booking-requests:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

