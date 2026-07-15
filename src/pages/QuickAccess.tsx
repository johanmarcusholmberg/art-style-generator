/**
 * /access?key=SECRET
 *
 * Exchanges the shared secret in the URL for a one-time magic sign-in link
 * via the `quick-access` edge function, then navigates the browser to that
 * link to complete Supabase auth. The key never touches the app database
 * and is only ever sent to the edge function.
 */
import { useEffect, useState } from "react";
import { useSearchParams, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function QuickAccess() {
  const [params] = useSearchParams();
  const key = params.get("key") ?? "";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!key) {
      setError("Missing access key.");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke("quick-access", {
        method: "GET" as never,
        body: undefined,
        // functions.invoke doesn't take query params; fall back to fetch:
      } as never);

      // Prefer a direct fetch so we can pass the key as a query string.
      try {
        const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(
          /\/$/,
          "",
        );
        const res = await fetch(
          `${base}/functions/v1/quick-access?key=${encodeURIComponent(key)}&redirect=${encodeURIComponent(window.location.origin)}`,
          {
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
            },
          },
        );
        const payload = await res.json();
        if (cancelled) return;
        if (!res.ok || !payload?.link) {
          setError(payload?.error ?? "Access denied.");
          return;
        }
        window.location.href = payload.link;
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      // Suppress unused warnings from the invoke stub above.
      void data;
      void error;
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

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
