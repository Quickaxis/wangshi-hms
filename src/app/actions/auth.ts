"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function verifyAndLinkPartner() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { success: false, error: "Authentication failed. Please try again." };
  }

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("*")
    .eq("email", user.email)
    .single();

  if (partnerError || !partner) {
    return { success: false, error: "Access denied. Your account is not authorized." };
  }

  if (partner.is_active === false) {
    return { success: false, error: "Your account has been deactivated." };
  }

  if (!partner.auth_user_id) {
    const supabaseAdmin = createAdminClient();
    const { error: updateError } = await supabaseAdmin
      .from("partners")
      .update({ auth_user_id: user.id })
      .eq("id", partner.id)
      .is("auth_user_id", null);

    if (updateError) {
      console.error("Failed to link auth_user_id:", updateError);
      return { success: false, error: "Failed to setup authorization link." };
    }
  } else if (partner.auth_user_id !== user.id) {
    return { success: false, error: "Access denied. Your account is not authorized." };
  }

  return { success: true };
}
