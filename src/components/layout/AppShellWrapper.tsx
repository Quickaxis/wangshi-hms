"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import { AppShell } from "./AppShell";
import { useAuth } from "@/components/providers/AuthProvider";

const NO_SHELL_ROUTES = ["/login", "/update-password", "/auth/callback"];

export function AppShellWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { partner, isLoading } = useAuth();
  
  // Check if the current route starts with any of the no-shell routes
  const isNoShellRoute = NO_SHELL_ROUTES.some(route => pathname?.startsWith(route));

  // Client-side fallback redirection
  useEffect(() => {
    if (!isLoading && !partner && !isNoShellRoute) {
      router.replace('/login');
    } else if (!isLoading && partner && pathname === '/login') {
      router.replace('/');
    }
  }, [isLoading, partner, pathname, isNoShellRoute, router]);

  // If it's an auth route, render immediately (no shell)
  if (isNoShellRoute) {
    return <>{children}</>;
  }

  // FOR ALL PRIVATE HMS ROUTES:
  // Show a minimal loading state until Supabase confirms the session on the client
  if (isLoading) {
    return (
      <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-[#0b0907]">
        <div className="w-10 h-10 border-2 border-[#f5a000] border-t-transparent rounded-full animate-spin mb-4 shadow-[0_0_15px_rgba(245,160,0,0.2)]"></div>
        <p className="text-[#f5a000] tracking-widest text-xs font-semibold animate-pulse opacity-80">AUTHENTICATING...</p>
      </div>
    );
  }

  // Client-side fallback if the middleware didn't catch a stale session
  if (!isLoading && !partner) {
    // We return null here to prevent flashing the AppShell while the client router redirects
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
