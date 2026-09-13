"use client";

import { useState, Suspense } from "react";
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
          window.location.href = "/dashboard";
        }, 2000);
      }
    } catch (err) {
      setErrorMsg("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md relative z-10">
      <div className="glass-panel p-8 md:p-12 rounded-3xl flex flex-col items-center text-center shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
        <h1 className="text-3xl font-bold text-[#F5F1E8] mb-2 tracking-wide">
          Update Password
        </h1>
        <p className="text-[#96928A] text-sm mb-8 tracking-wider">
          Enter your new password below.
        </p>

        {errorMsg && (
          <div className="w-full mb-6 p-4 rounded-xl bg-[rgba(255,105,120,0.1)] border border-[rgba(255,105,120,0.2)]">
            <p className="text-[#FF6978] text-sm font-medium">{errorMsg}</p>
          </div>
        )}

        {successMsg && (
          <div className="w-full mb-6 p-4 rounded-xl bg-[rgba(79,231,123,0.1)] border border-[rgba(79,231,123,0.2)]">
            <p className="text-[#4FE77B] text-sm font-medium">{successMsg}</p>
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="w-full">
          <div className="mb-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New Password"
              disabled={isLoading || !!successMsg}
              className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-3.5 text-[#F5F1E8] placeholder-[#96928A] focus:outline-none focus:border-[#F59E0B] transition-colors"
            />
          </div>
          
          <div className="mb-6">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm New Password"
              disabled={isLoading || !!successMsg}
              className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-3.5 text-[#F5F1E8] placeholder-[#96928A] focus:outline-none focus:border-[#F59E0B] transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !!successMsg}
            className="w-full relative group overflow-hidden rounded-xl bg-[#F59E0B] hover:bg-[#D97706] transition-all duration-300 flex items-center justify-center py-4 px-6 focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-[#141211] border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <span className="text-[#141211] font-bold tracking-wide">
                Update Password
              </span>
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
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#F59E0B] opacity-[0.03] blur-[120px] rounded-full pointer-events-none"></div>
      
      <Suspense fallback={<div className="w-10 h-10 border-2 border-[#F59E0B] border-t-transparent rounded-full animate-spin"></div>}>
        <UpdatePasswordContent />
      </Suspense>
    </div>
  );
}
