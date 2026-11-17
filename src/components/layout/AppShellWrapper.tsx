"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import Image from "next/image";
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
  // Show a branded loading state until Supabase confirms the session on the client
  if (isLoading) {
    return (
      <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-[#F7F6FC]">
        <div className="flex flex-col items-center text-center p-8">
          <div className="w-16 h-16 mb-4 relative flex items-center justify-center">
            <div className="absolute -inset-2 rounded-2xl border-2 border-[#5146D8] border-t-transparent animate-spin" />
            <Image
              src="/logos/compactlogo.png"
              alt="HOSPIRO"
              width={48}
              height={48}
              className="w-12 h-12 object-contain drop-shadow-[0_4px_12px_rgba(81,70,216,0.22)]"
              priority
            />
          </div>
          <span className="text-base font-bold text-[#252342] tracking-wide block">HOSPIRO</span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-[#77758F] font-semibold block mt-0.5 mb-3">
            Hotel Management System
          </span>
          <p className="text-[#5146D8] tracking-widest text-[10px] font-semibold animate-pulse opacity-90">
            AUTHENTICATING...
          </p>
        </div>
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
