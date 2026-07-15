/**
 * /access?key=SECRET
 *
 * Calls the `quick-access` edge function, which validates the shared secret
 * and returns a signed app-only token. This deliberately does not use the
 * regular backend auth session flow.
 */
import { useEffect, useState } from "react";
import { useSearchParams, Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { setQuickAccessToken } from "@/lib/quick-access";
import { useAuth } from "@/contexts/AuthContext";

function errorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error;
    if (typeof value === "string" && value.trim()) return value;
    if (value && typeof value === "object") return JSON.stringify(value);
  }
  return status === 401
    ? "Invalid access key — make sure the ?key=… in the URL matches the secret you saved."
    : `Access denied (HTTP ${status}).`;
}

export default function QuickAccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const key = params.get("key") ?? "";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!key) {
      setError("Missing access key.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(
          /\/$/,
          "",
        );
        const res = await fetch(
          `${base}/functions/v1/quick-access?key=${encodeURIComponent(key)}`,
          {
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
            },
          },
        );
        const payload = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !payload?.token) {
          setError(errorMessage(payload, res.status));
          return;
        }

        setQuickAccessToken(payload.token);
        await refresh();

        navigate("/", { replace: true });
      } catch (e) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : JSON.stringify(e);
          setError(message || "Quick access failed.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, navigate, refresh]);

  if (!key) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      {error ? (
        <div className="max-w-sm text-center space-y-3">
          <p className="font-display text-destructive text-sm">{error}</p>
          <a
            href="/login"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            Go to regular login
          </a>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Signing you in…
        </div>
      )}
    </div>
  );
}
