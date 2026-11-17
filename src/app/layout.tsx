import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { AppShellWrapper } from "@/components/layout/AppShellWrapper";
import { PwaRegistrar } from "@/components/pwa/PwaRegistrar";

const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#5146D8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "HOSPIRO - Hotel Management System",
  description: "Next-Generation Property & Hotel Management System for Homestays",
  applicationName: "HOSPIRO",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HOSPIRO",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/logos/bwoserfavicon.png", type: "image/png" },
      { url: "/icon.png", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/logos/faviconapplogo.png", type: "image/png" },
      { url: "/apple-icon.png", type: "image/png" },
    ],
    shortcut: "/logos/bwoserfavicon.png",
  },
  manifest: "/manifest.webmanifest",
};

import { HMSProvider } from "@/components/providers/HMSProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans text-[#252342] bg-background">
        <PwaRegistrar />
        <AuthProvider>
          <HMSProvider>
            <AppShellWrapper>{children}</AppShellWrapper>
          </HMSProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
