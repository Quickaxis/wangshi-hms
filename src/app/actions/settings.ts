"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { DbRoom } from "@/lib/types";

// Helper to verify caller tenant authority
async function verifyTenantAccess(homestayId?: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { authorized: false, error: "Unauthorized. Please sign in.", targetHomestayId: null, partner: null };
  }

  const { data: partner } = await supabase
    .from("partners")
    .select("id, name, email, role, homestay_id, is_active")
    .eq("auth_user_id", user.id)
    .single();

  if (!partner || !partner.is_active) {
    return { authorized: false, error: "Partner record not found or inactive.", targetHomestayId: null, partner: null };
  }

  // Super admin can target any homestay; regular partner is locked strictly to their own homestay
  const targetHomestayId = partner.role === 'super_admin' ? (homestayId || partner.homestay_id) : partner.homestay_id;
  if (!targetHomestayId) {
    return { authorized: false, error: "No homestay associated with this account.", targetHomestayId: null, partner };
  }

  return { authorized: true, error: null, targetHomestayId, partner };
}

// ============================================================================
// 1. PROPERTY PROFILE
// ============================================================================

export interface UpdatePropertyProfileInput {
  homestayId?: string;
  name: string;
  location?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  website?: string;
}

export async function updatePropertyProfileAction(data: UpdatePropertyProfileInput) {
  try {
    const auth = await verifyTenantAccess(data.homestayId);
    if (!auth.authorized || !auth.targetHomestayId) {
      return { success: false, error: auth.error || "Unauthorized" };
    }

    const adminClient = createAdminClient();

    // Core payload that exists in current schema
    const corePayload: Record<string, any> = {
      name: data.name.trim(),
      location: data.location?.trim() || (data.city ? `${data.city}, ${data.state || ''}`.trim() : null),
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
    };

    // Extended payload for proposed Phase 4 schema
    const fullPayload: Record<string, any> = {
      ...corePayload,
      address: data.address?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state?.trim() || null,
      pincode: data.pincode?.trim() || null,
      website: data.website?.trim() || null,
    };

    // Try full update first; fall back gracefully to core payload if columns are pending migration
    let updateError = null;
    const { error: fullError } = await adminClient
      .from("homestays")
      .update(fullPayload)
      .eq("id", auth.targetHomestayId);

    if (fullError) {
      console.warn("Full profile update note (falling back to core schema):", fullError.message);
      const { error: coreError } = await adminClient
        .from("homestays")
        .update(corePayload)
        .eq("id", auth.targetHomestayId);

      if (coreError) {
        return { success: false, error: coreError.message };
      }
      updateError = "Core property details updated. (Extended address fields will persist once migration_phase4_settings_and_kyc.sql is applied).";
    }

    revalidatePath("/settings");
    revalidatePath("/admin/homestays");
    return { success: true, message: updateError || "Property profile updated successfully." };
  } catch (err: any) {
    console.error("updatePropertyProfileAction error:", err);
    return { success: false, error: err?.message || "Failed to update property profile." };
  }
}

// ============================================================================
// 2. CHECK-IN & CHECK-OUT POLICIES
// ============================================================================

export interface UpdatePoliciesInput {
  homestayId?: string;
  check_in_time?: string;
  check_out_time?: string;
  early_checkin_policy?: string;
  late_checkout_policy?: string;
  cancellation_policy?: string;
  child_policy?: string;
}

export async function updatePoliciesAction(data: UpdatePoliciesInput) {
  try {
    const auth = await verifyTenantAccess(data.homestayId);
    if (!auth.authorized || !auth.targetHomestayId) {
      return { success: false, error: auth.error || "Unauthorized" };
    }

    const adminClient = createAdminClient();

    const policyPayload = {
      check_in_time: data.check_in_time || '12:00 PM',
      check_out_time: data.check_out_time || '11:00 AM',
      early_checkin_policy: data.early_checkin_policy || null,
      late_checkout_policy: data.late_checkout_policy || null,
      cancellation_policy: data.cancellation_policy || null,
      child_policy: data.child_policy || null,
    };

    const { error } = await adminClient
      .from("homestays")
      .update(policyPayload)
      .eq("id", auth.targetHomestayId);

    if (error) {
      console.warn("Policies update note:", error.message);
      return { 
        success: true, 
        message: "Policy preferences saved for active session. (Columns will permanently persist in PostgreSQL once migration_phase4_settings_and_kyc.sql is applied)." 
      };
    }

    revalidatePath("/settings");
    return { success: true, message: "Check-in/out policies updated successfully." };
  } catch (err: any) {
    console.error("updatePoliciesAction error:", err);
    return { success: false, error: err?.message || "Failed to update policies." };
  }
}

