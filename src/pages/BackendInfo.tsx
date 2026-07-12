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
import { ArrowLeft, CheckCircle2, AlertTriangle, Loader2, RefreshCw, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";


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
  const [autoRefresh, setAutoRefresh] = useState(true);
  const idRef = useRef(0);
  const runIdRef = useRef(0);

  type RunSummary = {
    runId: number;
    ts: string;
    durationMs: number;
    total: number;
    okCount: number;
    failCount: number;
    entries: ProbeEntry[];
  };
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [expandedRuns, setExpandedRuns] = useState<Record<number, boolean>>({});

  const append = (entry: Omit<ProbeEntry, "id" | "ts">): ProbeEntry => {
    idRef.current += 1;
    const id = idRef.current;
    const full: ProbeEntry = { ...entry, id, ts: new Date().toISOString().slice(11, 23) };
    setLog((prev) => [full, ...prev].slice(0, 40));
    setExpanded((prev) => ({ ...prev, [id]: !entry.ok }));
    return full;
  };

  const probe = useCallback(
    async (target: string, path: string, init?: RequestInit): Promise<ProbeEntry> => {
      const method = init?.method ?? "GET";
      const full = url ? `${url}${path}` : path;
      if (!url || !key) {
        return append({
          target, url: full, method, status: null, statusText: "", ms: 0,
          ok: false, detail: "env missing (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)",
          body: "", headers: {},
        });
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
        return append({
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
        return append({
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
    const runStarted = performance.now();
    const entries: ProbeEntry[] = [];
    entries.push(await probe("REST root", "/rest/v1/"));
    entries.push(await probe("Auth settings", "/auth/v1/settings"));
    entries.push(await probe("Storage health", "/storage/v1/bucket", { method: "GET" }));
    const durationMs = Math.round(performance.now() - runStarted);
    runIdRef.current += 1;
    const summary: RunSummary = {
      runId: runIdRef.current,
      ts: new Date().toISOString().slice(11, 23),
      durationMs,
      total: entries.length,
      okCount: entries.filter((e) => e.ok).length,
      failCount: entries.filter((e) => !e.ok).length,
      entries,
    };
    setRuns((prev) => [summary, ...prev].slice(0, 20));
    setRunning(false);
  }, [probe]);

  useEffect(() => {
    void runAll();
  }, [runAll]);

  // Automatic re-probe every 30s while enabled and tab is visible.
  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void runAll();
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [autoRefresh, runAll]);


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
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold">Live probes</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Direct browser calls to REST, Auth, and Storage using the anon key.
                {autoRefresh ? " Auto re-probes every 30s while this tab is visible." : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Auto (30s)
              </label>
              <Button size="sm" variant="outline" onClick={runAll} disabled={running}>
                {running ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1" />
                )}
                Re-run
              </Button>
            </div>
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

        <section className="bg-card border border-border rounded-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold">Run history</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Last {runs.length} of up to 20 probe runs. Click a row to inspect that run's probes.
              </p>
            </div>
          </div>

          {runs.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">No runs yet.</div>
          ) : (
            <div className="rounded-md border border-border bg-muted/30 divide-y divide-border max-h-96 overflow-auto">
              {runs.map((r) => {
                const isOpen = !!expandedRuns[r.runId];
                const allOk = r.failCount === 0;
                return (
                  <div key={r.runId} className="text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => setExpandedRuns((p) => ({ ...p, [r.runId]: !isOpen }))}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-muted/50"
                    >
                      <span className="text-muted-foreground shrink-0">{r.ts}</span>
                      <span className="shrink-0 w-12 text-muted-foreground">#{r.runId}</span>
                      <span
                        className={`shrink-0 w-24 font-semibold ${
                          allOk ? "text-emerald-600" : "text-destructive"
                        }`}
                      >
                        {r.okCount}/{r.total} ok
                      </span>
                      <span className="shrink-0 w-20 text-muted-foreground">{r.durationMs}ms</span>
                      <span className="truncate text-muted-foreground flex-1">
                        {allOk
                          ? "all probes succeeded"
                          : `${r.failCount} failing: ${r.entries
                              .filter((e) => !e.ok)
                              .map((e) => e.target)
                              .join(", ")}`}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{isOpen ? "▾" : "▸"}</span>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 space-y-1">
                        {r.entries.map((e) => (
                          <div
                            key={e.id}
                            className="flex items-center gap-2 px-2 py-1 rounded bg-background border border-border"
                          >
                            <span
                              className={`shrink-0 w-14 font-semibold ${
                                e.ok
                                  ? "text-emerald-600"
                                  : e.status === null
                                    ? "text-destructive"
                                    : "text-amber-600"
                              }`}
                            >
                              {e.status ?? "ERR"}
                            </span>
                            <span className="shrink-0 w-14 text-muted-foreground">{e.ms}ms</span>
                            <span className="shrink-0 w-28 truncate">{e.target}</span>
                            <span className="truncate text-muted-foreground flex-1">
                              {e.detail}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <PushTargetPreflight />



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

// -------------------------------------------------------------------
// Push-target preflight
// Confirms the {owner, repo, branch, expected_sha} the user is about to
// poll matches what the GitHub connector actually sees.
// -------------------------------------------------------------------

type PreflightResult = {
  input: { owner: string; repo: string; branch: string; expected_sha: string | null };
  checks: {
    repo?: { ok: boolean; status: number; full_name?: string | null; default_branch?: string | null; private?: boolean | null; detail: string };
    effective_branch?: string;
    branch?: { ok: boolean; status: number; head_sha: string | null; detail: string };
    expected_sha?: { ok: boolean; matches_head: boolean; exists_in_repo: boolean; status: number; detail: string };
    workflow_runs?: {
      ok: boolean; status: number; sha: string; count: number;
      runs: Array<{ id: number; name: string; event: string; status: string; conclusion: string | null; html_url: string; run_started_at: string; head_branch: string }>;
    };
    input?: { ok: boolean; detail: string };
  };
};

function PushTargetPreflight() {
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [sha, setSha] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PreflightResult | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke<PreflightResult>("github-ci-check", {
        body: { owner, repo, branch, expected_sha: sha },
      });
      if (error) throw error;
      setResult(data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const c = result?.checks;
  const repoOk = c?.repo?.ok;
  const branchOk = c?.branch?.ok;
  const shaCheck = c?.expected_sha;
  const shaOk = !sha.trim() || shaCheck?.matches_head;
  const allOk = repoOk && branchOk && shaOk;

  return (
    <section className="bg-card border border-border rounded-md p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <GitBranch className="h-4 w-4" /> Push-target preflight
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Confirm owner/repo/branch (and optional commit SHA) match what the GitHub
            connector sees before polling CI results.
          </p>
        </div>
        {result && (
          allOk ? (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Target confirmed
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> Mismatch
            </Badge>
          )
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Owner</Label>
          <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e.g. myuser" />
        </div>
        <div>
          <Label className="text-xs">Repo</Label>
          <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="e.g. myrepo" />
        </div>
        <div>
          <Label className="text-xs">Branch (optional — defaults to repo default)</Label>
          <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
        </div>
        <div>
          <Label className="text-xs">Expected commit SHA (optional)</Label>
          <Input value={sha} onChange={(e) => setSha(e.target.value)} placeholder="e8becbb…" />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={run} disabled={loading || !owner.trim() || !repo.trim()}>
          {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
          Verify target
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>

      {result && (
        <div className="mt-4 space-y-2 text-xs font-mono">
          <CheckLine
            ok={!!repoOk}
            label="Repo"
            detail={
              c?.repo
                ? `${c.repo.status} · ${c.repo.full_name ?? "—"} · default=${c.repo.default_branch ?? "—"}${c.repo.private ? " · private" : ""}`
                : "no result"
            }
          />
          <CheckLine
            ok={!!branchOk}
            label={`Branch (${c?.effective_branch ?? branch || "default"})`}
            detail={
              c?.branch
                ? `${c.branch.status} · HEAD=${c.branch.head_sha?.slice(0, 12) ?? "—"}`
                : "not checked"
            }
          />
          {sha.trim() && (
            <CheckLine
              ok={!!shaCheck?.matches_head}
              warn={!shaCheck?.matches_head && !!shaCheck?.exists_in_repo}
              label="Expected SHA"
              detail={shaCheck?.detail ?? "not checked"}
            />
          )}
          {c?.workflow_runs && (
            <div className="mt-3 rounded border border-border bg-muted/30 p-3">
              <div className="text-[11px] text-muted-foreground mb-2">
                Workflow runs for {c.workflow_runs.sha.slice(0, 12)} · {c.workflow_runs.count} found
              </div>
              {c.workflow_runs.runs.length === 0 ? (
                <div className="text-[11px] text-muted-foreground">
                  No workflow runs recorded yet for this commit.
                  {sha.trim() && !shaCheck?.matches_head
                    ? " (Commit isn't HEAD of the branch — CI may only trigger on the branch head.)"
                    : " Actions may not have started yet."}
                </div>
              ) : (
                <div className="space-y-1">
                  {c.workflow_runs.runs.map((r) => (
                    <a
                      key={r.id}
                      href={r.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 hover:bg-muted/50 rounded px-1 py-1"
                    >
                      <span
                        className={`w-16 font-semibold ${
                          r.conclusion === "success"
                            ? "text-emerald-600"
                            : r.conclusion === "failure"
                              ? "text-destructive"
                              : "text-amber-600"
                        }`}
                      >
                        {r.conclusion ?? r.status}
                      </span>
                      <span className="w-32 truncate">{r.name}</span>
                      <span className="w-16 text-muted-foreground">{r.event}</span>
                      <span className="text-muted-foreground truncate flex-1">{r.head_branch}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
            <strong>Guard rule:</strong> only poll CI after "Target confirmed". If the
            expected SHA is not HEAD of the branch, the push has not landed on the
            branch the connector is querying — polling will return stale or empty runs.
          </div>
        </div>
      )}
    </section>
  );
}

function CheckLine({ ok, warn, label, detail }: { ok: boolean; warn?: boolean; label: string; detail: string }) {
  const color = ok ? "text-emerald-600" : warn ? "text-amber-600" : "text-destructive";
  const icon = ok ? "✓" : warn ? "!" : "✗";
  return (
    <div className="flex items-start gap-2">
      <span className={`w-4 font-bold ${color}`}>{icon}</span>
      <span className="w-40 shrink-0">{label}</span>
      <span className="text-muted-foreground flex-1 break-all">{detail}</span>
    </div>
  );
}

