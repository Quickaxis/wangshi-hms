"use client";

import { LayoutDashboard, DoorClosed, Calendar, BookOpen, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { GlassPanel } from "../ui/GlassPanel";

interface BottomNavProps {
  onMoreClick: () => void;
}

const navItems = [
  { name: "Home", href: "/", icon: LayoutDashboard },
  { name: "Rooms", href: "/rooms", icon: DoorClosed },
  { name: "Calendar", href: "/calendar", icon: Calendar },
  { name: "Bookings", href: "/bookings", icon: BookOpen },
];

export function BottomNav({ onMoreClick }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <div className="fixed bottom-0 left-0 right-0 w-full max-w-[430px] mx-auto z-[100] md:hidden">
      {/* SafeArea support for modern mobile devices */}
      <div className="pb-safe bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="w-full flex justify-around items-center px-2 py-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all duration-300 min-w-[60px]",
                  isActive ? "text-[#F59E0B]" : "text-gray-400 hover:text-gray-600"
                )}
              >
                <div className={cn(
                  "px-3 py-1 rounded-full transition-all duration-300",
                  isActive && "bg-amber-50"
                )}>
                  <item.icon className="h-5 w-5" strokeWidth={isActive ? 2 : 1.5} />
                </div>
                <span className={cn(
                  "text-[10px] font-bold tracking-wide mt-0.5",
                  isActive ? "text-gray-900" : ""
                )}>
                  {item.name}
                </span>
              </Link>
            );
          })}

          <button
            onClick={onMoreClick}
            className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all duration-300 min-w-[60px] text-gray-400 hover:text-gray-600"
          >
            <div className="px-3 py-1 rounded-full">
              <MoreHorizontal className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <span className="text-[10px] font-bold tracking-wide mt-0.5">More</span>
          </button>
        </div>
      </div>
    </div>
  );
}
