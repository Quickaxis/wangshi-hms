"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/admin";
import { Homestay, Partner, DbRoom } from "@/lib/types";
import { createAdminClient, getAdminEnvDiagnostic, AdminEnvDiagnostic } from "@/lib/supabase/admin";

export interface AdminActionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// HOMESTAYS
// ============================================================================

export async function addHomestayAction(data: Partial<Homestay>): Promise<AdminActionResult> {
  try {
    const { supabase, authorized } = await requireSuperAdmin();
    if (!authorized) return { success: false, error: "Unauthorized" };

    const { error } = await supabase.from("homestays").insert([
      {
        name: data.name,
        location: data.location,
        phone: data.phone,
        email: data.email,
        logo_url: data.logo_url,
        is_active: data.is_active ?? true,
      }
    ]);

    if (error) throw error;
    revalidatePath("/admin/homestays");
    return { success: true };
  } catch (err: any) {
    console.error("addHomestayAction error:", err);
    return { success: false, error: err?.message || "Failed to add homestay" };
  }
}

export async function updateHomestayAction(id: string, data: Partial<Homestay>): Promise<AdminActionResult> {
  try {
    const { supabase, authorized } = await requireSuperAdmin();
    if (!authorized) return { success: false, error: "Unauthorized" };

    const { error } = await supabase
      .from("homestays")
      .update({
        name: data.name,
        location: data.location,
        phone: data.phone,
        email: data.email,
        logo_url: data.logo_url,
        is_active: data.is_active,
      })
      .eq("id", id);

    if (error) throw error;
    revalidatePath("/admin/homestays");
    return { success: true };
  } catch (err: any) {
    console.error("updateHomestayAction error:", err);
    return { success: false, error: err?.message || "Failed to update homestay" };
  }
}

export async function getHomestayDeletionSummaryAction(homestayId: string): Promise<AdminActionResult<{
  roomsCount: number;
  bookingsCount: number;
  activeBookingsCount: number;
  guestsCount: number;
  partnersCount: number;
  requestsCount: number;
  homestayName: string;
}>> {
  try {
    const { authorized } = await requireSuperAdmin();
    if (!authorized) return { success: false, error: "Unauthorized" };

    const adminClient = createAdminClient();

    const { data: homestay, error: hError } = await adminClient
      .from("homestays")
      .select("id, name")
      .eq("id", homestayId)
      .single();

    if (hError || !homestay) {
      return { success: false, error: "Homestay not found" };
    }

    const [
      { count: roomsCount },
      { count: bookingsCount },
      { count: activeBookingsCount },
      { count: guestsCount },
      { count: partnersCount },
      { count: requestsCount }
    ] = await Promise.all([
      adminClient.from("rooms").select("id", { count: "exact", head: true }).eq("homestay_id", homestayId),
      adminClient.from("bookings").select("id", { count: "exact", head: true }).eq("homestay_id", homestayId),
      adminClient.from("bookings").select("id", { count: "exact", head: true }).eq("homestay_id", homestayId).neq("status", "cancelled"),
      adminClient.from("guests").select("id", { count: "exact", head: true }).eq("homestay_id", homestayId),
      adminClient.from("partners").select("id", { count: "exact", head: true }).eq("homestay_id", homestayId).neq("role", "super_admin"),
      adminClient.from("booking_requests").select("id", { count: "exact", head: true }).eq("homestay_id", homestayId)
    ]);

    return {
      success: true,
      data: {
        roomsCount: roomsCount || 0,
        bookingsCount: bookingsCount || 0,
        activeBookingsCount: activeBookingsCount || 0,
        guestsCount: guestsCount || 0,
        partnersCount: partnersCount || 0,
        requestsCount: requestsCount || 0,
        homestayName: homestay.name
      }
    };
  } catch (err: any) {
    console.error("getHomestayDeletionSummaryAction error:", err);
    return { success: false, error: err?.message || "Failed to inspect homestay dependencies" };
  }
}

