"use client";

import { useState, Suspense } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

function UpdatePasswordContent() {
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [supabase] = useState(() => createClient());

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      setErrorMsg("Please enter both fields.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      
      const { error } = await supabase.auth.updateUser({
        password: password
      });
      
      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg("Password updated successfully! Redirecting...");
        setTimeout(() => {
          window.location.href = "/";
        }, 2000);
      }
    } catch (err) {
      setErrorMsg("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md relative z-10 px-4 sm:px-0">
      <div className="bg-[#FFFFFF] border border-[#E8E5F5] p-8 md:p-12 rounded-[32px] flex flex-col items-center text-center shadow-[0_20px_50px_rgba(37,35,66,0.06)]">
        <div className="w-20 h-20 mb-4 flex items-center justify-center shrink-0">
          <Image
            src="/logos/compactlogo.png"
            alt="HOSPIRO"
            width={80}
            height={80}
            className="w-full h-full object-contain drop-shadow-[0_4px_16px_rgba(81,70,216,0.18)]"
            priority
          />
        </div>

        <h1 className="text-2xl font-bold text-[#252342] mb-1 tracking-wide">
          Update Password
        </h1>
        <p className="text-[#77758F] text-xs font-medium mb-8 tracking-wider">
          Enter your new password below.
        </p>

        {errorMsg && (
          <div className="w-full mb-6 p-4 rounded-xl bg-[#FEF2F2] border border-[#FECACA]">
            <p className="text-[#DC2626] text-sm font-medium">{errorMsg}</p>
          </div>
        )}

        {successMsg && (
          <div className="w-full mb-6 p-4 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0]">
            <p className="text-[#059669] text-sm font-medium">{successMsg}</p>
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="w-full flex flex-col gap-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New Password"
              disabled={isLoading || !!successMsg}
              className="w-full bg-[#FFFFFF] border border-[#E8E5F5] rounded-xl px-4 py-3.5 text-[#252342] placeholder-[#8F8CA4] focus:outline-none focus:border-[#5146D8] focus:ring-1 focus:ring-[#5146D8] transition-all"
            />
          </div>
          
          <div>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm New Password"
              disabled={isLoading || !!successMsg}
              className="w-full bg-[#FFFFFF] border border-[#E8E5F5] rounded-xl px-4 py-3.5 text-[#252342] placeholder-[#8F8CA4] focus:outline-none focus:border-[#5146D8] focus:ring-1 focus:ring-[#5146D8] transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !!successMsg}
            className="w-full mt-2 rounded-xl bg-[#5146D8] hover:bg-[#4338CA] text-white transition-all duration-200 flex items-center justify-center py-3.5 px-6 font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5146D8]/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <span>Update Password</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
      <Suspense fallback={<div className="w-10 h-10 border-2 border-[#5146D8] border-t-transparent rounded-full animate-spin"></div>}>
        <UpdatePasswordContent />
      </Suspense>
    </div>
  );
}
