"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { KycStatus, IdDocumentType } from "@/lib/types";

// Helper to verify caller tenant authority
async function verifyStaffAccess() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { authorized: false, error: "Unauthorized. Please sign in.", partner: null };
  }

  const { data: partner } = await supabase
    .from("partners")
    .select("id, name, email, role, homestay_id, is_active")
    .eq("auth_user_id", user.id)
    .single();

  if (!partner || !partner.is_active) {
    return { authorized: false, error: "Partner account not found or inactive.", partner: null };
  }

  return { authorized: true, error: null, partner };
}

// ============================================================================
// 1. GUEST KYC UPDATE
// ============================================================================

export interface UpdateGuestKycInput {
  guestId: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  id_type?: IdDocumentType | string;
  id_number_masked?: string;
  kyc_status: KycStatus;
  kyc_notes?: string;
}

export async function updateGuestKycAction(input: UpdateGuestKycInput) {
  try {
    const auth = await verifyStaffAccess();
    if (!auth.authorized || !auth.partner) {
      return { success: false, error: auth.error || "Unauthorized" };
    }

    const adminClient = createAdminClient();

    // Verify guest exists and belongs to partner's homestay
    const { data: guest, error: guestErr } = await adminClient
      .from("guests")
      .select("id, homestay_id, name")
      .eq("id", input.guestId)
      .single();

    if (guestErr || !guest) {
      return { success: false, error: "Guest record not found." };
    }

    if (auth.partner.role !== 'super_admin' && guest.homestay_id !== auth.partner.homestay_id) {
      return { success: false, error: "Forbidden: Cross-tenant access is strictly prohibited." };
    }

    // Mask ID number if provided (e.g. keep last 4 digits only)
    let maskedNumber: string | undefined = undefined;
    if (input.id_number_masked) {
      const raw = input.id_number_masked.trim();
      if (raw.length > 4) {
        maskedNumber = "•••• " + raw.slice(-4);
      } else {
        maskedNumber = raw;
      }
    }

    const coreUpdate: Record<string, any> = {
      updated_at: new Date().toISOString()
    };
    if (input.name?.trim()) coreUpdate.name = input.name.trim();
    if (input.phone !== undefined) coreUpdate.phone = input.phone?.trim() || null;
    if (input.email !== undefined) coreUpdate.email = input.email?.trim() || null;

    const kycUpdate: Record<string, any> = {
      ...coreUpdate,
      kyc_status: input.kyc_status,
      id_type: input.id_type || null,
      id_number_masked: maskedNumber || null,
      kyc_notes: input.kyc_notes?.trim() || null,
      address: input.address?.trim() || null,
    };

    // Attempt full update with KYC fields; fall back gracefully if columns are pending migration
    let { error: updateError } = await adminClient
      .from("guests")
      .update(kycUpdate)
      .eq("id", input.guestId);

    if (updateError) {
      console.warn("KYC column update note (falling back to core fields):", updateError.message);
      const { error: fallbackError } = await adminClient
        .from("guests")
        .update(coreUpdate)
        .eq("id", input.guestId);

      if (fallbackError) {
        return { success: false, error: fallbackError.message };
      }

      revalidatePath("/guests");
      return {
        success: true,
        message: "Guest profile updated. (Extended KYC columns will permanently persist in PostgreSQL once migration_phase4_settings_and_kyc.sql is executed)."
      };
    }

    revalidatePath("/guests");
    return { success: true, message: `KYC status for ${guest.name} updated to ${input.kyc_status.replace('_', ' ')}.` };
  } catch (err: any) {
    console.error("updateGuestKycAction error:", err);
    return { success: false, error: err?.message || "Failed to update guest KYC details." };
  }
}

// ============================================================================
// 2. OPTIONAL ID DOCUMENT UPLOAD (STRICTLY PRIVATE & TENANT ISOLATED)
// ============================================================================