export async function deleteHomestayAction(homestayId: string, confirmedName: string): Promise<AdminActionResult> {
  try {
    const { authorized } = await requireSuperAdmin();
    if (!authorized) return { success: false, error: "Unauthorized: Super Admin access required." };

    if (!homestayId) return { success: false, error: "Homestay ID is required." };
    if (!confirmedName) return { success: false, error: "Confirmation name is required." };

    const adminClient = createAdminClient();

    // 1. Verify target homestay exists
    const { data: homestay, error: hError } = await adminClient
      .from("homestays")
      .select("*")
      .eq("id", homestayId)
      .single();

    if (hError || !homestay) {
      return { success: false, error: "Homestay not found." };
    }

    // 2. Strict confirmation check
    if (homestay.name.trim().toLowerCase() !== confirmedName.trim().toLowerCase()) {
      return { success: false, error: `Confirmation name does not match property name "${homestay.name}".` };
    }

    // 3. Detach any super_admin partner associated with this homestay (never delete super admin accounts!)
    await adminClient
      .from("partners")
      .update({ homestay_id: null })
      .eq("homestay_id", homestayId)
      .eq("role", "super_admin");

    // 4. Inspect normal partners belonging strictly to this homestay
    const { data: normalPartners } = await adminClient
      .from("partners")
      .select("id, auth_user_id, email")
      .eq("homestay_id", homestayId)
      .neq("role", "super_admin");

    if (normalPartners && normalPartners.length > 0) {
      for (const p of normalPartners) {
        if (p.auth_user_id) {
          // Check if auth_user_id is shared with any other partner record
          const { data: otherLinks } = await adminClient
            .from("partners")
            .select("id")
            .eq("auth_user_id", p.auth_user_id)
            .neq("id", p.id);

          if (!otherLinks || otherLinks.length === 0) {
            try {
              await adminClient.auth.admin.deleteUser(p.auth_user_id);
            } catch (authDelErr: any) {
              console.warn(`[HMS] Could not delete auth account ${p.auth_user_id}:`, authDelErr?.message || authDelErr);
            }
          }
        }
      }

      // Delete normal partners from partners table
      const { error: partDelError } = await adminClient
        .from("partners")
        .delete()
        .eq("homestay_id", homestayId)
        .neq("role", "super_admin");

      if (partDelError) {
        throw new Error(`Failed to remove associated partners: ${partDelError.message}`);
      }
    }

    // 5. Delete booking_requests scoped to this homestay
    const { error: reqDelError } = await adminClient
      .from("booking_requests")
      .delete()
      .eq("homestay_id", homestayId);

    if (reqDelError) {
      throw new Error(`Failed to remove booking requests: ${reqDelError.message}`);
    }

    // 6. Delete guests scoped to this homestay
    // Find all bookings for this homestay first to ensure dependent guests are cleared
    const { data: homestayBookings } = await adminClient
      .from("bookings")
      .select("id")
      .eq("homestay_id", homestayId);

    const bookingIds = (homestayBookings || []).map(b => b.id);
    if (bookingIds.length > 0) {
      const { error: guestsBookingDelError } = await adminClient
        .from("guests")
        .delete()
        .in("booking_id", bookingIds);

      if (guestsBookingDelError) {
        throw new Error(`Failed to remove booking guests: ${guestsBookingDelError.message}`);
      }
    }

    const { error: guestsHomestayDelError } = await adminClient
      .from("guests")
      .delete()
      .eq("homestay_id", homestayId);

    if (guestsHomestayDelError) {
      throw new Error(`Failed to remove guests: ${guestsHomestayDelError.message}`);
    }

    // 7. Delete bookings scoped to this homestay
    const { error: bookDelError } = await adminClient
      .from("bookings")
      .delete()
      .eq("homestay_id", homestayId);

    if (bookDelError) {
      throw new Error(`Failed to remove bookings: ${bookDelError.message}`);
    }

    // 8. Delete rooms scoped to this homestay
    const { error: roomsDelError } = await adminClient
      .from("rooms")
      .delete()
      .eq("homestay_id", homestayId);

    if (roomsDelError) {
      throw new Error(`Failed to remove rooms: ${roomsDelError.message}`);
    }

    // 9. Delete homestay record
    const { error: homestayDelError } = await adminClient
      .from("homestays")
      .delete()
      .eq("id", homestayId);

    if (homestayDelError) {
      throw new Error(`Failed to delete homestay record: ${homestayDelError.message}`);
    }

    revalidatePath("/admin/homestays");
    revalidatePath("/");
    return { success: true };
  } catch (err: any) {
    console.error("deleteHomestayAction error:", err);
    return { success: false, error: err?.message || "Failed to permanently delete homestay" };
  }
}

// ============================================================================
// ROOMS
// ============================================================================

