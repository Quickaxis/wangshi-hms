import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Sidebar - hidden on mobile, block on md and up */}
      <div className="hidden md:block w-64 h-full p-4 pr-2">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="p-4 pl-2 md:pl-2 pb-0">
          <TopBar />
        </div>
        <main className="flex-1 overflow-y-auto md:overflow-hidden p-4 pl-2 md:pl-2 flex flex-col min-h-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav could go here */}
    </div>
  );
}
