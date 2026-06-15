/**
 * /admin/costs — Cost Dashboard.
 *
 * Admin-only read-only view over `asset_cost_events`. Surfaces what is
 * already recorded so spend is visible before scaling generation volume.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import {
  fetchCostEvents,
  summarize,
  groupByProvider,
  groupByMode,
  groupByEventType,
  groupByDay,
  formatCost,
  type CostEventRow,
} from "@/lib/cost-analytics";

const ALL = "__all__";
const EVENT_TYPES = ["generation", "upscale", "print_export"];

function todayMinusDaysISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function AdminCosts() {
  const [rows, setRows] = useState<CostEventRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [from, setFrom] = useState<string>(todayMinusDaysISO(30));
  const [to, setTo] = useState<string>(todayMinusDaysISO(0));
  const [eventType, setEventType] = useState<string>(ALL);
  const [provider, setProvider] = useState<string>(ALL);
  const [status, setStatus] = useState<string>("succeeded");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCostEvents({
        from: from ? new Date(`${from}T00:00:00Z`).toISOString() : null,
        to: to ? new Date(`${to}T23:59:59Z`).toISOString() : null,
        eventType: eventType === ALL ? null : eventType,
        provider: provider === ALL ? null : provider,
        status: status === ALL ? null : status,
      });
      setRows(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Failed to load cost events", { description: msg });
    } finally {
      setLoading(false);
    }
  }, [from, to, eventType, provider, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => summarize(rows), [rows]);
  const byProvider = useMemo(() => groupByProvider(rows), [rows]);
  const byMode = useMemo(() => groupByMode(rows), [rows]);
  const byType = useMemo(() => groupByEventType(rows), [rows]);
  const byDay = useMemo(() => groupByDay(rows), [rows]);

  const providerOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.provider && set.add(r.provider));
    return Array.from(set).sort();
  }, [rows]);

  const maxDailyCost = byDay.reduce((m, d) => Math.max(m, d.knownCost), 0);
  const recent = rows.slice(0, 50);

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/assets">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-semibold">Cost Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Estimated spend across providers and styles
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <section className="rounded-md border border-border bg-card p-3 sm:p-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 mt-1 text-xs" />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 mt-1 text-xs" />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Event type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL} className="text-xs">All</SelectItem>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL} className="text-xs">All</SelectItem>
                  {providerOptions.map((p) => (
                    <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 mt-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL} className="text-xs">All</SelectItem>
                  <SelectItem value="succeeded" className="text-xs">succeeded</SelectItem>
                  <SelectItem value="failed" className="text-xs">failed</SelectItem>
                  <SelectItem value="pending" className="text-xs">pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">Loading cost events…</span>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="Total spend"
                value={formatCost(summary.totalKnownCost, summary.currency)}
                hint={summary.unknownCount > 0 ? `+ ${summary.unknownCount} unknown` : null}
              />
              <StatCard label="Events" value={summary.eventCount.toLocaleString()} />
              <StatCard
                label="Cost coverage"
                value={`${Math.round(summary.knownPct * 100)}%`}
                hint="rows with known price"
              />
              <StatCard label="Distinct images" value={summary.distinctImages.toLocaleString()} />
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <GroupSection title="Spend by provider" rows={byProvider} currency={summary.currency} keyLabel="Provider" />
              <GroupSection title="Spend by style" rows={byMode} currency={summary.currency} keyLabel="Style" />
              <GroupSection title="Spend by event type" rows={byType} currency={summary.currency} keyLabel="Type" />
              <DailySection rows={byDay} currency={summary.currency} max={maxDailyCost} />
            </div>

            <section className="space-y-2">
              <h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Recent events</h2>
              <div className="rounded-md border border-border bg-card overflow-x-auto">
                {recent.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-4 text-center">No events.</p>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border">
                        {["When", "Type", "Provider", "Model", "Style", "Status", "Cost", "Image"].map((h) => (
                          <th key={h} className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 py-2">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((r) => (
                        <tr key={r.id} className="border-b border-border/50 last:border-0">
                          <td className="text-xs px-3 py-2 align-top">{new Date(r.created_at).toLocaleString()}</td>
                          <td className="text-xs px-3 py-2 align-top">{r.event_type}</td>
                          <td className="text-xs px-3 py-2 align-top">{r.provider ?? "—"}</td>
                          <td className="text-xs px-3 py-2 align-top">{r.model ?? "—"}</td>
                          <td className="text-xs px-3 py-2 align-top">{r.mode ?? "—"}</td>
                          <td className="text-xs px-3 py-2 align-top">{r.status}</td>
                          <td className="text-xs px-3 py-2 align-top">
                            {typeof r.estimated_cost === "number"
                              ? formatCost(Number(r.estimated_cost), r.currency ?? summary.currency)
                              : <span className="text-muted-foreground">unknown</span>}
                          </td>
                          <td className="text-xs px-3 py-2 align-top">
                            {r.generated_image_id ? (
                              <Link
                                to={`/admin/assets?focus=${r.generated_image_id}`}
                                className="text-primary hover:underline"
                              >
                                open
                              </Link>
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground mt-1">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function GroupSection({
  title,
  rows,
  currency,
  keyLabel,
}: {
  title: string;
  rows: { key: string; events: number; knownCost: number; unknownCount: number; avgCost: number }[];
  currency: string;
  keyLabel: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">{title}</h2>
      <div className="rounded-md border border-border bg-card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground p-4 text-center">No data.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                {[keyLabel, "Events", "Total", "Avg", "Unknown"].map((h) => (
                  <th key={h} className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border/50 last:border-0">
                  <td className="text-xs px-3 py-2">{r.key}</td>
                  <td className="text-xs px-3 py-2">{r.events.toLocaleString()}</td>
                  <td className="text-xs px-3 py-2">{formatCost(r.knownCost, currency)}</td>
                  <td className="text-xs px-3 py-2">{formatCost(r.avgCost, currency)}</td>
                  <td className="text-xs px-3 py-2 text-muted-foreground">{r.unknownCount || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function DailySection({
  rows,
  currency,
  max,
}: {
  rows: { date: string; events: number; knownCost: number; unknownCount: number }[];
  currency: string;
  max: number;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Daily spend</h2>
      <div className="rounded-md border border-border bg-card p-3">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground p-4 text-center">No data.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => {
              const pct = max > 0 ? Math.max(2, Math.round((r.knownCost / max) * 100)) : 0;
              return (
                <li key={r.date} className="flex items-center gap-3 text-xs">
                  <span className="w-20 tabular-nums text-muted-foreground">{r.date}</span>
                  <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
                    <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-24 tabular-nums text-right">{formatCost(r.knownCost, currency)}</span>
                  <span className="w-16 tabular-nums text-right text-muted-foreground">{r.events}×</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
