import { requireSuperAdmin } from "@/lib/auth/admin";
import { redirect } from "next/navigation";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Building2, MapPin, Phone, Mail, BedDouble, Users } from "lucide-react";
import Link from "next/link";
import { Homestay } from "@/lib/types";

export default async function HomestayManagePage({ params }: { params: Promise<{ homestayId: string }> }) {
  const { supabase, authorized } = await requireSuperAdmin();
  if (!authorized) {
    redirect("/");
  }

  const { homestayId } = await params;
  
  console.log(`[DEBUG] HomestayManagePage resolving for homestayId: ${homestayId}`);

  // Fetch homestay details
  const { data: homestay, error } = await supabase
    .from("homestays")
    .select("*")
    .eq("id", homestayId)
    .single();
    
  console.log(`[DEBUG] Supabase query result:`, { homestay, error });

  if (!homestay) {
    return (
      <div className="p-8">
        <div className="bg-red-500/20 border border-red-500 p-6 rounded-2xl text-white">
          <h1 className="text-2xl font-bold mb-4">DEBUG: Homestay Not Found</h1>
          <p><strong>homestayId from URL params:</strong> {String(homestayId)}</p>
          <p><strong>Type of homestayId:</strong> {typeof homestayId}</p>
          <p><strong>Supabase Error:</strong> {error ? JSON.stringify(error) : "No error, just returned null"}</p>
          <p>This means either the ID is wrong, or RLS blocked the query.</p>
        </div>
      </div>
    );
  }

  // Fetch rooms count
  const { count: roomsCount } = await supabase
    .from("rooms")
    .select("*", { count: "exact", head: true })
    .eq("homestay_id", homestayId);

  // Fetch partners count
  const { count: partnersCount } = await supabase
    .from("partners")
    .select("*", { count: "exact", head: true })
    .eq("homestay_id", homestayId);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div>
          <Link href="/admin/homestays" className="inline-flex items-center gap-2 text-sm text-[#77758F] hover:text-[#5146D8] font-medium transition-colors mb-4">
            <span className="text-lg leading-none">&larr;</span> Back to Homestays
          </Link>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#24213A] tracking-tight">
                {homestay.name}
              </h1>
              <p className="text-[#77758F] text-sm mt-1">Homestay Overview</p>
            </div>
            <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${homestay.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
              {homestay.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <GlassPanel className="p-6 rounded-2xl flex flex-col gap-4 bg-white border border-[#E8E6F2] shadow-sm">
            <h3 className="text-lg font-bold text-[#24213A] border-b border-[#E8E6F2] pb-3">
              Details
            </h3>
            <div className="space-y-3">
              {homestay.location && (
                <div className="flex items-center gap-3 text-sm text-[#55536A]">
                  <MapPin className="w-5 h-5 text-[#5146D8] shrink-0" />
                  <span>{homestay.location}</span>
                </div>
              )}
              {homestay.phone && (
                <div className="flex items-center gap-3 text-sm text-[#55536A]">
                  <Phone className="w-5 h-5 text-[#5146D8] shrink-0" />
                  <span>{homestay.phone}</span>
                </div>
              )}
              {homestay.email && (
                <div className="flex items-center gap-3 text-sm text-[#55536A]">
                  <Mail className="w-5 h-5 text-[#5146D8] shrink-0" />
                  <span>{homestay.email}</span>
                </div>
              )}
            </div>
          </GlassPanel>

          <div className="flex flex-col gap-4">
            <div>
              <GlassPanel className="p-6 rounded-2xl flex items-center justify-between bg-white border border-[#E8E6F2] shadow-sm hover:border-[#5146D8]/30 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#F0EEFF] flex items-center justify-center border border-[#E0DEF8] group-hover:scale-110 transition-transform">
                    <BedDouble className="w-6 h-6 text-[#5146D8]" />
                  </div>
                  <div>
                    <h4 className="text-[#24213A] font-bold text-lg">Rooms</h4>
                    <p className="text-[#77758F] text-sm mb-2">Manage inventory and pricing</p>
                    <Link href={`/admin/homestays/${homestayId}/rooms`} className="text-[#5146D8] text-sm font-semibold hover:underline inline-flex items-center gap-1">
                      Manage Rooms &rarr;
                    </Link>
                  </div>
                </div>
                <div className="text-3xl font-bold text-[#24213A]">{roomsCount || 0}</div>
              </GlassPanel>
            </div>

            <div>
              <GlassPanel className="p-6 rounded-2xl flex items-center justify-between bg-white border border-[#E8E6F2] shadow-sm hover:border-[#5146D8]/30 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#F0EEFF] flex items-center justify-center border border-[#E0DEF8] group-hover:scale-110 transition-transform">
                    <Users className="w-6 h-6 text-[#5146D8]" />
                  </div>
                  <div>
                    <h4 className="text-[#24213A] font-bold text-lg">Partners</h4>
                    <p className="text-[#77758F] text-sm mb-2">Manage staff access</p>
                    <Link href={`/admin/homestays/${homestayId}/partners`} className="text-[#5146D8] text-sm font-semibold hover:underline inline-flex items-center gap-1">
                      Manage Partners &rarr;
                    </Link>
                  </div>
                </div>
                <div className="text-3xl font-bold text-[#24213A]">{partnersCount || 0}</div>
              </GlassPanel>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
