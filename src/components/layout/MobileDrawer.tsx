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
  X,
  LogOut
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "../providers/AuthProvider";

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

export function MobileDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { partner } = useAuth();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.replace("/login");
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity duration-300 md:hidden",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div 
        className={cn(
          "fixed top-0 left-0 h-full w-[280px] bg-[rgba(20,18,17,0.95)] backdrop-blur-xl border-r border-[rgba(255,255,255,0.05)] shadow-2xl z-[101] flex flex-col transition-transform duration-300 md:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-6 flex flex-col h-full overflow-y-auto hide-scrollbar">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div className="flex flex-col items-start gap-1">
              <div className="w-10 h-10 rounded-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] flex items-center justify-center mb-2 shadow-sm">
                <Mountain className="w-5 h-5 text-[#F5F1E8]" strokeWidth={1.5} />
              </div>
              <h1 className="text-sm font-bold tracking-[0.15em] text-[#F5F1E8] leading-tight uppercase">Wangshi</h1>
              <h2 className="text-[10px] font-bold tracking-[0.2em] text-[#C7C3BA] mt-0.5 uppercase">Homestay</h2>
              <p className="text-[9px] text-[#96928A] mt-1.5 tracking-wider font-medium">Shergaon, Arunachal Pradesh</p>
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-[#96928A] hover:text-[#F2EEE3] transition-colors"
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
                      ? "bg-[rgba(245,158,11,0.15)] text-[#F59E0B] border border-[rgba(245,158,11,0.3)] shadow-[0_0_15px_rgba(245,158,11,0.1)]" 
                      : "text-[#96928A] hover:text-[#F2EEE3] hover:bg-[rgba(255,255,255,0.06)] border border-transparent"
                  )}
                >
                  <item.icon className="h-4 w-4" strokeWidth={isActive ? 2 : 1.5} />
                  <span className="tracking-[0.05em]">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Bottom actions */}
          <div className="mt-8 pt-6 border-t border-[rgba(255,255,255,0.06)] space-y-2">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-[12px] text-sm font-bold text-[#FF6978] hover:bg-[rgba(255,105,120,0.1)] transition-colors text-left"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.5} />
              <span className="tracking-[0.05em]">Logout</span>
            </button>

            {partner && (
              <div className="flex items-center gap-3 px-4 py-3 mt-4">
                <div className="w-8 h-8 rounded-full bg-[rgba(245,158,11,0.2)] border border-[rgba(245,158,11,0.3)] flex items-center justify-center text-[#F2EEE3] font-bold text-xs shrink-0 shadow-[0_0_10px_rgba(245,158,11,0.1)] uppercase">
                  {partner.name.substring(0, 2)}
                </div>
                <div>
                  <div className="text-sm font-bold text-[#F5F1E8] tracking-wide">{partner.name}</div>
                  <div className="text-[10px] text-[#96928A] font-medium tracking-wider">Admin</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
