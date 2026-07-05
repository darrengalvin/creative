"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User as SupabaseUser, Session } from "@supabase/supabase-js";
import type { User, UserRole } from "@/types/database";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  refreshProfile: () => Promise<void>;
  // Impersonation
  isImpersonating: boolean;
  originalUser: User | null;
  viewAsUser: (targetUser: User) => void;
  stopImpersonating: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Get client once outside component to ensure stability
const supabase = createClient();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Track the current user ID to prevent race conditions
  const currentUserIdRef = useRef<string | null>(null);
  
  // Impersonation state
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [originalUser, setOriginalUser] = useState<User | null>(null);
  const [impersonatedUser, setImpersonatedUser] = useState<User | null>(null);

  const fetchUserProfile = useCallback(async (supabaseUser: SupabaseUser): Promise<User | null> => {
    try {
      console.log("[Auth] Fetching profile for user:", supabaseUser.id, supabaseUser.email);

      // Try the server-side /api/me endpoint first - it's much more reliable
      // than the browser PostgREST client because the request runs server-side
      // (no CORS, no ad blockers, no browser extensions, stable network).
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch("/api/me", { signal: controller.signal, credentials: "include" });
        clearTimeout(timeoutId);
        if (res.ok) {
          const json = await res.json();
          if (json.user) {
            console.log("[Auth] Profile fetched via /api/me:", json.user.name, json.user.role);
            return json.user as User;
          }
        }
        console.warn("[Auth] /api/me returned no user, falling back to direct query");
      } catch (apiErr) {
        console.warn("[Auth] /api/me request failed, falling back:", apiErr);
      }

      // Fallback: direct browser query (with timeout) in case /api/me is unreachable
      const queryPromise = supabase
        .from("users")
        .select("*")
        .eq("id", supabaseUser.id)
        .single();

      const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
        setTimeout(
          () => resolve({ data: null, error: new Error("Profile fetch timed out after 5s") }),
          5000
        )
      );

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

      if (error) {
        console.error("[Auth] Error fetching user profile:", error);
        return null;
      }

      console.log("[Auth] Profile fetched (fallback):", data?.name, data?.role);
      return data as User;
    } catch (err) {
      console.error("[Auth] Exception fetching user profile:", err);
      return null;
    }
  }, []);

  // Function to refresh the current user's profile
  const refreshProfile = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession?.user) {
      const profile = await fetchUserProfile(currentSession.user);
      if (profile) {
        setUser(profile);
        currentUserIdRef.current = profile.id;
      }
    }
  }, [fetchUserProfile]);

  useEffect(() => {
    let mounted = true;

    // Hard ceiling: no matter what, stop showing "Loading..." after 8s.
    const loadingCeiling = setTimeout(() => {
      if (mounted) {
        console.warn("[Auth] Loading ceiling reached (8s) - releasing UI");
        setIsLoading(false);
      }
    }, 8000);

    const initializeAuth = async () => {
      try {
        console.log("[Auth] Initializing - asking server who I am via /api/me...");

        // Always ask the server. The browser-side getSession() can fail to read
        // the cookie (older @supabase/ssr versions, large cookies that get
        // chunked, browser extensions, etc.) - the server-side cookie reader
        // is reliable.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        let serverProfile: User | null = null;
        try {
          const res = await fetch("/api/me", { signal: controller.signal, credentials: "include" });
          clearTimeout(timeoutId);
          if (res.ok) {
            const json = await res.json();
            if (json.user) {
              serverProfile = json.user as User;
              console.log("[Auth] /api/me returned:", serverProfile.name, serverProfile.role);
            } else {
              console.log("[Auth] /api/me returned no user (not authenticated)");
            }
          } else if (res.status === 401) {
            console.log("[Auth] /api/me reports not authenticated");
          } else {
            console.warn("[Auth] /api/me returned status:", res.status);
          }
        } catch (apiErr) {
          clearTimeout(timeoutId);
          console.warn("[Auth] /api/me request failed:", apiErr);
        }

        if (!mounted) return;

        if (serverProfile) {
          setUser(serverProfile);
          currentUserIdRef.current = serverProfile.id;
        } else {
          setUser(null);
          currentUserIdRef.current = null;
        }

        // Release the UI as soon as we know who the user is. The supabase
        // session below is loaded in the background - previously it was awaited
        // here, and because the browser client's getSession() can hang on its
        // auth lock, that await blocked releasing the UI until the 8s ceiling
        // on every page load. It must never gate the loading state.
        if (mounted) setIsLoading(false);

        // Independently load the supabase session (for token-refresh tracking
        // and the .session field consumers expect), without blocking the UI.
        void supabase.auth
          .getSession()
          .then(({ data: { session } }) => {
            if (mounted) setSession(session);
          })
          .catch((sessErr) => {
            console.warn("[Auth] getSession failed (non-fatal):", sessErr);
          });
      } catch (error) {
        console.error("[Auth] Error initializing auth:", error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;
        
        console.log("[Auth] Auth state changed:", event, newSession?.user?.email);
        
        if (event === "SIGNED_OUT") {
          console.log("[Auth] User signed out, clearing state");
          setUser(null);
          setSession(null);
          currentUserIdRef.current = null;
          return;
        }

        // Update session
        setSession(newSession);

        // Only fetch profile if we have a session with a user
        if (newSession?.user) {
          // Check if this is actually a different user
          const newUserId = newSession.user.id;
          
          // Always fetch on SIGNED_IN, otherwise only if user changed or TOKEN_REFRESHED
          if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || currentUserIdRef.current !== newUserId) {
            console.log("[Auth] Fetching profile for event:", event);
            const profile = await fetchUserProfile(newSession.user);
            
            if (mounted && profile) {
              // Double-check we're still dealing with the same user
              const { data: { session: currentSession } } = await supabase.auth.getSession();
              if (currentSession?.user?.id === profile.id) {
                console.log("[Auth] Setting user profile:", profile.name, profile.role);
                setUser(profile);
                currentUserIdRef.current = profile.id;
              } else {
                console.log("[Auth] Session changed during profile fetch, skipping update");
              }
            }
          }
        } else if (event !== "TOKEN_REFRESHED") {
          // Only clear user if this isn't just a token refresh event
          // Token refresh can sometimes fire with null session temporarily
          console.log("[Auth] No user in session for event:", event);
          setUser(null);
          currentUserIdRef.current = null;
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(loadingCeiling);
      subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
        },
      },
    });

    if (error) return { error };

    // Note: User profile is created automatically by database trigger
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  // Get the effective user (impersonated or actual)
  const effectiveUser = isImpersonating && impersonatedUser ? impersonatedUser : user;

  const hasRole = useCallback((roles: UserRole | UserRole[]) => {
    // When impersonating, use the impersonated user's role
    const checkUser = isImpersonating && impersonatedUser ? impersonatedUser : user;
    if (!checkUser) return false;
    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.includes(checkUser.role);
  }, [user, isImpersonating, impersonatedUser]);

  // Authentication is determined by having a resolved user profile (from the
  // reliable server-side /api/me), not the browser session object, which is
  // loaded in the background and may lag or fail to hydrate.
  const isAuthenticated = useMemo(() => !!user, [user]);

  // Impersonation functions
  const viewAsUser = useCallback((targetUser: User) => {
    if (!user || user.role !== "admin") return;
    setOriginalUser(user);
    setImpersonatedUser(targetUser);
    setIsImpersonating(true);
  }, [user]);

  const stopImpersonating = useCallback(() => {
    setIsImpersonating(false);
    setImpersonatedUser(null);
    setOriginalUser(null);
  }, []);

  const contextValue = useMemo(() => ({
    user: effectiveUser,
    session,
    isLoading,
    isAuthenticated,
    signIn,
    signUp,
    signOut,
    hasRole,
    refreshProfile,
    // Impersonation
    isImpersonating,
    originalUser,
    viewAsUser,
    stopImpersonating,
  }), [effectiveUser, session, isLoading, isAuthenticated, hasRole, refreshProfile, isImpersonating, originalUser, viewAsUser, stopImpersonating]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

