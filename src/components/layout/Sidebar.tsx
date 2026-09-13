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
  Mountain
} from "lucide-react";
import { GlassPanel } from "../ui/GlassPanel";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

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

  return (
    <GlassPanel className="h-full flex flex-col p-6 rounded-[32px]">
      <div className="mb-10 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] flex items-center justify-center shrink-0 mb-2 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
          <Mountain className="w-6 h-6 text-[#F2EEE3]" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-[0.15em] text-[#F5F1E8] leading-tight uppercase">Wangshi</h1>
          <h2 className="text-xs font-medium tracking-[0.2em] text-[#C7C3BA] mt-0.5 uppercase">Homestay</h2>
          <p className="text-[10px] text-[#96928A] mt-2 tracking-wider">Shergaon, Arunachal Pradesh</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1.5">
        {navItems.map((item) => {
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
      </nav>
    </GlassPanel>
  );
}
