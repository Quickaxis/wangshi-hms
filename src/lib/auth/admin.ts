import { createClient } from "@/lib/supabase/server";
import { Partner } from "@/lib/types";

export async function requireSuperAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { authorized: false as const, reason: 'unauthenticated' as const };
  }

  const { data: partner } = await supabase
    .from("partners")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  if (!partner || partner.role !== 'super_admin' || !partner.is_active) {
    console.log("[DEBUG] requireSuperAdmin failed:", { partner, role: partner?.role, is_active: partner?.is_active });
    return { authorized: false as const, reason: 'unauthorized' as const };
  }

  console.log("[DEBUG] requireSuperAdmin succeeded for user:", user.email);
  return { authorized: true as const, partner: partner as Partner, supabase };
}