export async function addRoomAction(data: Partial<DbRoom>): Promise<AdminActionResult> {
  try {
    const { supabase, authorized } = await requireSuperAdmin();
    if (!authorized) return { success: false, error: "Unauthorized" };

    const { error } = await supabase.from("rooms").insert([
      {
        homestay_id: data.homestay_id,
        room_number: data.room_number,
        name: data.name,
        description: data.description || null,
        bathroom_type: data.bathroom_type || "Attached toilet & bathroom",
        max_guests: data.max_guests,
        nightly_rate: data.nightly_rate,
        breakfast_included: data.breakfast_included ?? true,
        breakfast_details: data.breakfast_details || null,
        is_active: data.is_active ?? true,
      }
    ]);

    if (error) throw error;
    revalidatePath("/admin/homestays");
    revalidatePath("/admin/rooms");
    revalidatePath("/rooms");
    revalidatePath("/");
    return { success: true };
  } catch (err: any) {
    console.error("addRoomAction error:", err);
    return { success: false, error: err?.message || "Failed to add room" };
  }
}

export async function updateRoomAction(id: string, data: Partial<DbRoom>): Promise<AdminActionResult> {
  try {
    const { supabase, authorized } = await requireSuperAdmin();
    if (!authorized) return { success: false, error: "Unauthorized" };

    const updateData: Record<string, any> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.room_number !== undefined) updateData.room_number = data.room_number;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.max_guests !== undefined) updateData.max_guests = data.max_guests;
    if (data.nightly_rate !== undefined) updateData.nightly_rate = data.nightly_rate;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    if (data.bathroom_type !== undefined) updateData.bathroom_type = data.bathroom_type;
    if (data.breakfast_included !== undefined) updateData.breakfast_included = data.breakfast_included;
    if (data.breakfast_details !== undefined) updateData.breakfast_details = data.breakfast_details;

    const { error } = await supabase
      .from("rooms")
      .update(updateData)
      .eq("id", id);

    if (error) throw error;
    revalidatePath("/admin/homestays");
    revalidatePath("/admin/rooms");
    revalidatePath("/rooms");
    revalidatePath("/");
    return { success: true };
  } catch (err: any) {
    console.error("updateRoomAction error:", err);
    return { success: false, error: err?.message || "Failed to update room" };
  }
}

export async function getRoomDeletionSummaryAction(roomId: string): Promise<AdminActionResult<{
  bookingsCount: number;
  activeBookingsCount: number;
  requestsCount: number;
  roomNumber: string;
  roomName: string;
}>> {
  try {
    const { authorized } = await requireSuperAdmin();
    if (!authorized) return { success: false, error: "Unauthorized" };

    const adminClient = createAdminClient();

    const { data: room, error: rError } = await adminClient
      .from("rooms")
      .select("id, room_number, name")
      .eq("id", roomId)
      .single();

    if (rError || !room) {
      return { success: false, error: "Room not found" };
    }

    const [
      { count: bookingsCount },
      { count: activeBookingsCount },
      { count: requestsCount }
    ] = await Promise.all([
      adminClient.from("bookings").select("id", { count: "exact", head: true }).eq("room_id", roomId),
      adminClient.from("bookings").select("id", { count: "exact", head: true }).eq("room_id", roomId).neq("status", "cancelled"),
      adminClient.from("booking_requests").select("id", { count: "exact", head: true }).eq("room_id", roomId)
    ]);

    return {
      success: true,
      data: {
        bookingsCount: bookingsCount || 0,
        activeBookingsCount: activeBookingsCount || 0,
        requestsCount: requestsCount || 0,
        roomNumber: room.room_number,
        roomName: room.name
      }
    };
  } catch (err: any) {
    console.error("getRoomDeletionSummaryAction error:", err);
    return { success: false, error: err?.message || "Failed to inspect room dependencies" };
  }
}

