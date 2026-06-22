/**
 * Style Lab — Insights Panel (Phase 4).
 *
 * Read-only analytics over recent generated_images plus collection
 * membership. Filters apply to all sections. Performance budget:
 * 1000 rows aggregated client-side.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCcw, Star, Heart, Ban, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import {
  fetchInsightsData,
  aggregateStylePerformance,
  aggregateProviderPerformance,
  aggregateTopPrompts,
  aggregateCollectionPerformance,
  computeQuickInsights,
  type InsightsData,
  type StylePerfRow,
  type ProviderPerfRow,
  type TopPromptRow,
  type CollectionPerfRow,
} from "@/lib/style-lab-insights";

const STYLE_LABELS: Record<string, string> = {
  japanese: "🏯 Ukiyo-e",
  risograph: "📠 Risograph",
  screenprint: "🖨️ Screen Print",
  xeroxzine: "📋 Xerox Zine",
  lineart: "✒️ Line Art",
  botanical: "🌿 Botanical",
  tattooflash: "🔥 Tattoo Flash",
  retrocomic: "💥 Retro Comic",
  whimsicaljapanese: "🦊 Whimsical Japanese",
  modernistcocktail: "🍸 Modernist Cocktail",
  mediterraneanheritage: "🚪 Mediterranean Heritage",
  scandinavianposter: "🇸🇪 Scandinavian",
  brutalistposter: "⬛ Brutalist",
  urbannoir: "🖤 Urban Noir",
  minimalism: "◻ Minimalism",
  graffiti: "🎨 Graffiti",
  pulpmagazine: "📕 Pulp Magazine",
  popart: "🎯 Pop Art",
  vintage: "🍷 Vintage",
  artnouveau: "🌸 Art Nouveau",
  midcenturymodern: "🌞 Mid-Century Modern",
  loosewatercolor: "💧 Loose Watercolor",
};
const styleLabel = (k: string) => STYLE_LABELS[k] ?? k;

const ALL = "__all__";
const KNOWN_PROVIDERS = ["gemini", "openai", "replicate", "lovable"];

type StyleSort = "avgRating" | "total" | "favoriteCount" | "rejectRate";
type ProviderSort = "avgRating" | "total" | "favoriteRate" | "rejectRate";
type PromptSort = "avgRating" | "favoriteCount" | "times";
type CollectionSort = "avgRating" | "total" | "favoriteCount";

export default function InsightsPanel() {
  const { toast } = useToast();
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);

  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [mode, setMode] = useState<string>(ALL);
  const [provider, setProvider] = useState<string>(ALL);

  const [styleSort, setStyleSort] = useState<StyleSort>("avgRating");
  const [providerSort, setProviderSort] = useState<ProviderSort>("avgRating");
  const [promptSort, setPromptSort] = useState<PromptSort>("avgRating");
  const [collectionSort, setCollectionSort] = useState<CollectionSort>("avgRating");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchInsightsData({
        limit: 1000,
        filters: {
          from: from ? new Date(from).toISOString() : null,
          to: to ? new Date(`${to}T23:59:59`).toISOString() : null,
          mode: mode === ALL ? null : mode,
          provider: provider === ALL ? null : provider,
        },
      });
      setData(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Failed to load insights", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [from, to, mode, provider, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Derived ────────────────────────────────────────────────────────
  const quick = useMemo(() => (data ? computeQuickInsights(data) : null), [data]);

  const styleRows = useMemo<StylePerfRow[]>(() => {
    if (!data) return [];
    const rows = aggregateStylePerformance(data);
    const sorters: Record<StyleSort, (a: StylePerfRow, b: StylePerfRow) => number> = {
      avgRating: (a, b) => b.avgRating - a.avgRating,
      total: (a, b) => b.total - a.total,
      favoriteCount: (a, b) => b.favoriteCount - a.favoriteCount,
      rejectRate: (a, b) => b.rejectRate - a.rejectRate,
    };
    return [...rows].sort(sorters[styleSort]);
  }, [data, styleSort]);

  const providerRows = useMemo<ProviderPerfRow[]>(() => {
    if (!data) return [];
    const rows = aggregateProviderPerformance(data);
    const sorters: Record<ProviderSort, (a: ProviderPerfRow, b: ProviderPerfRow) => number> = {
      avgRating: (a, b) => b.avgRating - a.avgRating,
      total: (a, b) => b.total - a.total,
      favoriteRate: (a, b) => b.favoriteRate - a.favoriteRate,
      rejectRate: (a, b) => b.rejectRate - a.rejectRate,
    };
    return [...rows].sort(sorters[providerSort]);
  }, [data, providerSort]);

  const promptRows = useMemo<TopPromptRow[]>(() => {
    if (!data) return [];
    const rows = aggregateTopPrompts(data, 3);
    const sorters: Record<PromptSort, (a: TopPromptRow, b: TopPromptRow) => number> = {
      avgRating: (a, b) => b.avgRating - a.avgRating,
      favoriteCount: (a, b) => b.favoriteCount - a.favoriteCount,
      times: (a, b) => b.times - a.times,
    };
    return [...rows].sort(sorters[promptSort]).slice(0, 100);
  }, [data, promptSort]);

  const collectionRows = useMemo<CollectionPerfRow[]>(() => {
    if (!data) return [];
    const rows = aggregateCollectionPerformance(data);
    const sorters: Record<CollectionSort, (a: CollectionPerfRow, b: CollectionPerfRow) => number> = {
      avgRating: (a, b) => b.avgRating - a.avgRating,
      total: (a, b) => b.total - a.total,
      favoriteCount: (a, b) => b.favoriteCount - a.favoriteCount,
    };
    return [...rows].sort(sorters[collectionSort]);
  }, [data, collectionSort]);

  const availableModes = useMemo(() => {
    const set = new Set<string>();
    data?.images.forEach((i) => i.mode && set.add(i.mode));
    Object.keys(STYLE_LABELS).forEach((k) => set.add(k));
    return Array.from(set).sort();
  }, [data]);

  const availableProviders = useMemo(() => {
    const set = new Set<string>();
    data?.images.forEach((i) => i.generation_provider && set.add(i.generation_provider));
    KNOWN_PROVIDERS.forEach((p) => set.add(p));
    return Array.from(set).sort();
  }, [data]);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Filters */}
      <section className="rounded-md border border-border bg-card p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
          <div>
            <Label className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="font-display text-xs h-9 mt-1" />
          </div>
          <div>
            <Label className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="font-display text-xs h-9 mt-1" />
          </div>
          <div>
            <Label className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">Style</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="font-display text-xs h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={ALL} className="font-display text-xs">All styles</SelectItem>
                {availableModes.map((m) => (
                  <SelectItem key={m} value={m} className="font-display text-xs">{styleLabel(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="font-display text-xs h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} className="font-display text-xs">All providers</SelectItem>
                {availableProviders.map((p) => (
                  <SelectItem key={p} value={p} className="font-display text-xs">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="font-display text-xs w-full h-9">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (<><RefreshCcw className="h-3.5 w-3.5 mr-1.5" />Refresh</>)}
            </Button>
          </div>
        </div>
        <p className="font-display text-[11px] text-muted-foreground">
          {data ? `${data.images.length} images · ${data.collections.length} collections` : "—"}
          {data && data.images.length === 1000 && " (truncated to most recent 1000)"}
        </p>
      </section>

      {!data && loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span className="font-display text-sm">Loading insights…</span>
        </div>
      )}

      {data && (
        <>
          {/* Quick insights */}
          {quick && (
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <StatCard
                label="Highest Rated Style"
                value={quick.highestRatedStyle ? styleLabel(quick.highestRatedStyle.mode) : "—"}
                accent={quick.highestRatedStyle ? `${quick.highestRatedStyle.avg.toFixed(1)}★` : null}
                icon={<Trophy className="h-3.5 w-3.5" />}
              />
              <StatCard
                label="Best Provider Overall"
                value={quick.bestProviderOverall?.provider ?? "—"}
                accent={quick.bestProviderOverall ? `${quick.bestProviderOverall.avg.toFixed(1)}★` : null}
                icon={<Star className="h-3.5 w-3.5" />}
              />
              <StatCard
                label="Most Successful Prompt"
                value={quick.mostSuccessfulPrompt ? `"${quick.mostSuccessfulPrompt.prompt}"` : "—"}
                accent={quick.mostSuccessfulPrompt ? `${quick.mostSuccessfulPrompt.avg.toFixed(1)}★` : null}
                icon={<Star className="h-3.5 w-3.5" />}
                clampValue
              />
              <StatCard
                label="Most Favorited Collection"
                value={quick.mostFavoritedCollection?.name ?? "—"}
                accent={quick.mostFavoritedCollection ? `${quick.mostFavoritedCollection.favorites} ♥` : null}
                icon={<Heart className="h-3.5 w-3.5" />}
              />
              <StatCard
                label="Most Generated Style"
                value={quick.mostGeneratedStyle ? styleLabel(quick.mostGeneratedStyle.mode) : "—"}
                accent={quick.mostGeneratedStyle ? `${quick.mostGeneratedStyle.total} imgs` : null}
                icon={<Trophy className="h-3.5 w-3.5" />}
              />
            </section>
          )}

          {/* Style performance */}
          <Section
            title="Style Performance"
            sort={styleSort}
            onSort={(v) => setStyleSort(v as StyleSort)}
            options={[
              { value: "avgRating", label: "Avg rating" },
              { value: "total", label: "Total images" },
              { value: "favoriteCount", label: "Favorites" },
              { value: "rejectRate", label: "Reject rate" },
            ]}
          >
            <Table
              headers={["Style", "Total", "Avg ★", "♥", "✗", "Rej %", "Cols", "Best provider", "Best model"]}
              rows={styleRows.map((r) => [
                styleLabel(r.mode),
                fmtNum(r.total),
                fmtRating(r.avgRating, r.ratedCount),
                fmtNum(r.favoriteCount),
                fmtNum(r.rejectCount),
                fmtPct(r.rejectRate),
                fmtNum(r.collectionCount),
                r.bestProvider ? `${r.bestProvider} (${r.bestProviderAvg.toFixed(1)}★)` : "—",
                r.bestModel ? `${r.bestModel} (${r.bestModelAvg.toFixed(1)}★)` : "—",
              ])}
              empty="No images yet."
            />
          </Section>

          {/* Provider performance */}
          <Section
            title="Provider Performance (by style)"
            sort={providerSort}
            onSort={(v) => setProviderSort(v as ProviderSort)}
            options={[
              { value: "avgRating", label: "Avg rating" },
              { value: "total", label: "Total images" },
              { value: "favoriteRate", label: "Favorite %" },
              { value: "rejectRate", label: "Reject %" },
            ]}
          >
            <Table
              headers={["Style", "Provider", "Total", "Avg ★", "Fav %", "Rej %"]}
              rows={providerRows.map((r) => [
                styleLabel(r.mode),
                r.provider,
                fmtNum(r.total),
                fmtRating(r.avgRating, r.ratedCount),
                fmtPct(r.favoriteRate),
                fmtPct(r.rejectRate),
              ])}
              empty="No provider data yet."
            />
          </Section>

          {/* Top prompts */}
          <Section
            title="Top Prompts (≥ 3 generations)"
            sort={promptSort}
            onSort={(v) => setPromptSort(v as PromptSort)}
            options={[
              { value: "avgRating", label: "Best Rated" },
              { value: "favoriteCount", label: "Most Saved" },
              { value: "times", label: "Most Generated" },
            ]}
          >
            <Table
              headers={["Prompt", "Times", "Avg ★", "♥", "✗", "Cols"]}
              rows={promptRows.map((r) => [
                r.displayPrompt,
                fmtNum(r.times),
                fmtRating(r.avgRating, r.ratedCount),
                fmtNum(r.favoriteCount),
                fmtNum(r.rejectCount),
                fmtNum(r.collectionCount),
              ])}
              empty="No prompts have been generated at least 3 times yet."
              firstColClass="max-w-[28ch] truncate"
            />
          </Section>

          {/* Collections */}
          <Section
            title="Collection Performance"
            sort={collectionSort}
            onSort={(v) => setCollectionSort(v as CollectionSort)}
            options={[
              { value: "avgRating", label: "Avg rating" },
              { value: "total", label: "Image count" },
              { value: "favoriteCount", label: "Favorites" },
            ]}
          >
            <Table
              headers={["Collection", "Images", "Avg ★", "♥", "✗"]}
              rows={collectionRows.map((r) => [
                r.name,
                fmtNum(r.total),
                fmtRating(r.avgRating, r.ratedCount),
                fmtNum(r.favoriteCount),
                fmtNum(r.rejectCount),
              ])}
              empty="No collections yet."
            />
          </Section>
        </>
      )}
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  accent,
  icon,
  clampValue,
}: {
  label: string;
  value: string;
  accent: string | null;
  icon: React.ReactNode;
  clampValue?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="font-display text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p
        className={cn(
          "font-display text-sm text-foreground leading-tight",
          clampValue && "line-clamp-2",
        )}
        title={value}
      >
        {value}
      </p>
      {accent && <span className="font-display text-xs text-primary">{accent}</span>}
    </div>
  );
}

function Section({
  title,
  children,
  sort,
  onSort,
  options,
}: {
  title: string;
  children: React.ReactNode;
  sort: string;
  onSort: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-muted-foreground">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          <span className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">Sort</span>
          <Select value={sort} onValueChange={onSort}>
            <SelectTrigger className="font-display text-xs h-8 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value} className="font-display text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="rounded-md border border-border bg-card overflow-x-auto">{children}</div>
    </section>
  );
}

function Table({
  headers,
  rows,
  empty,
  firstColClass,
}: {
  headers: string[];
  rows: (string | React.ReactNode)[][];
  empty: string;
  firstColClass?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="font-display text-xs text-muted-foreground p-4 text-center">{empty}</p>
    );
  }
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-border">
          {headers.map((h, i) => (
            <th
              key={i}
              className="font-display text-[10px] uppercase tracking-wider text-muted-foreground px-3 py-2"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border/50 last:border-0">
            {r.map((cell, j) => (
              <td
                key={j}
                className={cn(
                  "font-display text-xs text-foreground px-3 py-2 align-top",
                  j === 0 && firstColClass,
                )}
                title={typeof cell === "string" ? cell : undefined}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Formatting ──────────────────────────────────────────────────────────

const fmtNum = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => `${Math.round(n * 100)}%`;
const fmtRating = (avg: number, count: number) =>
  count === 0 ? "—" : `${avg.toFixed(1)} (${count})`;
void Star;
void Heart;
void Ban;
