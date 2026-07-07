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
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

  // Live probe: hit REST, Auth, and Storage endpoints from the browser and
  // record status/latency into an on-page log so we can see exactly what
  // "Failed to fetch" means (CORS/DNS/network vs 4xx/5xx from the server).
  type ProbeEntry = {
    id: number;
    ts: string;
    target: string;
    url: string;
    method: string;
    status: number | null;
    statusText: string;
    ms: number;
    ok: boolean;
    detail: string;
    body: string;
    headers: Record<string, string>;
    errorName?: string;
    errorStack?: string;
  };
  const [log, setLog] = useState<ProbeEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const idRef = useRef(0);

  const append = (entry: Omit<ProbeEntry, "id" | "ts">) => {
    idRef.current += 1;
    const id = idRef.current;
    setLog((prev) =>
      [{ ...entry, id, ts: new Date().toISOString().slice(11, 23) }, ...prev].slice(0, 40),
    );
    // Auto-expand failing entries so the full error is visible immediately.
    setExpanded((prev) => ({ ...prev, [id]: !entry.ok }));
  };

  const probe = useCallback(
    async (target: string, path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const full = url ? `${url}${path}` : path;
      if (!url || !key) {
        append({
          target, url: full, method, status: null, statusText: "", ms: 0,
          ok: false, detail: "env missing (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)",
          body: "", headers: {},
        });
        return;
      }
      const started = performance.now();
      try {
        const res = await fetch(full, {
          ...init,
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            ...(init?.headers ?? {}),
          },
        });
        const ms = Math.round(performance.now() - started);
        let body = "";
        try {
          body = await res.text();
        } catch {
          /* ignore body read failures */
        }
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          headers[k] = v;
        });
        append({
          target, url: full, method,
          status: res.status, statusText: res.statusText, ms, ok: res.ok,
          detail: res.ok ? (res.statusText || "ok") : (body.slice(0, 400) || res.statusText || "error"),
          body, headers,
        });
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        const msg = err instanceof Error ? err.message : String(err);
        const name = err instanceof Error ? err.name : "Error";
        const stack = err instanceof Error ? err.stack ?? "" : "";
        append({
          target, url: full, method,
          status: null, statusText: "", ms, ok: false,
          detail: `network: ${msg}`,
          body: "", headers: {},
          errorName: name, errorStack: stack,
        });
      }
    },
    [url, key],
  );

  const runAll = useCallback(async () => {
    setRunning(true);
    await probe("REST root", "/rest/v1/");
    await probe("Auth settings", "/auth/v1/settings");
    await probe("Storage health", "/storage/v1/bucket", { method: "GET" });
    setRunning(false);
  }, [probe]);

  useEffect(() => {
    void runAll();
  }, [runAll]);

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

        <section className="bg-card border border-border rounded-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold">Live probes</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Direct browser calls to REST, Auth, and Storage using the anon key.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={runAll} disabled={running}>
              {running ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Re-run
            </Button>
          </div>

          {log.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">No probes yet.</div>
          ) : (
            <div className="rounded-md border border-border bg-muted/30 divide-y divide-border max-h-[32rem] overflow-auto">
              {log.map((e) => {
                const isOpen = !!expanded[e.id];
                const fullReport =
                  `${e.ts}  ${e.method} ${e.url}\n` +
                  `status: ${e.status ?? "ERR"} ${e.statusText}\n` +
                  `latency: ${e.ms}ms\n` +
                  (e.errorName ? `error: ${e.errorName}: ${e.detail}\n` : "") +
                  (e.errorStack ? `stack:\n${e.errorStack}\n` : "") +
                  (Object.keys(e.headers).length
                    ? `\nresponse headers:\n${Object.entries(e.headers).map(([k, v]) => `  ${k}: ${v}`).join("\n")}\n`
                    : "") +
                  (e.body ? `\nbody:\n${e.body}\n` : "");
                return (
                  <div key={e.id} className="text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => setExpanded((p) => ({ ...p, [e.id]: !isOpen }))}
                      className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-muted/50"
                    >
                      <span className="text-muted-foreground shrink-0">{e.ts}</span>
                      <span
                        className={`shrink-0 w-16 font-semibold ${
                          e.ok
                            ? "text-emerald-600"
                            : e.status === null
                              ? "text-destructive"
                              : "text-amber-600"
                        }`}
                      >
                        {e.status ?? "ERR"}
                      </span>
                      <span className="shrink-0 w-16 text-muted-foreground">{e.ms}ms</span>
                      <span className="shrink-0 w-28 truncate">{e.target}</span>
                      <span className="truncate text-muted-foreground flex-1">
                        {e.detail || e.url}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{isOpen ? "▾" : "▸"}</span>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 space-y-2">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={() => void navigator.clipboard.writeText(fullReport)}
                          >
                            Copy full report
                          </Button>
                        </div>
                        <pre className="whitespace-pre-wrap break-all bg-background border border-border rounded p-3 text-[11px] leading-relaxed max-h-96 overflow-auto">
{fullReport}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}


          <div className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
            <strong>ERR / "network: Failed to fetch"</strong> = the request never
            reached the backend (DNS, CORS, TLS, or the project is offline).{" "}
            <strong>5xx</strong> = the backend received it but failed internally.{" "}
            <strong>4xx</strong> = reached the backend and was rejected (usually
            auth/permissions).
          </div>
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