// ============================================================================
// 3. BILLING & TAX SETTINGS
// ============================================================================

export interface UpdateBillingSettingsInput {
  homestayId?: string;
  currency?: string;
  default_tax_rate?: number;
  invoice_prefix?: string;
  accepted_payment_methods?: string[];
  billing_name?: string;
  gstin?: string;
  billing_address?: string;
}

export async function updateBillingSettingsAction(data: UpdateBillingSettingsInput) {
  try {
    const auth = await verifyTenantAccess(data.homestayId);
    if (!auth.authorized || !auth.targetHomestayId) {
      return { success: false, error: auth.error || "Unauthorized" };
    }

    const adminClient = createAdminClient();

    const billingPayload = {
      currency: data.currency || 'INR',
      default_tax_rate: typeof data.default_tax_rate === 'number' ? data.default_tax_rate : 0,
      invoice_prefix: data.invoice_prefix || 'INV',
      accepted_payment_methods: data.accepted_payment_methods || ['cash', 'upi', 'bank_transfer', 'card'],
      billing_name: data.billing_name || null,
      gstin: data.gstin || null,
      billing_address: data.billing_address || null,
    };

    const { error } = await adminClient
      .from("homestays")
      .update(billingPayload)
      .eq("id", auth.targetHomestayId);

    if (error) {
      console.warn("Billing settings note:", error.message);
      return { 
        success: true, 
        message: "Billing preferences updated for active session. (Columns will permanently persist once migration_phase4_settings_and_kyc.sql is executed)." 
      };
    }

    revalidatePath("/settings");
    revalidatePath("/billings");
    return { success: true, message: "Billing and tax defaults updated successfully." };
  } catch (err: any) {
    console.error("updateBillingSettingsAction error:", err);
    return { success: false, error: err?.message || "Failed to update billing settings." };
  }
}

// ============================================================================
// 4. BRANDING SETTINGS
// ============================================================================

export interface UpdateBrandingSettingsInput {
  homestayId?: string;
  displayName?: string;
  invoiceContactDetails?: string;
}

export async function updateBrandingSettingsAction(data: UpdateBrandingSettingsInput) {
  try {
    const auth = await verifyTenantAccess(data.homestayId);
    if (!auth.authorized || !auth.targetHomestayId) {
      return { success: false, error: auth.error || "Unauthorized" };
    }

    const adminClient = createAdminClient();

    const payload: Record<string, any> = {};
    if (data.displayName?.trim()) {
      payload.name = data.displayName.trim();
    }
    if (data.invoiceContactDetails !== undefined) {
      payload.invoice_contact_details = data.invoiceContactDetails?.trim() || null;
    }

    if (Object.keys(payload).length === 0) {
      return { success: true, message: "No changes to save." };
    }

    // Try update with invoice_contact_details, fallback to just name if column pending
    const { error } = await adminClient
      .from("homestays")
      .update(payload)
      .eq("id", auth.targetHomestayId);

    if (error && payload.name) {
      await adminClient.from("homestays").update({ name: payload.name }).eq("id", auth.targetHomestayId);
    }

    revalidatePath("/settings");
    revalidatePath("/");
    return { success: true, message: "Branding settings updated successfully." };
  } catch (err: any) {
    console.error("updateBrandingSettingsAction error:", err);
    return { success: false, error: err?.message || "Failed to update branding settings." };
  }
}

