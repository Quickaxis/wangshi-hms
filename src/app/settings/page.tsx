"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { Settings as SettingsIcon, Info } from "lucide-react";
import { useHMSContext } from "@/components/providers/HMSProvider";

export default function SettingsPage() {
  const { userProfile, homestays, selectedHomestayId } = useHMSContext();
  const currentHomestay = homestays.find(h => h.id === selectedHomestayId);

  return (
    <div className="flex flex-col h-full overflow-y-auto hide-scrollbar space-y-6 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 md:text-[#F5F1E8]">Settings</h2>
          <p className="text-gray-500 md:text-[#96928A] mt-1 text-xs md:text-sm tracking-wide">
            Manage your account and preferences.
          </p>
        </div>
      </div>

      <GlassPanel className="p-6 md:p-8 rounded-[24px] bg-transparent border-transparent md:bg-[rgba(255,255,255,0.02)] md:border-[rgba(255,255,255,0.05)] shadow-none md:shadow-lg">
        <div className="flex flex-col items-center justify-center py-12 text-center max-w-md mx-auto">
          <div className="w-16 h-16 rounded-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] flex items-center justify-center shrink-0 mb-6 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
            <SettingsIcon className="w-8 h-8 text-[#F2EEE3]" strokeWidth={1.5} />
          </div>
          
          <h3 className="text-xl font-bold text-[#F5F1E8] mb-2">Settings Coming Soon</h3>
          <p className="text-[#96928A] text-sm mb-8">
            The settings module for {currentHomestay?.name || "your homestay"} is currently under development. Here you will be able to manage your profile and preferences.
          </p>

          <div className="bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)] rounded-xl p-4 flex items-start gap-3 text-left">
            <Info className="w-5 h-5 text-[#F59E0B] shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-[#F2EEE3] text-sm">Account Info</h4>
              <div className="mt-2 space-y-1 text-xs text-[#C7C3BA]">
                <p><span className="text-[#96928A]">Role:</span> {userProfile?.role === 'super_admin' ? 'Super Admin' : 'Partner'}</p>
                <p><span className="text-[#96928A]">Email:</span> {userProfile?.email || 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}
