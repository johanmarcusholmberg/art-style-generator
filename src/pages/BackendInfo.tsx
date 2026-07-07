/**
 * /backend-info — public diagnostic page.
 *
 * Displays the Lovable Cloud (Supabase) connection details baked into this
 * build so the operator can confirm at a glance which backend the frontend
 * is pointing at, without needing to sign in.
 *
 * All values shown here are the publishable/anon values already shipped in
 * the browser bundle — no secrets are exposed.
 */
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "===".slice((normalized.length + 3) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function classifyKey(token: string | undefined) {
  if (!token) return { role: "missing", ref: null as string | null, exp: null as number | null };
  const payload = decodeJwtPayload(token);
  const role = typeof payload?.role === "string" ? (payload!.role as string) : "unknown";
  const ref = typeof payload?.ref === "string" ? (payload!.ref as string) : null;
  const exp = typeof payload?.exp === "number" ? (payload!.exp as number) : null;
  return { role, ref, exp };
}

function Row({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-3 border-b border-border last:border-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`sm:col-span-2 text-sm break-all ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

export default function BackendInfo() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

  const keyInfo = classifyKey(key);
  const urlRef = url?.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? null;

  const refsAgree =
    projectId && urlRef && keyInfo.ref &&
    projectId === urlRef && urlRef === keyInfo.ref;

  const isAnon = keyInfo.role === "anon";
  const isServiceRole = keyInfo.role === "service_role";

  return (
    <div className="min-h-screen bg-background paper-texture">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <span className="text-xs text-muted-foreground">Diagnostics</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Backend connection</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Values embedded in this frontend build. Public by design — no secrets shown.
          </p>
        </div>

        <section className="bg-card border border-border rounded-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Project</h2>
            {refsAgree ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Consistent
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Mismatch
              </Badge>
            )}
          </div>
          <Row label="Project ref (env)" value={projectId ?? <em className="text-destructive">missing</em>} />
          <Row label="Project ref (from URL)" value={urlRef ?? <em className="text-destructive">missing</em>} />
          <Row label="Project ref (from key)" value={keyInfo.ref ?? <em className="text-destructive">missing</em>} />
          <Row label="API URL" value={url ?? <em className="text-destructive">missing</em>} />
        </section>

        <section className="bg-card border border-border rounded-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Publishable key</h2>
            {isAnon && (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> anon (safe for browser)
              </Badge>
            )}
            {isServiceRole && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> service_role — REMOVE
              </Badge>
            )}
            {!isAnon && !isServiceRole && (
              <Badge variant="outline">{keyInfo.role}</Badge>
            )}
          </div>
          <Row label="Key role" value={keyInfo.role} />
          <Row
            label="Key expiry"
            value={
              keyInfo.exp
                ? new Date(keyInfo.exp * 1000).toISOString().slice(0, 10)
                : "—"
            }
          />
          <Row
            label="Key preview"
            value={key ? `${key.slice(0, 12)}…${key.slice(-6)}` : <em className="text-destructive">missing</em>}
          />
        </section>

        <section className="bg-card border border-border rounded-md p-6">
          <h2 className="text-sm font-semibold mb-4">Runtime</h2>
          <Row label="Origin" value={typeof window !== "undefined" ? window.location.origin : "—"} />
          <Row label="Mode" value={import.meta.env.MODE} />
          <Row label="Build" value={import.meta.env.PROD ? "production" : "development"} />
        </section>

        {!refsAgree && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
              <div>
                <div className="font-medium text-destructive">Project ref mismatch</div>
                <p className="text-muted-foreground mt-1">
                  The env project ID, API URL host, and key claim don't all point at the
                  same project. Reconnect the backend in Lovable to resync.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
