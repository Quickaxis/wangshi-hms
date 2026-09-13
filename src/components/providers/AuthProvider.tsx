"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { Partner } from "@/lib/types";

interface AuthContextType {
  partner: Partner | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  partner: null,
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [partner, setPartner] = useState<Partner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    let mounted = true;

    async function getSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user?.email) {
          // Fetch partner details from Supabase using email
          const { data, error } = await supabase
            .from("partners")
            .select("*")
            .eq("email", session.user.email)
            .single();

          if (error) {
            console.error("Error fetching partner:", error);
            setPartner(null);
          } else {
            if (mounted) setPartner(data as Partner);
          }
        } else {
          setPartner(null);
        }
      } catch (err) {
        console.error("Auth error:", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_OUT") {
          if (mounted) {
            setPartner(null);
            setIsLoading(false);
          }
        } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "PASSWORD_RECOVERY") {
          // Only fetch if we don't already have the correct partner loaded
          setPartner((prev) => {
            if (prev?.email !== session?.user?.email) {
              getSession();
            }
            return prev;
          });
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return (
    <AuthContext.Provider value={{ partner, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
