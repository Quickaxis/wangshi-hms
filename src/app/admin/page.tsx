import { requireSuperAdmin } from "@/lib/auth/admin";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Building2, Home, Users, CheckCircle } from "lucide-react";
import Link from "next/link";

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
    { label: "Total Homestays", value: totalHomestays, icon: Building2, href: "/admin/homestays", color: "text-blue-400" },
    { label: "Active Homestays", value: activeHomestays, icon: CheckCircle, href: "/admin/homestays", color: "text-green-400" },
    { label: "Total Rooms", value: totalRooms, icon: Home, href: "/admin/homestays", color: "text-purple-400" },
    { label: "Total Partners", value: totalPartners, icon: Users, href: "/admin/homestays", color: "text-amber-400" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold tracking-[0.2em] text-[#C7C3BA] uppercase mb-4">Overview</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, idx) => (
            <div key={idx}>
              <GlassPanel className="p-6 rounded-2xl flex flex-col items-start gap-4 hover:bg-[rgba(255,255,255,0.05)] transition-all group h-full">
                <div className="w-10 h-10 rounded-full bg-[rgba(255,255,255,0.05)] flex items-center justify-center shrink-0 border border-[rgba(255,255,255,0.1)] group-hover:scale-110 transition-transform">
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div className="w-full flex flex-col flex-1 justify-between">
                  <div>
                    <div className="text-3xl font-bold text-[#F5F1E8]">{stat.value}</div>
                    <div className="text-xs font-medium text-[#96928A] tracking-wider uppercase mt-1">{stat.label}</div>
                  </div>
                  <Link href={stat.href} className="text-[#F59E0B] text-xs font-semibold hover:underline mt-4 inline-flex items-center gap-1">
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
          <h4 className="text-red-400 font-semibold mb-2">Database Migration Required</h4>
          <p className="text-sm text-[#C7C3BA]">
            The multi-homestay database migration has not been applied yet. The <code>homestays</code> table does not exist or is empty. Please run <code>migration_multi_homestay_safe.sql</code> in your Supabase SQL Editor.
          </p>
        </GlassPanel>
      )}
    </div>
  );
}
