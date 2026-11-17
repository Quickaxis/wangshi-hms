"use client";

import { useState, useMemo, useEffect } from "react";
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
  ShieldCheck,
  Receipt,
  ArrowLeft,
  Building2,
  MapPin
} from "lucide-react";
import { GlassPanel } from "../ui/GlassPanel";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useHMSContext } from "../providers/HMSProvider";
import { Homestay } from "@/lib/types";

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

export function Sidebar() {
  const pathname = usePathname();
  const { userProfile, homestays, selectedHomestayId } = useHMSContext();

  // Determine which navigation to show
  const isAdminArea = pathname.startsWith('/admin');
  
  // Extract homestayId from route if we are inside a specific homestay
  // e.g. /admin/homestays/12345/rooms
  const homestayMatch = pathname.match(/^\/admin\/homestays\/([^\/]+)/);
  const managingHomestayId = homestayMatch ? homestayMatch[1] : null;
  const managingHomestay = homestays.find((h: Homestay) => h.id === managingHomestayId);

  const currentHomestay = homestays.find((h: Homestay) => h.id === selectedHomestayId)
    || homestays.find((h: Homestay) => h.is_active)
    || homestays[0];

  const activeHomestay = (isAdminArea && managingHomestay) ? managingHomestay : currentHomestay;

  const propertyFullName = activeHomestay?.name || "Wangshi Homestay";
  const displayLocation = activeHomestay?.location 
    || (activeHomestay?.city ? `${activeHomestay.city}, ${activeHomestay.state || ""}` : "Shergaon, Arunachal Pradesh");
  const propertyLogo = activeHomestay?.logo_url || activeHomestay?.invoice_logo_url || null;

  // Compute initials for logo fallback (e.g. "The Conclave" -> "TC", "Wangshi" -> "WH")
  const propertyInitials = useMemo(() => {
    if (!propertyFullName) return "HS";
    const clean = propertyFullName.replace(/[^a-zA-Z0-9\s]/g, " ").trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "HS";
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }, [propertyFullName]);

  // Track image load error to safely fall back to monogram
  const [logoLoadError, setLogoLoadError] = useState(false);
  useEffect(() => {
    setLogoLoadError(false);
  }, [activeHomestay?.id, propertyLogo]);

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
    <GlassPanel className="h-full flex flex-col p-5 lg:p-6 rounded-[32px] overflow-hidden">
      {/* ─── Top Brand & Property Identity Header ─── */}
      <div className="shrink-0 mb-3 pb-3 border-b border-[#E8E5F5] space-y-2.5">
        
        {/* 1. Subtle HOSPIRO Software System Identity */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 relative flex items-center justify-center shrink-0">
              <Image 
                src="/logos/compactlogo.png" 
                alt="HOSPIRO" 
                width={16} 
                height={16} 
                className="w-full h-full object-contain" 
                priority
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold tracking-wider text-[#252342] leading-none uppercase">
                HOSPIRO
              </span>
              <span className="text-[8px] text-[#77758F] font-semibold leading-none">·</span>
              <span className="text-[7.5px] font-semibold text-[#77758F] tracking-[0.14em] uppercase leading-none">
                Hotel Management System
              </span>
            </div>
          </div>
          <span className="text-[8px] font-semibold text-[#5146D8] bg-[#F0EEFF] px-1.5 py-0.5 rounded-full border border-[#5146D8]/15 leading-none">
            HMS
          </span>
        </div>

        {/* 2. Hero Property Identity Card */}
        <div 
          key={activeHomestay?.id || 'active-property'}
          className="w-full bg-[#FFFFFF] border border-[#E8E5F5] rounded-2xl p-3 shadow-[0_4px_16px_rgba(37,35,66,0.04)] hover:border-[#5146D8]/30 transition-all duration-200"
        >
          <div className="flex items-start gap-3">
            {/* Property Logo or Monogram Avatar */}
            <div className="w-11 h-11 rounded-xl bg-[#FAF9FF] border border-[#E8E5F5] flex items-center justify-center overflow-hidden shadow-2xs relative shrink-0">
              {propertyLogo && !logoLoadError ? (
                <Image 
                  src={propertyLogo} 
                  alt={propertyFullName} 
                  fill 
                  className="object-contain p-0.5" 
                  unoptimized
                  onError={() => setLogoLoadError(true)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#F0EEFF] to-[#E6E3FC] text-[#5146D8]">
                  <span className="text-xs font-bold tracking-wider">{propertyInitials}</span>
                </div>
              )}
            </div>

            {/* Property Name & Location */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                <span className="text-[8.5px] uppercase font-bold text-[#5146D8] tracking-widest truncate">
                  {isAdminArea && managingHomestay ? "Managing Property" : "Active Homestay"}
                </span>
              </div>
              <h2 
                className="text-xs lg:text-[13px] font-bold text-[#252342] leading-snug line-clamp-2 uppercase tracking-wide" 
                title={propertyFullName}
              >
                {propertyFullName}
              </h2>
              <p className="text-[10px] text-[#77758F] font-normal leading-tight truncate mt-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 shrink-0 text-[#8B83F6]" />
                <span className="truncate">{displayLocation}</span>
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* ─── 3. Navigation List ─── */}
      <nav className="flex-1 space-y-1 overflow-y-auto hide-scrollbar py-1">
        {currentNavItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#5146D8]/40",
                isActive 
                  ? "bg-[#F0EEFF] text-[#5146D8] font-bold shadow-2xs border border-[#5146D8]/15" 
                  : "text-[#77758F] hover:bg-[#F7F6FC] hover:text-[#252342]"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" strokeWidth={isActive ? 2 : 1.5} />
              <span className="tracking-[0.03em] truncate">{item.name}</span>
            </Link>
          );
        })}
        
        {!isAdminArea && userProfile?.role === 'super_admin' && (
          <>
            <div className="h-px bg-[#E8E5F5] my-2 mx-3" />
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#5146D8]/40",
                pathname.startsWith('/admin')
                  ? "bg-[#F0EEFF] text-[#5146D8] font-bold shadow-2xs border border-[#5146D8]/15" 
                  : "text-[#77758F] hover:bg-[#F7F6FC] hover:text-[#252342]"
              )}
            >
              <ShieldCheck className="h-4 w-4 shrink-0" strokeWidth={pathname.startsWith('/admin') ? 2 : 1.5} />
              <span className="tracking-[0.03em] truncate">Admin</span>
            </Link>
          </>
        )}
      </nav>
    </GlassPanel>
  );
}
