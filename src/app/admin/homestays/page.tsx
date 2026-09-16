import { requireSuperAdmin } from "@/lib/auth/admin";
import { HomestaysClient } from "./HomestaysClient";
import { Homestay } from "@/lib/types";

export default async function AdminHomestaysPage() {
  const { supabase, authorized } = await requireSuperAdmin();
  if (!authorized) return null;

  // Fetch homestays, sort by created_at
  const { data, error } = await supabase
    .from("homestays")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching homestays:", error);
  }

  const homestays: Homestay[] = data || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-sm font-semibold tracking-[0.2em] text-[#C7C3BA] uppercase">Homestays</h3>
          <p className="text-xs text-[#96928A] tracking-wider mt-1">Manage multiple homestay properties</p>
        </div>
      </div>

      <HomestaysClient initialHomestays={homestays} />
    </div>
  );
}
