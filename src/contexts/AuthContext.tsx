/**
 * Authentication + authorization context.
 *
 * - Subscribes to Supabase auth state (set up BEFORE getSession to avoid races).
 * - Loads the linked profile + role on every auth change.
 * - Exposes `loading`, `session`, `user`, `profile`, `role`, helpers,
 *   and access flags (`isAuthenticated`, `isActive`, `isAdmin`).
 *
 * Strict-allowlist policy: the Supabase trigger ONLY links auth users to
 * pre-existing profile rows. If a user signs up without a matching profile
 * (or their profile is `disabled`), this context exposes them as "not approved"
 * and the route guards bounce them to the login page.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "user";
export type ProfileStatus = "active" | "disabled" | "pending";
export type LoginProvider = "password" | "google" | "mixed";

export interface ProfileRow {
  id: string;
  auth_user_id: string | null;
  email: string;
  username: string | null;
  display_name: string | null;
  status: ProfileStatus;
  provider: LoginProvider;
  is_protected: boolean;
  notes: string | null;
  created_by: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AccessState =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "no_profile"; email: string } // signed in to auth but not in allowlist
  | { kind: "disabled"; profile: ProfileRow }
  | { kind: "active"; profile: ProfileRow; role: AppRole };

interface AuthContextValue {
  access: AccessState;
  session: Session | null;
  user: User | null;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<AccessState>({ kind: "loading" });
  const initialChecked = useRef(false);

  const loadAccess = useCallback(async (currentSession: Session | null) => {
    if (!currentSession?.user) {
      setAccess({ kind: "anonymous" });
      return;
    }

    const userEmail = currentSession.user.email ?? "";

    // Use maybeSingle so missing profile doesn't throw
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("auth_user_id", currentSession.user.id)
      .maybeSingle();

    if (profErr) {
      console.error("Failed to load profile", profErr);
      setAccess({ kind: "no_profile", email: userEmail });
      return;
    }

    if (!profile) {
      // Trigger should have linked any allowlisted email at signup. If still
      // missing here, the user is genuinely not approved.
      setAccess({ kind: "no_profile", email: userEmail });
      return;
    }

    if (profile.status !== "active") {
      setAccess({ kind: "disabled", profile: profile as ProfileRow });
      return;
    }

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id)
      .order("role", { ascending: true })
      .limit(1)
      .maybeSingle();

    const role: AppRole = roleRow?.role === "admin" ? "admin" : "user";
    setAccess({ kind: "active", profile: profile as ProfileRow, role });
  }, []);

  useEffect(() => {
    // 1) Listener FIRST so we don't miss the first SIGNED_IN event.
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        // Defer the supabase call so we don't deadlock the auth-state callback.
        setTimeout(() => {
          void loadAccess(newSession);
        }, 0);
      },
    );

    // 2) Then read existing session.
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void loadAccess(data.session);
      initialChecked.current = true;
    });

    return () => subscription.subscription.unsubscribe();
  }, [loadAccess]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setAccess({ kind: "anonymous" });
  }, []);

  const refresh = useCallback(async () => {
    await loadAccess(session);
  }, [loadAccess, session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      access,
      session,
      user: session?.user ?? null,
      signOut,
      refresh,
    }),
    [access, session, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// Convenience selectors
export function useIsAdmin() {
  const { access } = useAuth();
  return access.kind === "active" && access.role === "admin";
}

export function useCurrentProfile() {
  const { access } = useAuth();
  return access.kind === "active" || access.kind === "disabled"
    ? access.profile
    : null;
}