export async function uploadGuestIdDocumentAction(formData: FormData) {
  try {
    const file = formData.get("file") as File;
    const guestId = formData.get("guestId") as string;
    const documentSide = (formData.get("documentSide") as string) || "front"; // 'front' | 'back'

    if (!file || !guestId) {
      return { success: false, error: "File and Guest ID are required." };
    }

    const auth = await verifyStaffAccess();
    if (!auth.authorized || !auth.partner) {
      return { success: false, error: auth.error || "Unauthorized." };
    }

    // Validate file size (< 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: "Document file size exceeds 5MB limit." };
    }

    // Validate mime type (JPG, PNG, WEBP, PDF)
    const allowedMime = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedMime.includes(file.type)) {
      return { success: false, error: "Only image files (JPEG, PNG, WEBP) or PDF documents are accepted." };
    }

    const adminClient = createAdminClient();

    // Verify guest belongs to authorized property
    const { data: guest, error: guestErr } = await adminClient
      .from("guests")
      .select("id, homestay_id, name")
      .eq("id", guestId)
      .single();

    if (guestErr || !guest) {
      return { success: false, error: "Guest not found." };
    }

    if (auth.partner.role !== 'super_admin' && guest.homestay_id !== auth.partner.homestay_id) {
      return { success: false, error: "Cross-tenant upload forbidden." };
    }

    const homestayId = guest.homestay_id || auth.partner.homestay_id || "default";
    const fileExt = (file.name.split(".").pop() || "png").replace(/[^a-z0-9]/gi, '');
    const fileName = `${guestId}-${documentSide}-${Date.now()}.${fileExt}`;
    const storagePath = `${homestayId}/${fileName}`;

    // Read buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Try upload to private bucket 'guest-id-documents'
    let bucketName = "guest-id-documents";
    let { error: uploadError } = await adminClient.storage
      .from(bucketName)
      .upload(storagePath, buffer, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: true
      });

    if (uploadError) {
      // If private bucket is not yet created in live Supabase, check homestay-logos or inform staff
      console.warn("Storage upload note:", uploadError.message);
      return {
        success: false,
        error: "Private storage bucket 'guest-id-documents' is proposed in local migration scripts/migration_phase4_settings_and_kyc.sql. Please approve database migration to enable document upload storage."
      };
    }

    // Generate signed URL (expires in 1 hour) - NEVER a public URL
    const { data: signedData, error: signError } = await adminClient.storage
      .from(bucketName)
      .createSignedUrl(storagePath, 3600);

    const pathColumn = documentSide === "back" ? "id_back_path" : "id_front_path";
    const legacyUrlColumn = documentSide === "back" ? "id_back_url" : "id_front_url";

    // Update guest record with private storage object path (never public URL)
    const updatePayload: Record<string, any> = {
      [pathColumn]: storagePath,
      [legacyUrlColumn]: storagePath,
      kyc_status: "pending",
      updated_at: new Date().toISOString()
    };

    let { error: updateErr } = await adminClient
      .from("guests")
      .update(updatePayload)
      .eq("id", guestId);

    // If id_front_path/id_back_path column pending migration, fall back to legacyUrlColumn
    if (updateErr && updateErr.message.includes(pathColumn)) {
      delete updatePayload[pathColumn];
      await adminClient
        .from("guests")
        .update(updatePayload)
        .eq("id", guestId);
    }

    revalidatePath("/guests");
    return {
      success: true,
      storagePath,
      message: `${documentSide === 'back' ? 'Back' : 'Front'} ID document uploaded successfully.`
    };
  } catch (err: any) {
    console.error("uploadGuestIdDocumentAction error:", err);
    return { success: false, error: err?.message || "Failed to upload ID document." };
  }
}

// ============================================================================
// 3. SECURE SHORT-LIVED SIGNED URL RETRIEVAL
// ============================================================================

export async function getGuestDocumentSignedUrlAction(guestId: string, documentSide: "front" | "back") {
  try {
    const auth = await verifyStaffAccess();
    if (!auth.authorized || !auth.partner) {
      return { success: false, error: auth.error || "Unauthorized", signedUrl: null };
    }

    const adminClient = createAdminClient();

    // Verify guest belongs to authorized property
    const { data: guest, error: guestErr } = await adminClient
      .from("guests")
      .select("*")
      .eq("id", guestId)
      .single();

    if (guestErr || !guest) {
      return { success: false, error: "Guest not found.", signedUrl: null };
    }

    if (auth.partner.role !== 'super_admin' && guest.homestay_id !== auth.partner.homestay_id) {
      return { success: false, error: "Cross-tenant access strictly forbidden.", signedUrl: null };
    }

    const storagePath = documentSide === "back"
      ? (guest.id_back_path || guest.id_back_url)
      : (guest.id_front_path || guest.id_front_url);

    if (!storagePath) {
      return { success: false, error: `No ${documentSide} ID document uploaded for this guest.`, signedUrl: null };
    }

    // Generate short-lived signed URL (valid for 5 minutes / 300 seconds only)
    const { data: signedData, error: signError } = await adminClient.storage
      .from("guest-id-documents")
      .createSignedUrl(storagePath, 300);

    if (signError || !signedData?.signedUrl) {
      console.error("Sign error:", signError);
      return { success: false, error: "Unable to generate secure signed URL.", signedUrl: null };
    }

    return { success: true, signedUrl: signedData.signedUrl };
  } catch (err: any) {
    console.error("getGuestDocumentSignedUrlAction error:", err);
    return { success: false, error: err?.message || "Error generating document view link.", signedUrl: null };
  }
}

