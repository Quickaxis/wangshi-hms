import { requireSuperAdmin } from "@/lib/auth/admin";
import { redirect } from "next/navigation";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Users } from "lucide-react";
import Link from "next/link";
import { PartnersClient } from "@/app/admin/partners/PartnersClient";
import { Partner } from "@/lib/types";

export default async function HomestayPartnersPage({ params }: { params: Promise<{ homestayId: string }> }) {
  const { supabase, authorized } = await requireSuperAdmin();
  if (!authorized) {
    redirect("/");
  }

  const { homestayId } = await params;

  // Fetch homestay details
  const { data: homestay } = await supabase
    .from("homestays")
    .select("*")
    .eq("id", homestayId)
    .single();

  if (!homestay) {
    return (
      <div className="p-8">
        <div className="bg-red-500/20 border border-red-500 p-6 rounded-2xl text-white">
          <h1 className="text-2xl font-bold mb-4">DEBUG: Homestay Not Found in Partners Route</h1>
          <p><strong>homestayId from URL params:</strong> {String(homestayId)}</p>
          <p>This means either the ID is wrong, or RLS blocked the query.</p>
        </div>
      </div>
    );
  }

  // Fetch partners for this homestay
  const { data: partners } = await supabase
    .from("partners")
    .select(`
      *,
      homestay:homestays ( id, name )
    `)
    .eq("homestay_id", homestayId)
    .order("name");

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div>
          <Link href="/admin/homestays" className="inline-flex items-center gap-2 text-sm text-[#96928A] hover:text-[#F59E0B] transition-colors mb-4">
            <span className="text-lg leading-none">&larr;</span> Back to Homestays
          </Link>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#F5F1E8] tracking-tight">
                Partners - {homestay.name}
              </h1>
              <p className="text-[#96928A] text-sm mt-1">Manage partners for this homestay</p>
            </div>
            <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${homestay.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {homestay.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        <div className="space-y-12 mt-8">
          <section>
            <div className="flex items-center gap-3 mb-6 border-b border-[rgba(255,255,255,0.05)] pb-4">
              <div className="p-2 bg-[rgba(245,158,11,0.1)] rounded-xl">
                <Users className="w-5 h-5 text-[#F59E0B]" />
              </div>
              <h2 className="text-xl font-bold text-[#F5F1E8]">Partners</h2>
            </div>
            <PartnersClient initialPartners={(partners as Partner[]) || []} homestayId={homestayId} />
          </section>
        </div>

      </div>
    </div>
  );
}
