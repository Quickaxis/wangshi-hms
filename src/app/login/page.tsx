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
  const [showPassword, setShowPassword] = useState(false);
  
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

        // Success - Redirect to dashboard (root)
        window.location.href = "/";
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
    <div className="w-full max-w-md relative z-10 w-full px-4 sm:px-0">
      <div className="bg-[rgba(25,22,18,0.96)] border border-[rgba(255,255,255,0.08)] p-8 sm:p-12 rounded-[32px] flex flex-col items-center text-center shadow-[0_30px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="w-20 h-20 rounded-2xl bg-[rgba(245,160,0,0.1)] border border-[rgba(245,160,0,0.2)] flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(245,160,0,0.1)]">
          <svg className="w-10 h-10 text-[#f5a000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-bold text-[#f5f2eb] mb-2 tracking-wide">
          WANGSHI HOMESTAY
        </h1>
        <p className="text-[#aaa39a] text-sm mb-8 tracking-wider">
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

        <form onSubmit={isResetMode ? handleResetPassword : handleLogin} className="w-full flex flex-col gap-4">
          <div className="relative">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Partner Email"
              disabled={isLoading}
              className="w-full bg-[#181512] border border-[rgba(255,255,255,0.12)] rounded-xl px-4 py-3.5 text-[#f5f2eb] placeholder-[#aaa39a] focus:outline-none focus:border-[#f5a000] focus:ring-1 focus:ring-[#f5a000] transition-all"
            />
          </div>
          
          {!isResetMode && (
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                disabled={isLoading}
                className="w-full bg-[#181512] border border-[rgba(255,255,255,0.12)] rounded-xl pl-4 pr-12 py-3.5 text-[#f5f2eb] placeholder-[#aaa39a] focus:outline-none focus:border-[#f5a000] focus:ring-1 focus:ring-[#f5a000] transition-all"
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-[14px] text-[#aaa39a] hover:text-[#f5f2eb] transition-colors focus:outline-none"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
              <div className="text-right mt-2 mb-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetMode(true);
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="text-xs text-[#f5a000] hover:text-[#d97706] transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 relative group overflow-hidden rounded-xl bg-[#f5a000] hover:bg-[#d97706] transition-all duration-300 flex items-center justify-center py-4 px-6 focus:outline-none focus:ring-2 focus:ring-[#f5a000] focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-[#0b0907] border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <span className="text-[#0b0907] font-bold tracking-wide">
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

        <p className="mt-8 text-xs text-[#aaa39a] tracking-wider">
          Authorized partners only.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-[#0b0907] relative overflow-hidden">
      {/* Background ambient light */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[800px] h-[600px] sm:h-[800px] bg-[#f5a000] opacity-[0.04] blur-[120px] rounded-full pointer-events-none"></div>
      
      <Suspense fallback={<div className="w-10 h-10 border-2 border-[#f5a000] border-t-transparent rounded-full animate-spin"></div>}>
        <LoginContent />
      </Suspense>
    </div>
  );
}
