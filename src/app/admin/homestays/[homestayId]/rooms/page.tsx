import { requireSuperAdmin } from "@/lib/auth/admin";
import { redirect } from "next/navigation";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { BedDouble, Users, MapPin, Phone, Mail } from "lucide-react";
import Link from "next/link";
import { RoomsClient } from "@/app/admin/rooms/RoomsClient";
import { DbRoom } from "@/lib/types";

export default async function HomestayRoomsPage({ params }: { params: Promise<{ homestayId: string }> }) {
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
          <h1 className="text-2xl font-bold mb-4">DEBUG: Homestay Not Found in Rooms Route</h1>
          <p><strong>homestayId from URL params:</strong> {String(homestayId)}</p>
          <p>This means either the ID is wrong, or RLS blocked the query.</p>
        </div>
      </div>
    );
  }

  // Fetch rooms for this homestay
  const { data: rooms } = await supabase
    .from("rooms")
    .select(`
      *,
      homestay:homestays ( id, name )
    `)
    .eq("homestay_id", homestayId)
    .order("room_number");

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header & Breadcrumb */}
        <div>
          <Link href="/admin/homestays" className="inline-flex items-center gap-2 text-sm text-[#96928A] hover:text-[#F59E0B] transition-colors mb-4">
            <span className="text-lg leading-none">&larr;</span> Back to Homestays
          </Link>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#F5F1E8] tracking-tight">
                Rooms - {homestay.name}
              </h1>
              <p className="text-[#96928A] text-sm mt-1">Manage rooms for this homestay</p>
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
                <BedDouble className="w-5 h-5 text-[#F59E0B]" />
              </div>
              <h2 className="text-xl font-bold text-[#F5F1E8]">Rooms</h2>
            </div>
            <RoomsClient initialRooms={(rooms as DbRoom[]) || []} homestayId={homestayId} />
          </section>
        </div>

      </div>
    </div>
  );
}
