"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function uploadLogoAction(formData: FormData) {
  try {
    const file = formData.get("file") as File;
    const homestayId = formData.get("homestayId") as string;

    if (!file || !homestayId) {
      return { success: false, error: "File and Homestay ID are required." };
    }

    const supabase = await createClient();
    
    // Verify user is logged in
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Unauthorized." };
    }

    // Verify partner belongs to this homestay (or is super admin)
    const { data: partner } = await supabase
      .from("partners")
      .select("role, homestay_id")
      .eq("auth_user_id", user.id)
      .single();

    if (!partner) {
      return { success: false, error: "Partner record not found." };
    }

    // Server-side tenant enforcement: NEVER trust the browser's homestayId for normal partners
    const targetHomestayId = partner.role === 'super_admin' ? homestayId : partner.homestay_id;
    if (!targetHomestayId) {
      return { success: false, error: "No homestay associated with this account." };
    }

    // Server-side file validation
    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: "File size exceeds 5MB limit." };
    }
    if (!file.type.startsWith("image/")) {
      return { success: false, error: "Only image files are allowed." };
    }

    // Upload to Storage
    // Sanitize extension to prevent any possible traversal or injection
    const fileExt = (file.name.split(".").pop() || "png").replace(/[^a-z0-9]/gi, '');
    const fileName = `${targetHomestayId}-${Date.now()}.${fileExt}`;
    const filePath = `${targetHomestayId}/${fileName}`;

    // Use Service Role to ensure upload & DB update works regardless of RLS setup
    const secretKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const serviceRoleClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
      secretKey
    );

    // Get current logo URL before uploading
    const { data: currentHomestay } = await serviceRoleClient
      .from("homestays")
      .select("logo_url")
      .eq("id", targetHomestayId)
      .single();
    
    const oldLogoUrl = currentHomestay?.logo_url;

    // Next.js Server Actions pass Web File objects which can fail in Supabase Node SDK
    // Convert to ArrayBuffer for reliable upload
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

    // Get public URL
    const { data: publicUrlData } = serviceRoleClient.storage
      .from("homestay-logos")
      .getPublicUrl(filePath);

    const logoUrl = publicUrlData.publicUrl;

    // Update homestays table
    const { error: updateError } = await serviceRoleClient
      .from("homestays")
      .update({ logo_url: logoUrl })
      .eq("id", targetHomestayId);

    if (updateError) {
      console.error("Homestay update error:", updateError);
      return { success: false, error: "Failed to update homestay record." };
    }

    // Safely delete the old logo file to prevent orphaned files
    if (oldLogoUrl && oldLogoUrl !== logoUrl) {
      try {
        const match = oldLogoUrl.match(/homestay-logos\/(.+)$/);
        if (match && match[1]) {
          await serviceRoleClient.storage.from("homestay-logos").remove([match[1]]);
        }
      } catch (cleanupErr) {
        console.error("Failed to cleanup old logo:", cleanupErr);
        // Non-fatal error
      }
    }

    return { success: true, logoUrl };
  } catch (err: any) {
    console.error("uploadLogoAction error:", err);
    return { success: false, error: err?.message || "An unexpected error occurred." };
  }
}

export async function removeLogoAction(homestayId: string) {
  try {
    const supabase = await createClient();
    
    // Verify user is logged in
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Unauthorized." };
    }

    // Verify partner belongs to this homestay (or is super admin)
    const { data: partner } = await supabase
      .from("partners")
      .select("role, homestay_id")
      .eq("auth_user_id", user.id)
      .single();

    if (!partner) {
      return { success: false, error: "Partner record not found." };
    }

    // Server-side tenant enforcement
    const targetHomestayId = partner.role === 'super_admin' ? homestayId : partner.homestay_id;
    if (!targetHomestayId) {
      return { success: false, error: "No homestay associated with this account." };
    }

    const serviceRoleClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get current logo URL before deleting
    const { data: currentHomestay } = await serviceRoleClient
      .from("homestays")
      .select("logo_url")
      .eq("id", targetHomestayId)
      .single();
    
    const oldLogoUrl = currentHomestay?.logo_url;

    // Just set logo_url to null
    const { error: updateError } = await serviceRoleClient
      .from("homestays")
      .update({ logo_url: null })
      .eq("id", targetHomestayId);

    if (updateError) {
      console.error("Remove logo error:", updateError);
      return { success: false, error: "Failed to remove logo." };
    }

    // Clean up Storage
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

    return { success: true };
  } catch (err: any) {
    console.error("removeLogoAction error:", err);
    return { success: false, error: err?.message || "An unexpected error occurred." };
  }
}

export async function changePasswordAction(currentPassword: string, newPassword: string) {
  try {
    const supabase = await createClient();
    
    // Verify user is logged in
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Unauthorized." };
    }

    // To verify the current password, we need to sign in with it.
    // However, calling signInWithPassword on the server might set a new session token,
    // which could mess up cookies if not handled right. 
    // Another way is to just use a standard API call without setting cookies,
    // or just rely on supabase.auth.updateUser if we don't strictly enforce current password.
    // The requirement is: "Require the user to enter Current password, New password, Confirm new password".
    // We can do a dummy signInWithPassword to verify, using a fresh client so it doesn't touch cookies.

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

    // Now update the password for the actual logged-in user session
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
