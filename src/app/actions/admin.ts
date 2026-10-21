"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/admin";
import { Homestay, Partner, DbRoom } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";

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
        description: data.description,
        bathroom_type: data.bathroom_type,
        max_guests: data.max_guests,
        nightly_rate: data.nightly_rate,
        breakfast_included: data.breakfast_included,
        breakfast_details: data.breakfast_details,
        is_active: data.is_active ?? true,
      }
    ]);

    if (error) throw error;
    revalidatePath("/admin/homestays");
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

    const { error } = await supabase
      .from("rooms")
      .update({
        name: data.name,
        room_number: data.room_number,
        description: data.description,
        bathroom_type: data.bathroom_type,
        max_guests: data.max_guests,
        nightly_rate: data.nightly_rate,
        breakfast_included: data.breakfast_included,
        breakfast_details: data.breakfast_details,
        is_active: data.is_active,
      })
      .eq("id", id);

    if (error) throw error;
    revalidatePath("/admin/homestays");
    return { success: true };
  } catch (err: any) {
    console.error("updateRoomAction error:", err);
    return { success: false, error: err?.message || "Failed to update room" };
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