// ============================================================================
// 4. REMOVE ID DOCUMENT (RETENTION POLICY COMPLIANCE)
// ============================================================================

export async function removeGuestIdDocumentAction(guestId: string, documentSide: "front" | "back") {
  try {
    const auth = await verifyStaffAccess();
    if (!auth.authorized || !auth.partner) {
      return { success: false, error: auth.error || "Unauthorized" };
    }

    const adminClient = createAdminClient();

    const { data: guest, error: guestErr } = await adminClient
      .from("guests")
      .select("*")
      .eq("id", guestId)
      .single();

    if (guestErr || !guest) {
      return { success: false, error: "Guest not found." };
    }

    if (auth.partner.role !== 'super_admin' && guest.homestay_id !== auth.partner.homestay_id) {
      return { success: false, error: "Forbidden" };
    }

    const storagePath = documentSide === "back"
      ? (guest.id_back_path || guest.id_back_url)
      : (guest.id_front_path || guest.id_front_url);

    const pathColumn = documentSide === "back" ? "id_back_path" : "id_front_path";
    const legacyUrlColumn = documentSide === "back" ? "id_back_url" : "id_front_url";

    if (storagePath) {
      try {
        await adminClient.storage.from("guest-id-documents").remove([storagePath]);
      } catch (e) {
        console.warn("Storage deletion note:", e);
      }
    }

    const updatePayload: Record<string, any> = {
      [pathColumn]: null,
      [legacyUrlColumn]: null,
      updated_at: new Date().toISOString()
    };

    let { error: updateErr } = await adminClient
      .from("guests")
      .update(updatePayload)
      .eq("id", guestId);

    if (updateErr && updateErr.message.includes(pathColumn)) {
      delete updatePayload[pathColumn];
      await adminClient
        .from("guests")
        .update(updatePayload)
        .eq("id", guestId);
    }

    revalidatePath("/guests");
    return { success: true, message: "Document removed successfully." };
  } catch (err: any) {
    console.error("removeGuestIdDocumentAction error:", err);
    return { success: false, error: err?.message || "Failed to remove document." };
  }
}

// ============================================================================
// 4. GUEST PROFILE & STAY HISTORY (RECEPTION QUERY)
// ============================================================================

export async function getGuestProfileAndHistoryAction(guestPhone: string, homestayId?: string) {
  try {
    const auth = await verifyStaffAccess();
    if (!auth.authorized || !auth.partner) {
      return { success: false, error: auth.error || "Unauthorized", data: null };
    }

    const adminClient = createAdminClient();
    const targetHomestayId = auth.partner.role === 'super_admin' ? (homestayId || auth.partner.homestay_id) : auth.partner.homestay_id;

    if (!guestPhone?.trim()) {
      return { success: false, error: "Phone number required.", data: null };
    }

    // Find all guests matching this phone in this homestay
    let guestQuery = adminClient
      .from("guests")
      .select(`
        id,
        booking_id,
        name,
        phone,
        email,
        is_primary,
        created_at,
        homestay_id,
        bookings (
          id,
          check_in,
          check_out,
          status,
          total_amount,
          number_of_guests,
          created_at,
          rooms ( name, room_number )
        )
      `)
      .eq("phone", guestPhone.trim());

    if (targetHomestayId) {
      guestQuery = guestQuery.eq("homestay_id", targetHomestayId);
    }

    const { data: records, error } = await guestQuery;

    if (error) {
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: records || [] };
  } catch (err: any) {
    console.error("getGuestProfileAndHistoryAction error:", err);
    return { success: false, error: err?.message || "Failed to fetch stay history.", data: null };
  }
}