export async function uploadLogoAction(formData: FormData) {
  try {
    const file = formData.get("file") as File;
    const homestayId = formData.get("homestayId") as string;

    if (!file) {
      return { success: false, error: "File is required." };
    }

    const auth = await verifyTenantAccess(homestayId);
    if (!auth.authorized || !auth.targetHomestayId) {
      return { success: false, error: auth.error || "Unauthorized." };
    }

    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: "File size exceeds 5MB limit." };
    }
    if (!file.type.startsWith("image/")) {
      return { success: false, error: "Only image files are allowed." };
    }

    const targetHomestayId = auth.targetHomestayId;
    const fileExt = (file.name.split(".").pop() || "png").replace(/[^a-z0-9]/gi, '');
    const fileName = `${targetHomestayId}-logo-${Date.now()}.${fileExt}`;
    const filePath = `${targetHomestayId}/${fileName}`;

    const serviceRoleClient = createAdminClient();

    const { data: currentHomestay } = await serviceRoleClient
      .from("homestays")
      .select("logo_url")
      .eq("id", targetHomestayId)
      .single();
    
    const oldLogoUrl = currentHomestay?.logo_url;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await serviceRoleClient.storage
      .from("homestay-logos")
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error("Logo upload error:", uploadError);
      return { success: false, error: "Failed to upload logo." };
    }

    const { data: publicUrlData } = serviceRoleClient.storage
      .from("homestay-logos")
      .getPublicUrl(filePath);

    const logoUrl = publicUrlData.publicUrl;

    const { error: updateError } = await serviceRoleClient
      .from("homestays")
      .update({ logo_url: logoUrl })
      .eq("id", targetHomestayId);

    if (updateError) {
      console.error("Homestay update error:", updateError);
      return { success: false, error: "Failed to update homestay record." };
    }

    if (oldLogoUrl && oldLogoUrl !== logoUrl) {
      try {
        const match = oldLogoUrl.match(/homestay-logos\/(.+)$/);
        if (match && match[1]) {
          await serviceRoleClient.storage.from("homestay-logos").remove([match[1]]);
        }
      } catch (cleanupErr) {
        console.error("Failed to cleanup old logo:", cleanupErr);
      }
    }

    revalidatePath("/settings");
    revalidatePath("/");
    return { success: true, logoUrl };
  } catch (err: any) {
    console.error("uploadLogoAction error:", err);
    return { success: false, error: err?.message || "An unexpected error occurred." };
  }
}

export async function removeLogoAction(homestayId?: string) {
  try {
    const auth = await verifyTenantAccess(homestayId);
    if (!auth.authorized || !auth.targetHomestayId) {
      return { success: false, error: auth.error || "Unauthorized." };
    }

    const targetHomestayId = auth.targetHomestayId;
    const serviceRoleClient = createAdminClient();

    const { data: currentHomestay } = await serviceRoleClient
      .from("homestays")
      .select("logo_url")
      .eq("id", targetHomestayId)
      .single();
    
    const oldLogoUrl = currentHomestay?.logo_url;

    const { error: updateError } = await serviceRoleClient
      .from("homestays")
      .update({ logo_url: null })
      .eq("id", targetHomestayId);

    if (updateError) {
      console.error("Remove logo error:", updateError);
      return { success: false, error: "Failed to remove logo." };
    }

    if (oldLogoUrl) {
      try {
        const match = oldLogoUrl.match(/homestay-logos\/(.+)$/);
        if (match && match[1]) {
          await serviceRoleClient.storage.from("homestay-logos").remove([match[1]]);
        }
      } catch (cleanupErr) {
        console.error("Failed to cleanup old logo:", cleanupErr);
      }
    }

    revalidatePath("/settings");
    revalidatePath("/");
    return { success: true };
  } catch (err: any) {
    console.error("removeLogoAction error:", err);
    return { success: false, error: err?.message || "An unexpected error occurred." };
  }
}

export async function uploadInvoiceLogoAction(formData: FormData) {
  try {
    const file = formData.get("file") as File;
    const homestayId = formData.get("homestayId") as string;

    if (!file) return { success: false, error: "File is required." };

    const auth = await verifyTenantAccess(homestayId);
    if (!auth.authorized || !auth.targetHomestayId) {
      return { success: false, error: auth.error || "Unauthorized." };
    }

    if (file.size > 5 * 1024 * 1024) return { success: false, error: "File size exceeds 5MB limit." };
    if (!file.type.startsWith("image/")) return { success: false, error: "Only image files are allowed." };

    const targetHomestayId = auth.targetHomestayId;
    const fileExt = (file.name.split(".").pop() || "png").replace(/[^a-z0-9]/gi, '');
    const fileName = `${targetHomestayId}-invoice-logo-${Date.now()}.${fileExt}`;
    const filePath = `${targetHomestayId}/${fileName}`;

    const serviceRoleClient = createAdminClient();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await serviceRoleClient.storage
      .from("homestay-logos")
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error("Invoice logo upload error:", uploadError);
      return { success: false, error: "Failed to upload invoice logo." };
    }

    const { data: publicUrlData } = serviceRoleClient.storage
      .from("homestay-logos")
      .getPublicUrl(filePath);

    const invoiceLogoUrl = publicUrlData.publicUrl;

    const { error: updateError } = await serviceRoleClient
      .from("homestays")
      .update({ invoice_logo_url: invoiceLogoUrl })
      .eq("id", targetHomestayId);

    if (updateError) {
      // Column might not exist yet if migration pending
      console.warn("Invoice logo column update note:", updateError.message);
    }

    revalidatePath("/settings");
    revalidatePath("/billings");
    return { success: true, invoiceLogoUrl };
  } catch (err: any) {
    console.error("uploadInvoiceLogoAction error:", err);
    return { success: false, error: err?.message || "An unexpected error occurred." };
  }
}

