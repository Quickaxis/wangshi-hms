"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { verifyAndLinkPartner } from "@/app/actions/auth";

function LoginContent() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isResetMode, setIsResetMode] = useState(false);
  
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const [supabase] = useState(() => createClient());

  const getErrorMessage = () => {
    if (errorMsg) return errorMsg;
    switch (urlError) {
      case "unauthorized":
        return "Your account is not authorized to access WANGSHI HOMESTAY. Access Denied.";
      case "inactive":
        return "Your partner account has been deactivated. Please contact an administrator.";
      case "auth_failed":
        return "Authentication failed. Please try again.";
      default:
        return null;
    }
  };

  const currentError = getErrorMessage();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);
      
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setErrorMsg("Invalid email or password.");
        } else {
          setErrorMsg(error.message);
        }
        return;
      }
      
      if (data.user) {
        const result = await verifyAndLinkPartner();
        
        if (!result.success) {
          await supabase.auth.signOut();
          setErrorMsg(result.error || "Access denied.");
          return;
        }

        // Success - Redirect to dashboard
        window.location.href = "/dashboard";
      }
    } catch (err: any) {
      console.error("Login error DETAILS:", err);
      setErrorMsg(err?.message ? `Error: ${err.message}` : `Error: ${JSON.stringify(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMsg("Please enter your email to reset password.");
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
      });
      
      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg("Password reset email sent! Check your inbox.");
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
        <div className="w-20 h-20 rounded-2xl bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)] flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(245,158,11,0.1)]">
          <svg className="w-10 h-10 text-[#F59E0B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-bold text-[#F5F1E8] mb-2 tracking-wide">
          WANGSHI HOMESTAY
        </h1>
        <p className="text-[#96928A] text-sm mb-8 tracking-wider">
          Partner Management System
        </p>

        {currentError && (
          <div className="w-full mb-6 p-4 rounded-xl bg-[rgba(255,105,120,0.1)] border border-[rgba(255,105,120,0.2)]">
            <p className="text-[#FF6978] text-sm font-medium">{currentError}</p>
          </div>
        )}

        {successMsg && (
          <div className="w-full mb-6 p-4 rounded-xl bg-[rgba(79,231,123,0.1)] border border-[rgba(79,231,123,0.2)]">
            <p className="text-[#4FE77B] text-sm font-medium">{successMsg}</p>
          </div>
        )}

        <form onSubmit={isResetMode ? handleResetPassword : handleLogin} className="w-full">
          <div className="mb-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Partner Email"
              disabled={isLoading}
              className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-3.5 text-[#F5F1E8] placeholder-[#96928A] focus:outline-none focus:border-[#F59E0B] transition-colors"
            />
          </div>
          
          {!isResetMode && (
            <div className="mb-6 relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                disabled={isLoading}
                className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-3.5 text-[#F5F1E8] placeholder-[#96928A] focus:outline-none focus:border-[#F59E0B] transition-colors"
              />
              <div className="text-right mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetMode(true);
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="text-xs text-[#F59E0B] hover:text-[#D97706] transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full relative group overflow-hidden rounded-xl bg-[#F59E0B] hover:bg-[#D97706] transition-all duration-300 flex items-center justify-center py-4 px-6 focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-[#141211] border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <span className="text-[#141211] font-bold tracking-wide">
                {isResetMode ? "Send Reset Link" : "Sign In"}
              </span>
            )}
          </button>
        </form>

        {isResetMode && (
          <button
            type="button"
            onClick={() => {
              setIsResetMode(false);
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className="mt-6 text-sm text-[#96928A] hover:text-[#F5F1E8] transition-colors"
          >
            Back to login
          </button>
        )}

        <p className="mt-8 text-xs text-[#96928A] tracking-wider">
          Authorized partners only.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background ambient light */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#F59E0B] opacity-[0.03] blur-[120px] rounded-full pointer-events-none"></div>
      
      <Suspense fallback={<div className="w-10 h-10 border-2 border-[#F59E0B] border-t-transparent rounded-full animate-spin"></div>}>
        <LoginContent />
      </Suspense>
    </div>
  );
}