export async function deleteRoomAction(
  roomId: string, 
  confirmedIdentifier: string, 
  cascadeConfirmed?: boolean
): Promise<AdminActionResult> {
  try {
    const { authorized } = await requireSuperAdmin();
    if (!authorized) return { success: false, error: "Unauthorized: Super Admin access required." };

    if (!roomId) return { success: false, error: "Room ID is required." };
    if (!confirmedIdentifier) return { success: false, error: "Confirmation identifier is required." };

    const adminClient = createAdminClient();

    // 1. Verify target room exists
    const { data: room, error: rError } = await adminClient
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (rError || !room) {
      return { success: false, error: "Room not found." };
    }

    // 2. Strict confirmation check: match room_number OR room name
    const ident = confirmedIdentifier.trim().toLowerCase();
    const matchesNumber = room.room_number.trim().toLowerCase() === ident;
    const matchesName = room.name.trim().toLowerCase() === ident;

    if (!matchesNumber && !matchesName) {
      return { 
        success: false, 
        error: `Confirmation does not match room number "${room.room_number}" or name "${room.name}".` 
      };
    }

    // 3. Inspect dependent bookings and requests
    const [{ count: bookingsCount }, { count: requestsCount }] = await Promise.all([
      adminClient.from("bookings").select("id", { count: "exact", head: true }).eq("room_id", roomId),
      adminClient.from("booking_requests").select("id", { count: "exact", head: true }).eq("room_id", roomId)
    ]);

    const totalDeps = (bookingsCount || 0) + (requestsCount || 0);

    if (totalDeps > 0 && !cascadeConfirmed) {
      return {
        success: false,
        error: `This room has ${bookingsCount || 0} booking record(s) and ${requestsCount || 0} booking request(s). Deletion must be explicitly confirmed for cascade.`
      };
    }

    // 4. Cascade delete dependent records strictly scoped to this roomId
    const { data: roomBookings } = await adminClient
      .from("bookings")
      .select("id")
      .eq("room_id", roomId);

    const bookingIds = (roomBookings || []).map(b => b.id);
    if (bookingIds.length > 0) {
      const { error: guestDelError } = await adminClient
        .from("guests")
        .delete()
        .in("booking_id", bookingIds);

      if (guestDelError) {
        throw new Error(`Failed to remove booking guests: ${guestDelError.message}`);
      }
    }

    const { error: reqDelError } = await adminClient
      .from("booking_requests")
      .delete()
      .eq("room_id", roomId);

    if (reqDelError) {
      throw new Error(`Failed to remove booking requests: ${reqDelError.message}`);
    }

    const { error: bookDelError } = await adminClient
      .from("bookings")
      .delete()
      .eq("room_id", roomId);

    if (bookDelError) {
      throw new Error(`Failed to remove bookings: ${bookDelError.message}`);
    }

    // 5. Delete room record
    const { error: roomDelError } = await adminClient
      .from("rooms")
      .delete()
      .eq("id", roomId);

    if (roomDelError) {
      throw new Error(`Failed to delete room record: ${roomDelError.message}`);
    }

    revalidatePath("/admin/homestays");
    revalidatePath("/admin/rooms");
    revalidatePath("/rooms");
    revalidatePath("/");
    return { success: true };
  } catch (err: any) {
    console.error("deleteRoomAction error:", err);
    return { success: false, error: err?.message || "Failed to permanently delete room" };
  }
}

// ============================================================================
// PARTNERS
// ============================================================================

export async function createPartnerWithAuth(data: Partial<Partner> & { password?: string }): Promise<AdminActionResult> {
  try {
    const { supabase, authorized } = await requireSuperAdmin();
    if (!authorized) return { success: false, error: "Unauthorized" };

    if (!data.email || !data.password || !data.name) {
      return { success: false, error: "Email, password, and name are required." };
    }

    if (data.role !== 'super_admin' && !data.homestay_id) {
      return { success: false, error: "A homestay must be assigned for normal partners." };
    }

    // Verify homestay exists if homestay_id is provided
    if (data.homestay_id) {
      const { data: homestayCheck, error: homestayError } = await supabase
        .from('homestays')
        .select('id, is_active')
        .eq('id', data.homestay_id)
        .single();
        
      if (homestayError || !homestayCheck) {
        return { success: false, error: "Selected homestay does not exist." };
      }
      if (!homestayCheck.is_active) {
        return { success: false, error: "Selected homestay is inactive." };
      }
    }

    const adminClient = createAdminClient();

    // 1. Create the user in Supabase Auth securely
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name }
    });

    if (authError) {
      if (authError.message.toLowerCase().includes('already exists') || authError.status === 422) {
        return { success: false, error: "A user with this email already exists." };
      }
      if (authError.status === 401 || authError.message.toLowerCase().includes('invalid api key')) {
        return {
          success: false,
          error: "Authentication service error: Supabase Admin API rejected the credentials (Invalid API key). Please verify that SUPABASE_SERVICE_ROLE_KEY is correctly set for this Supabase project."
        };
      }
      return { success: false, error: `Failed to create authentication account: ${authError.message}` };
    }

    const authUserId = authData.user.id;

    // 2. Link to partners table
    const { error: dbError } = await supabase
      .from("partners")
      .insert({
        auth_user_id: authUserId,
        name: data.name,
        email: data.email,
        role: data.role,
        homestay_id: data.role === 'super_admin' ? null : data.homestay_id,
        is_active: data.is_active ?? true,
      });

    if (dbError) {
      // Rollback auth user creation if db insert fails
      try {
        await adminClient.auth.admin.deleteUser(authUserId);
      } catch (rollbackErr: any) {
        console.error("Failed to rollback auth user creation:", rollbackErr?.message || rollbackErr);
      }
      return { success: false, error: `Failed to create partner profile: ${dbError.message}` };
    }

    revalidatePath("/admin/homestays");
    return { success: true };
  } catch (err: any) {
    console.error("createPartnerWithAuth error:", err?.message || err);
    return { success: false, error: err?.message || "Failed to create partner with auth" };
  }
}

