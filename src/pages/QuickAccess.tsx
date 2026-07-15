/**
 * /access?key=SECRET
 *
 * Calls the `quick-access` edge function, which validates the shared secret
 * and returns a ready-made session (access_token + refresh_token). We hand
 * those to `supabase.auth.setSession`, which is a local operation — no
 * browser POST to /auth/v1/token, so it works even when the preview iframe's
 * fetch proxy interferes with Supabase auth endpoints.
 */
import { useEffect, useState } from "react";
import { useSearchParams, Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function QuickAccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
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
        const payload = await res.json();
        if (cancelled) return;
        if (!res.ok || !payload?.access_token || !payload?.refresh_token) {
          setError(payload?.error ?? "Access denied.");
          return;
        }

        const { error: sessionErr } = await supabase.auth.setSession({
          access_token: payload.access_token,
          refresh_token: payload.refresh_token,
        });

        if (cancelled) return;
        if (sessionErr) {
          setError(sessionErr.message);
          return;
        }

        navigate("/", { replace: true });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, navigate]);

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
