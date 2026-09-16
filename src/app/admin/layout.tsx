import { requireSuperAdmin } from "@/lib/auth/admin";
import { redirect, notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requireSuperAdmin();
  
  if (!auth.authorized) {
    if (auth.reason === 'unauthenticated') {
      redirect('/login');
    } else {
      notFound();
    }
  }

  return (
    <div className="flex flex-col h-full space-y-6 overflow-y-auto hide-scrollbar pb-10">
      <div className="flex items-center gap-3 border-b border-[rgba(255,255,255,0.05)] pb-6 mb-2">
        <div className="w-10 h-10 rounded-full bg-[rgba(245,158,11,0.15)] flex items-center justify-center border border-[rgba(245,158,11,0.3)] shadow-[0_0_15px_rgba(245,158,11,0.2)]">
          <ShieldCheck className="w-5 h-5 text-[#F59E0B]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#F5F1E8] tracking-wide">Super Admin Panel</h2>
          <p className="text-xs text-[#96928A] tracking-wider uppercase mt-1">Multi-Homestay Management</p>
        </div>
      </div>
      
      {children}
    </div>
  );
}
