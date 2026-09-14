"use client";

import { useState, ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileDrawer } from "./MobileDrawer";

export function AppShell({ children }: { children: ReactNode }) {
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen md:h-screen w-full overflow-x-hidden md:overflow-hidden relative shadow-[0_0_20px_rgba(0,0,0,0.05)] md:shadow-none">
      {/* Sidebar - hidden on mobile, block on md and up */}
      <div className="hidden md:block w-64 h-full p-4 pr-2">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col min-h-screen md:h-full relative">
        <div className="sticky top-0 z-50 md:static p-4 pl-4 md:pl-2 pb-0 pt-2 md:pt-4">
          <TopBar onMenuClick={() => setIsMobileDrawerOpen(true)} />
        </div>
        <main className="flex-1 flex flex-col md:min-h-0 md:overflow-hidden p-4 md:pl-2 pb-8 md:pb-4 overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* Mobile Additions */}
      <MobileDrawer isOpen={isMobileDrawerOpen} onClose={() => setIsMobileDrawerOpen(false)} />
    </div>
  );
}
