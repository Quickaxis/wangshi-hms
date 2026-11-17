"use client";

import { useEffect } from "react";

export function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const isLocalhost = Boolean(
      window.location.hostname === "localhost" ||
      window.location.hostname === "[::1]" ||
      window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
    );

    // Service workers require HTTPS in production or localhost in development
    if (window.location.protocol === "https:" || isLocalhost) {
      const register = () => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then((registration) => {
            console.log("[HOSPIRO PWA] Service Worker registered successfully with scope:", registration.scope);
          })
          .catch((error) => {
            console.warn("[HOSPIRO PWA] Service Worker registration failed:", error);
          });
      };

      if (document.readyState === "complete") {
        register();
      } else {
        window.addEventListener("load", register);
      }
    }

    // Monitor Chrome PWA install prompt readiness
    const handleBeforeInstallPrompt = (e: Event) => {
      console.log("[HOSPIRO PWA] App is installable! beforeinstallprompt fired.");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  return null;
}
