"use client";

import { 
  LayoutDashboard,
  Inbox, 
  DoorClosed, 
  Calendar, 
  BookOpen, 
  Users, 
  BarChart3, 
  Handshake, 
  Settings,
  Mountain,
  X,
  LogOut,
  ShieldCheck,
  Receipt
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "../providers/AuthProvider";
import { useHMSContext } from "../providers/HMSProvider";

const navItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Rooms", href: "/rooms", icon: DoorClosed },
  { name: "Calendar", href: "/calendar", icon: Calendar },
  { name: "Bookings", href: "/bookings", icon: BookOpen },
  { name: "Billings", href: "/billings", icon: Receipt },
  { name: "Website Requests", href: "/requests", icon: Inbox },
  { name: "Guests", href: "/guests", icon: Users },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Partners", href: "/partners", icon: Handshake },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function MobileDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { partner } = useAuth();
  const { userProfile, homestays, selectedHomestayId } = useHMSContext();

  const currentHomestay = homestays.find(h => h.id === selectedHomestayId) 
    || homestays.find(h => h.is_active) 
    || homestays[0];
  const propertyFullName = currentHomestay?.name || "Wangshi Homestay";
  const displayLocation = currentHomestay?.location 
    || (currentHomestay?.city ? `${currentHomestay.city}, ${currentHomestay.state || ""}` : "Shergaon, Arunachal Pradesh");
  const mobileLogo = currentHomestay?.logo_url || currentHomestay?.invoice_logo_url || null;

  const mobileInitials = (() => {
    if (!propertyFullName) return "HS";
    const clean = propertyFullName.replace(/[^a-zA-Z0-9\s]/g, " ").trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "HS";
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  })();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.replace("/login");
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/30 backdrop-blur-sm z-[100] transition-opacity duration-300 md:hidden",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div 
        className={cn(
          "fixed top-0 left-0 h-full w-[280px] bg-[#FFFFFF] border-r border-[#E8E5F5] shadow-2xl z-[101] flex flex-col transition-transform duration-300 md:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-6 flex flex-col h-full overflow-y-auto hide-scrollbar">
          {/* Header */}
          <div className="flex justify-between items-start mb-6 pb-4 border-b border-[#E8E5F5]">
            <div className="flex flex-col items-start gap-3 w-full pr-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  <Image
                    src="/logos/compactlogo.png"
                    alt="HOSPIRO"
                    width={20}
                    height={20}
                    className="w-full h-full object-contain"
                    priority
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[#252342] tracking-wider block leading-none">HOSPIRO</span>
                  <span className="text-[9px] text-[#77758F] font-semibold leading-none">·</span>
                  <span className="text-[7.5px] uppercase tracking-[0.14em] text-[#77758F] font-semibold block leading-none">Hotel Management System</span>
                </div>
              </div>

              {/* Selected Property Card */}
              <div 
                key={currentHomestay?.id || 'mobile-property'}
                className="w-full bg-[#FAF9FF] border border-[#E8E5F5] rounded-xl p-2.5 shadow-2xs flex items-center gap-2.5"
              >
                <div className="w-9 h-9 rounded-lg bg-white border border-[#E8E5F5] flex items-center justify-center overflow-hidden shrink-0 relative">
                  {mobileLogo ? (
                    <Image 
                      src={mobileLogo} 
                      alt={propertyFullName} 
                      fill 
                      className="object-contain p-0.5" 
                      unoptimized 
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#F0EEFF] to-[#E6E3FC] text-[#5146D8]">
                      <span className="text-[10px] font-bold tracking-wider">{mobileInitials}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[8px] uppercase font-bold text-[#5146D8] tracking-widest block mb-0.5">
                    Active Homestay
                  </span>
                  <h2 className="text-xs font-bold text-[#252342] truncate uppercase leading-tight" title={propertyFullName}>
                    {propertyFullName}
                  </h2>
                  <p className="text-[9px] text-[#77758F] mt-0.5 truncate font-normal">
                    {displayLocation}
                  </p>
                </div>
              </div>
            </div>

            <button 
              onClick={onClose}
              className="p-1.5 text-[#77758F] hover:text-[#252342] hover:bg-[#F0EEFF] rounded-lg transition-colors shrink-0"
              title="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-[12px] text-sm font-bold transition-all duration-300",
                    isActive 
                      ? "bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8] shadow-sm" 
                      : "text-[#77758F] hover:text-[#252342] hover:bg-[#F7F6FC] border border-transparent"
                  )}
                >
                  <item.icon className="h-4 w-4" strokeWidth={isActive ? 2 : 1.5} />
                  <span className="tracking-[0.05em]">{item.name}</span>
                </Link>
              );
            })}

            {userProfile?.role === 'super_admin' && (
              <>
                <div className="h-px bg-[#E8E5F5] my-2 mx-4" />
                <Link
                  href="/admin"
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-[12px] text-sm font-bold transition-all duration-300",
                    pathname.startsWith('/admin')
                      ? "bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8] shadow-sm" 
                      : "text-[#77758F] hover:text-[#24213A] hover:bg-[#F7F7FC] border border-transparent"
                  )}
                >
                  <ShieldCheck className="h-4 w-4" strokeWidth={pathname.startsWith('/admin') ? 2 : 1.5} />
                  <span className="tracking-[0.05em]">Admin</span>
                </Link>
              </>
            )}
          </nav>

          {/* Bottom actions */}
          <div className="mt-8 pt-6 border-t border-[#E8E7F2] space-y-2">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-[12px] text-sm font-bold text-[#EF4444] hover:bg-[#FEF2F2] transition-colors text-left"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.5} />
              <span className="tracking-[0.05em]">Logout</span>
            </button>

            {partner && (
              <div className="flex items-center gap-3 px-4 py-3 mt-4">
                <div className="w-8 h-8 rounded-full bg-[#F0EEFF] border border-[#E0DEF8] flex items-center justify-center text-[#5146D8] font-bold text-xs shrink-0 shadow-sm uppercase">
                  {partner.name.substring(0, 2)}
                </div>
                <div>
                  <div className="text-sm font-bold text-[#24213A] tracking-wide">{partner.name}</div>
                  <div className="text-[10px] text-[#77758F] font-medium tracking-wider">Admin</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
