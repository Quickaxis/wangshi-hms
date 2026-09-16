"use client";

import { 
  LayoutDashboard, 
  DoorClosed, 
  Calendar, 
  BookOpen, 
  Users, 
  BarChart3, 
  Handshake, 
  Settings,
  Mountain,
  ShieldCheck
} from "lucide-react";
import { GlassPanel } from "../ui/GlassPanel";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useHMSContext } from "../providers/HMSProvider";
import { Homestay } from "@/lib/types";
import { ArrowLeft, Building2 } from "lucide-react";

const navItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Rooms", href: "/rooms", icon: DoorClosed },
  { name: "Calendar", href: "/calendar", icon: Calendar },
  { name: "Bookings", href: "/bookings", icon: BookOpen },
  { name: "Guests", href: "/guests", icon: Users },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Partners", href: "/partners", icon: Handshake },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { userProfile, homestays, selectedHomestayId } = useHMSContext();

  const currentHomestay = homestays.find((h: Homestay) => h.id === selectedHomestayId);
  const displayName = currentHomestay?.name?.split(' ')[0] || "Wangshi";
  const displaySubtitle = currentHomestay?.name?.split(' ').slice(1).join(' ') || "Homestay";
  const displayLocation = currentHomestay?.location || "Shergaon, Arunachal Pradesh";

  // Determine which navigation to show
  const isAdminArea = pathname.startsWith('/admin');
  
  // Extract homestayId from route if we are inside a specific homestay
  // e.g. /admin/homestays/12345/rooms
  const homestayMatch = pathname.match(/^\/admin\/homestays\/([^\/]+)/);
  const managingHomestayId = homestayMatch ? homestayMatch[1] : null;
  const managingHomestay = homestays.find((h: Homestay) => h.id === managingHomestayId);

  // General Admin Nav Items
  const adminNavItems = [
    { name: "Overview", href: "/admin", icon: LayoutDashboard },
    { name: "Homestays", href: "/admin/homestays", icon: Building2 },
    { name: "Back to HMS", href: "/rooms", icon: ArrowLeft },
  ];

  // Specific Homestay Admin Nav Items
  const homestayAdminNavItems = [
    { name: "Homestay Overview", href: `/admin/homestays/${managingHomestayId}`, icon: LayoutDashboard },
    { name: "Rooms", href: `/admin/homestays/${managingHomestayId}/rooms`, icon: DoorClosed },
    { name: "Partners", href: `/admin/homestays/${managingHomestayId}/partners`, icon: Handshake },
    { name: "Back to Homestays", href: "/admin/homestays", icon: ArrowLeft },
  ];

  const currentNavItems = isAdminArea 
    ? (managingHomestayId ? homestayAdminNavItems : adminNavItems)
    : navItems;

  return (
    <GlassPanel className="h-full flex flex-col p-6 rounded-[32px]">
      <div className="mb-10 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] flex items-center justify-center shrink-0 mb-2 shadow-[0_0_15px_rgba(245,158,11,0.1)] overflow-hidden">
          {(isAdminArea && managingHomestay?.logo_url) || (!isAdminArea && currentHomestay?.logo_url) ? (
            <Image 
              src={(isAdminArea && managingHomestay ? managingHomestay.logo_url : currentHomestay?.logo_url) || ''} 
              alt="Homestay Logo" 
              width={48} 
              height={48} 
              className="w-full h-full object-cover" 
            />
          ) : (
            <Mountain className="w-6 h-6 text-[#F2EEE3]" strokeWidth={1.5} />
          )}
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-[0.15em] text-[#F5F1E8] leading-tight uppercase">
            {isAdminArea && managingHomestay ? managingHomestay.name : displayName}
          </h1>
          <h2 className="text-xs font-medium tracking-[0.2em] text-[#C7C3BA] mt-0.5 uppercase">
            {isAdminArea && managingHomestay ? "Managing" : displaySubtitle}
          </h2>
          <p className="text-[10px] text-[#96928A] mt-2 tracking-wider">
            {isAdminArea && managingHomestay ? managingHomestay.location : displayLocation}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1.5">
        {currentNavItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-full text-sm font-medium transition-all duration-300",
                isActive 
                  ? "bg-[rgba(245,158,11,0.1)] text-[#F2EEE3] border border-[rgba(245,158,11,0.2)] shadow-[inset_0_0_12px_rgba(245,158,11,0.1)]" 
                  : "text-[#96928A] hover:bg-[rgba(255,255,255,0.03)] hover:text-[#C7C3BA] border border-transparent"
              )}
            >
              <item.icon className="h-4 w-4" strokeWidth={isActive ? 2 : 1.5} />
              <span className="tracking-[0.05em]">{item.name}</span>
            </Link>
          );
        })}
        
        {!isAdminArea && userProfile?.role === 'super_admin' && (
          <>
            <div className="h-px bg-[rgba(255,255,255,0.05)] my-2 mx-4" />
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-full text-sm font-medium transition-all duration-300",
                pathname.startsWith('/admin')
                  ? "bg-[rgba(245,158,11,0.1)] text-[#F2EEE3] border border-[rgba(245,158,11,0.2)] shadow-[inset_0_0_12px_rgba(245,158,11,0.1)]" 
                  : "text-[#96928A] hover:bg-[rgba(255,255,255,0.03)] hover:text-[#C7C3BA] border border-transparent"
              )}
            >
              <ShieldCheck className="h-4 w-4" strokeWidth={pathname.startsWith('/admin') ? 2 : 1.5} />
              <span className="tracking-[0.05em]">Admin</span>
            </Link>
          </>
        )}
      </nav>
    </GlassPanel>
  );
}
