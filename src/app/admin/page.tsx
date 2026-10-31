import { requireSuperAdmin } from "@/lib/auth/admin";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Building2, Home, Users, CheckCircle, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { getAdminEnvDiagnostic } from "@/lib/supabase/admin";

export default async function AdminOverviewPage() {
  const { supabase, authorized } = await requireSuperAdmin();
  if (!authorized) return null;

  // Fetch counts safely. If tables don't exist yet (migration not run), these will gracefully return 0.
  const fetchCount = async (table: string, match?: Record<string, any>) => {
    let query = supabase.from(table).select('*', { count: 'exact', head: true });
    if (match) {
      query = query.match(match);
    }
    const { count, error } = await query;
    if (error) {
      console.warn(`Admin Overview - Error fetching ${table} count:`, error.message);
      return 0;
    }
    return count || 0;
  };

  const totalHomestays = await fetchCount('homestays');
  const activeHomestays = await fetchCount('homestays', { is_active: true });
  const totalRooms = await fetchCount('rooms');
  const totalPartners = await fetchCount('partners');

  const stats = [
    { label: "Total Homestays", value: totalHomestays, icon: Building2, href: "/admin/homestays", color: "text-[#5146D8]" },
    { label: "Active Homestays", value: activeHomestays, icon: CheckCircle, href: "/admin/homestays", color: "text-[#059669]" },
    { label: "Total Rooms", value: totalRooms, icon: Home, href: "/admin/homestays", color: "text-[#8B83F6]" },
    { label: "Total Partners", value: totalPartners, icon: Users, href: "/admin/homestays", color: "text-[#D97706]" },
  ];

  const envDiagnostic = getAdminEnvDiagnostic();

  return (
    <div className="space-y-8">
      {!envDiagnostic.isReady && (
        <GlassPanel className="p-6 rounded-2xl border border-amber-500/30 bg-amber-500/10">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-amber-800 font-semibold mb-1">Production Configuration Notice</h4>
              <p className="text-sm text-[#77758F]">
                {envDiagnostic.issue}
              </p>
              <p className="text-xs text-[#77758F] mt-2">
                Administrative operations (Add Partner, Reset Partner Password, Delete Homestay, Delete Room) require <code>SUPABASE_SERVICE_ROLE_KEY</code> to be configured in your Vercel Project Settings for the Production environment.
              </p>
            </div>
          </div>
        </GlassPanel>
      )}

      <div>
        <h3 className="text-sm font-semibold tracking-[0.2em] text-[#24213A] uppercase mb-4">Overview</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, idx) => (
            <div key={idx}>
              <GlassPanel className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E8E7F2] shadow-sm flex flex-col items-start gap-4 hover:border-[#5146D8]/30 transition-all group h-full">
                <div className="w-10 h-10 rounded-full bg-[#F0EEFF] flex items-center justify-center shrink-0 border border-[#E0DEF8] group-hover:scale-110 transition-transform">
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div className="w-full flex flex-col flex-1 justify-between">
                  <div>
                    <div className="text-3xl font-bold text-[#24213A]">{stat.value}</div>
                    <div className="text-xs font-medium text-[#77758F] tracking-wider uppercase mt-1">{stat.label}</div>
                  </div>
                  <Link href={stat.href} className="text-[#5146D8] text-xs font-semibold hover:underline mt-4 inline-flex items-center gap-1">
                    Manage &rarr;
                  </Link>
                </div>
              </GlassPanel>
            </div>
          ))}
        </div>
      </div>
      
      {totalHomestays === 0 && (
        <GlassPanel className="p-6 rounded-2xl border border-red-500/20 bg-red-500/5">
          <h4 className="text-red-600 font-semibold mb-2">Database Migration Required</h4>
          <p className="text-sm text-[#77758F]">
            The multi-homestay database migration has not been applied yet. The <code>homestays</code> table does not exist or is empty. Please run <code>migration_multi_homestay_safe.sql</code> in your Supabase SQL Editor.
          </p>
        </GlassPanel>
      )}
    </div>
  );
}