export async function addPartnerAction(data: Partial<Partner>): Promise<AdminActionResult> {
  try {
    const { supabase, authorized } = await requireSuperAdmin();
    if (!authorized) return { success: false, error: "Unauthorized" };

    // This is the legacy method without password. It might still be used if we don't refactor everything immediately.
    const { error } = await supabase
      .from("partners")
      .insert({
        name: data.name,
        email: data.email,
        role: data.role,
        homestay_id: data.role === 'super_admin' ? null : data.homestay_id,
        is_active: data.is_active ?? true,
      });

    if (error) throw error;
    revalidatePath("/admin/homestays");
    return { success: true };
  } catch (err: any) {
    console.error("addPartnerAction error:", err);
    return { success: false, error: err?.message || "Failed to add partner" };
  }
}

export async function updatePartnerAction(id: string, data: Partial<Partner>): Promise<AdminActionResult> {
  try {
    const { supabase, authorized } = await requireSuperAdmin();
    if (!authorized) return { success: false, error: "Unauthorized" };

    const { error } = await supabase
      .from("partners")
      .update({
        name: data.name,
        email: data.email,
        role: data.role,
        homestay_id: data.homestay_id,
        is_active: data.is_active,
      })
      .eq("id", id);

    if (error) throw error;
    revalidatePath("/admin/homestays");
    return { success: true };
  } catch (err: any) {
    console.error("updatePartnerAction error:", err);
    return { success: false, error: err?.message || "Failed to update partner" };
  }
}

export async function sendPasswordResetAction(email: string): Promise<AdminActionResult> {
  try {
    const { supabase, authorized } = await requireSuperAdmin();
    if (!authorized) return { success: false, error: "Unauthorized" };

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/update-password`,
    });

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error("sendPasswordResetAction error:", err);
    return { success: false, error: err?.message || "Failed to send reset email" };
  }
}

export async function resetPartnerPasswordAction(authUserId: string, newPassword: string): Promise<AdminActionResult> {
  try {
    const { authorized } = await requireSuperAdmin();
    if (!authorized) return { success: false, error: "Unauthorized" };

    if (!newPassword || newPassword.length < 8) {
      return { success: false, error: "Password must be at least 8 characters long." };
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient.auth.admin.updateUserById(authUserId, {
      password: newPassword
    });

    if (error) {
      if (error.status === 401 || error.message.toLowerCase().includes('invalid api key')) {
        return {
          success: false,
          error: "Authentication service error: Supabase Admin API rejected the credentials (Invalid API key). Please verify that SUPABASE_SERVICE_ROLE_KEY is correctly set for this Supabase project."
        };
      }
      return { success: false, error: `Failed to reset password: ${error.message}` };
    }
    return { success: true };
  } catch (err: any) {
    console.error("resetPartnerPasswordAction error:", err?.message || err);
    return { success: false, error: err?.message || "Failed to reset password" };
  }
}

export async function getAdminEnvDiagnosticAction(): Promise<AdminActionResult<AdminEnvDiagnostic>> {
  try {
    const { authorized } = await requireSuperAdmin();
    if (!authorized) return { success: false, error: "Unauthorized: Super Admin access required." };

    const diagnostic = getAdminEnvDiagnostic();
    return { success: true, data: diagnostic };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to inspect environment" };
  }
}

