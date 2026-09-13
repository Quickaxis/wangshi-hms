import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wangshi Homestay - HMS",
  description: "Hotel Management System for Wangshi Homestay",
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
      <body className="min-h-full flex flex-col font-sans text-primary bg-background">
        <AuthProvider>
          <HMSProvider>
            <AppShell>{children}</AppShell>
          </HMSProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