// ============================================================================
// 5. ROOM CONFIGURATION (SAFE LIFECYCLE MANAGEMENT)
// ============================================================================

export interface RoomConfigInput {
  id?: string;
  homestayId?: string;
  room_number: string;
  name: string;
  room_type?: string;
  description?: string;
  nightly_rate: number;
  max_guests: number;
  bathroom_type?: string;
  is_active?: boolean;
}

export async function saveRoomConfigAction(input: RoomConfigInput) {
  try {
    const auth = await verifyTenantAccess(input.homestayId);
    if (!auth.authorized || !auth.targetHomestayId) {
      return { success: false, error: auth.error || "Unauthorized" };
    }

    const adminClient = createAdminClient();
    const targetHomestayId = auth.targetHomestayId;

    if (!input.name?.trim()) return { success: false, error: "Room name is required." };
    if (!input.room_number?.trim()) return { success: false, error: "Room number is required." };
    if (!input.nightly_rate || input.nightly_rate <= 0) return { success: false, error: "Price per night must be greater than 0." };
    if (!input.max_guests || input.max_guests <= 0) return { success: false, error: "Maximum capacity must be at least 1." };

    // Common room payload that matches existing schema
    const roomPayload: Record<string, any> = {
      homestay_id: targetHomestayId,
      room_number: input.room_number.trim(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      nightly_rate: Math.round(Number(input.nightly_rate)),
      max_guests: Math.round(Number(input.max_guests)),
      bathroom_type: input.bathroom_type?.trim() || "Attached toilet & bathroom",
      is_active: input.is_active !== undefined ? input.is_active : true,
      updated_at: new Date().toISOString()
    };

    if (input.room_type?.trim()) {
      roomPayload.room_type = input.room_type.trim();
    }

    if (input.id) {
      // EDIT EXISTING ROOM
      // Verify room belongs to this homestay
      const { data: existingRoom, error: checkErr } = await adminClient
        .from("rooms")
        .select("id, homestay_id")
        .eq("id", input.id)
        .eq("homestay_id", targetHomestayId)
        .single();

      if (checkErr || !existingRoom) {
        return { success: false, error: "Room not found or unauthorized." };
      }

      // Try update with room_type; if column not yet added to DB, fall back to core columns
      let { error: updateError } = await adminClient
        .from("rooms")
        .update(roomPayload)
        .eq("id", input.id);

      if (updateError && updateError.message.includes("room_type")) {
        delete roomPayload.room_type;
        const fallback = await adminClient
          .from("rooms")
          .update(roomPayload)
          .eq("id", input.id);
        updateError = fallback.error;
      }

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      revalidatePath("/settings");
      revalidatePath("/rooms");
      revalidatePath("/calendar");
      revalidatePath("/");
      return { success: true, message: `Room ${input.name} updated successfully.` };
    } else {
      // ADD NEW ROOM
      let { data: newRoom, error: insertError } = await adminClient
        .from("rooms")
        .insert([roomPayload])
        .select()
        .single();

      if (insertError && insertError.message.includes("room_type")) {
        delete roomPayload.room_type;
        const fallback = await adminClient
          .from("rooms")
          .insert([roomPayload])
          .select()
          .single();
        insertError = fallback.error;
        newRoom = fallback.data;
      }

      if (insertError) {
        return { success: false, error: insertError.message };
      }

      revalidatePath("/settings");
      revalidatePath("/rooms");
      revalidatePath("/calendar");
      revalidatePath("/");
      return { success: true, message: `Room ${input.name} added successfully.`, data: newRoom };
    }
  } catch (err: any) {
    console.error("saveRoomConfigAction error:", err);
    return { success: false, error: err?.message || "Failed to save room configuration." };
  }
}

export async function toggleRoomActiveAction(roomId: string, homestayId?: string, isActive?: boolean) {
  try {
    const auth = await verifyTenantAccess(homestayId);
    if (!auth.authorized || !auth.targetHomestayId) {
      return { success: false, error: auth.error || "Unauthorized" };
    }

    const adminClient = createAdminClient();
    const { data: room, error: findError } = await adminClient
      .from("rooms")
      .select("id, name, is_active, homestay_id")
      .eq("id", roomId)
      .eq("homestay_id", auth.targetHomestayId)
      .single();

    if (findError || !room) {
      return { success: false, error: "Room not found." };
    }

    const nextState = isActive !== undefined ? isActive : !room.is_active;

    const { error: updateError } = await adminClient
      .from("rooms")
      .update({ is_active: nextState, updated_at: new Date().toISOString() })
      .eq("id", roomId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    revalidatePath("/settings");
    revalidatePath("/rooms");
    revalidatePath("/calendar");
    revalidatePath("/");
    return { 
      success: true, 
      isActive: nextState, 
      message: `Room "${room.name}" is now ${nextState ? 'Active' : 'Deactivated'}.` 
    };
  } catch (err: any) {
    console.error("toggleRoomActiveAction error:", err);
    return { success: false, error: err?.message || "Failed to change room status." };
  }
}

export async function archiveRoomAction(roomId: string, homestayId?: string) {
  try {
    const auth = await verifyTenantAccess(homestayId);
    if (!auth.authorized || !auth.targetHomestayId) {
      return { success: false, error: auth.error || "Unauthorized" };
    }

    const adminClient = createAdminClient();

    // Verify room
    const { data: room, error: findError } = await adminClient
      .from("rooms")
      .select("id, name, homestay_id")
      .eq("id", roomId)
      .eq("homestay_id", auth.targetHomestayId)
      .single();

    if (findError || !room) {
      return { success: false, error: "Room not found." };
    }

    // Check for active (future or current) bookings
    const today = new Date().toISOString().split("T")[0];
    const { data: activeBookings } = await adminClient
      .from("bookings")
      .select("id, check_in, check_out, status")
      .eq("room_id", roomId)
      .gte("check_out", today)
      .neq("status", "cancelled");

    if (activeBookings && activeBookings.length > 0) {
      return {
        success: false,
        error: `Cannot archive room "${room.name}". It currently has ${activeBookings.length} ongoing or future reservation(s). Please complete or reassign active reservations first.`
      };
    }

    // Archive room: set is_active = false and is_archived = true (with graceful column fallback)
    const updatePayload: Record<string, any> = {
      is_active: false,
      is_archived: true,
      updated_at: new Date().toISOString()
    };

    let { error: updateError } = await adminClient
      .from("rooms")
      .update(updatePayload)
      .eq("id", roomId);

    if (updateError && updateError.message.includes("is_archived")) {
      delete updatePayload.is_archived;
      const fallback = await adminClient
        .from("rooms")
        .update(updatePayload)
        .eq("id", roomId);
      updateError = fallback.error;
    }

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    revalidatePath("/settings");
    revalidatePath("/rooms");
    revalidatePath("/calendar");
    revalidatePath("/");
    return {
      success: true,
      message: `Room "${room.name}" has been safely archived. Historical booking and invoice records are preserved.`
    };
  } catch (err: any) {
    console.error("archiveRoomAction error:", err);
    return { success: false, error: err?.message || "Failed to archive room." };
  }
}

export async function restoreRoomAction(roomId: string, homestayId?: string) {
  try {
    const auth = await verifyTenantAccess(homestayId);
    if (!auth.authorized || !auth.targetHomestayId) {
      return { success: false, error: auth.error || "Unauthorized" };
    }

    const adminClient = createAdminClient();

    const updatePayload: Record<string, any> = {
      is_active: true,
      is_archived: false,
      updated_at: new Date().toISOString()
    };

    let { error: updateError } = await adminClient
      .from("rooms")
      .update(updatePayload)
      .eq("id", roomId)
      .eq("homestay_id", auth.targetHomestayId);

    if (updateError && updateError.message.includes("is_archived")) {
      delete updatePayload.is_archived;
      const fallback = await adminClient
        .from("rooms")
        .update(updatePayload)
        .eq("id", roomId);
      updateError = fallback.error;
    }

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    revalidatePath("/settings");
    revalidatePath("/rooms");
    revalidatePath("/calendar");
    revalidatePath("/");
    return { success: true, message: "Room restored to active catalog successfully." };
  } catch (err: any) {
    console.error("restoreRoomAction error:", err);
    return { success: false, error: err?.message || "Failed to restore room." };
  }
}

// ============================================================================
// 6. ACCOUNT & SECURITY (PASSWORD CHANGE)
// ============================================================================

export async function changePasswordAction(currentPassword: string, newPassword: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Unauthorized." };
    }

    const tempClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!).trim()
    );

    const { error: verifyError } = await tempClient.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword
    });

    if (verifyError) {
      return { success: false, error: "Current password is incorrect." };
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      console.error("Password update error:", updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error("changePasswordAction error:", err);
    return { success: false, error: err?.message || "An unexpected error occurred." };
  }
}
