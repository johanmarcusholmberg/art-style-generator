/**
 * Style Lab — Insights aggregation helpers (Phase 4).
 *
 * Pure client-side aggregation over recent generated_images plus
 * collection membership. No new tables, no background jobs.
 *
 * Fetcher loads up to N recent rows (default 1000) and joins with
 * collection_images / collections in two extra queries.
 */

import { supabase } from "@/integrations/supabase/client";

// ── Types ───────────────────────────────────────────────────────────────

export interface InsightImage {
  id: string;
  mode: string;
  generation_provider: string | null;
  generation_model: string | null;
  prompt: string;
  rating: number;
  is_favorite: boolean;
  is_archived: boolean;
  is_rejected: boolean;
  created_at: string;
}

export interface CollectionLite {
  id: string;
  name: string;
}

export interface InsightsData {
  images: InsightImage[];
  collections: CollectionLite[];
  /** image_id -> Set<collection_id> */
  membership: Map<string, Set<string>>;
}

export interface InsightsFilters {
  from?: string | null;     // ISO date
  to?: string | null;       // ISO date
  mode?: string | null;
  provider?: string | null;
}

// ── Fetcher ─────────────────────────────────────────────────────────────

export async function fetchInsightsData(opts: {
  limit?: number;
  filters?: InsightsFilters;
} = {}): Promise<InsightsData> {
  const limit = opts.limit ?? 1000;
  const filters = opts.filters ?? {};

  let q = supabase
    .from("generated_images")
    .select(
      "id,mode,generation_provider,generation_model,prompt,rating,is_favorite,is_archived,is_rejected,created_at,deleted_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.mode) q = q.eq("mode", filters.mode);
  if (filters.provider) q = q.eq("generation_provider", filters.provider);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);

  const { data: imgRows, error: imgErr } = await q;
  if (imgErr) throw imgErr;

  const images: InsightImage[] = ((imgRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    mode: String(r.mode ?? ""),
    generation_provider: (r.generation_provider as string | null) ?? null,
    generation_model: (r.generation_model as string | null) ?? null,
    prompt: String(r.prompt ?? ""),
    rating: Number(r.rating ?? 0),
    is_favorite: Boolean(r.is_favorite),
    is_archived: Boolean(r.is_archived),
    is_rejected: Boolean(r.is_rejected),
    created_at: String(r.created_at ?? ""),
  }));

  // Collections + membership (scoped to loaded images).
  const ids = images.map((i) => i.id);
  const [colRes, memRes] = await Promise.all([
    supabase.from("collections").select("id,name"),
    ids.length > 0
      ? supabase.from("collection_images").select("collection_id,image_id").in("image_id", ids)
      : Promise.resolve({ data: [] as Array<{ collection_id: string; image_id: string }>, error: null }),
  ]);
  if (colRes.error) throw colRes.error;
  if (memRes.error) throw memRes.error;

  const collections: CollectionLite[] = ((colRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => ({
    id: String(c.id),
    name: String(c.name),
  }));

  const membership = new Map<string, Set<string>>();
  for (const m of (memRes.data ?? []) as Array<{ collection_id: string; image_id: string }>) {
    const k = String(m.image_id);
    if (!membership.has(k)) membership.set(k, new Set());
    membership.get(k)!.add(String(m.collection_id));
  }

  return { images, collections, membership };
}

// ── Helpers ─────────────────────────────────────────────────────────────

export function normalizePrompt(p: string): string {
  return p.trim().toLowerCase().replace(/\s+/g, " ");
}

interface RatingAgg {
  sum: number;
  count: number;
}
const empty = (): RatingAgg => ({ sum: 0, count: 0 });
const avg = (a: RatingAgg): number => (a.count > 0 ? a.sum / a.count : 0);

// ── Section aggregations ────────────────────────────────────────────────

export interface StylePerfRow {
  mode: string;
  total: number;
  avgRating: number;
  ratedCount: number;
  favoriteCount: number;
  rejectCount: number;
  rejectRate: number;
  collectionCount: number;
  bestProvider: string | null;
  bestProviderAvg: number;
  bestModel: string | null;
  bestModelAvg: number;
}

const MIN_SAMPLE = 5;

export function aggregateStylePerformance(data: InsightsData): StylePerfRow[] {
  const byMode = new Map<string, InsightImage[]>();
  for (const img of data.images) {
    if (!byMode.has(img.mode)) byMode.set(img.mode, []);
    byMode.get(img.mode)!.push(img);
  }

  const rows: StylePerfRow[] = [];
  for (const [mode, imgs] of byMode) {
    const rated = imgs.filter((i) => i.rating > 0);
    const ratedAgg: RatingAgg = rated.reduce(
      (acc, i) => ({ sum: acc.sum + i.rating, count: acc.count + 1 }),
      empty(),
    );

    // Best provider / model by avg rating with min sample.
    const provAgg = new Map<string, RatingAgg>();
    const modelAgg = new Map<string, RatingAgg>();
    for (const i of rated) {
      if (i.generation_provider) {
        const k = i.generation_provider;
        const a = provAgg.get(k) ?? empty();
        a.sum += i.rating;
        a.count += 1;
        provAgg.set(k, a);
      }
      if (i.generation_model) {
        const k = i.generation_model;
        const a = modelAgg.get(k) ?? empty();
        a.sum += i.rating;
        a.count += 1;
        modelAgg.set(k, a);
      }
    }
    const pickBest = (m: Map<string, RatingAgg>): { key: string | null; avg: number } => {
      let best: { key: string | null; avg: number } = { key: null, avg: 0 };
      for (const [k, a] of m) {
        if (a.count < MIN_SAMPLE) continue;
        const v = avg(a);
        if (v > best.avg) best = { key: k, avg: v };
      }
      return best;
    };
    const bp = pickBest(provAgg);
    const bm = pickBest(modelAgg);

    // Distinct collections containing images of this style.
    const cols = new Set<string>();
    for (const i of imgs) {
      const s = data.membership.get(i.id);
      if (s) for (const c of s) cols.add(c);
    }

    const rejects = imgs.filter((i) => i.is_rejected).length;
    rows.push({
      mode,
      total: imgs.length,
      avgRating: avg(ratedAgg),
      ratedCount: ratedAgg.count,
      favoriteCount: imgs.filter((i) => i.is_favorite).length,
      rejectCount: rejects,
      rejectRate: imgs.length > 0 ? rejects / imgs.length : 0,
      collectionCount: cols.size,
      bestProvider: bp.key,
      bestProviderAvg: bp.avg,
      bestModel: bm.key,
      bestModelAvg: bm.avg,
    });
  }
  return rows;
}

export interface ProviderPerfRow {
  mode: string;
  provider: string;
  total: number;
  avgRating: number;
  ratedCount: number;
  favoriteRate: number;
  rejectRate: number;
}

export function aggregateProviderPerformance(data: InsightsData): ProviderPerfRow[] {
  const byKey = new Map<string, InsightImage[]>();
  for (const img of data.images) {
    if (!img.generation_provider) continue;
    const k = `${img.mode}|${img.generation_provider}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(img);
  }
  const rows: ProviderPerfRow[] = [];
  for (const [k, imgs] of byKey) {
    const [mode, provider] = k.split("|");
    const rated = imgs.filter((i) => i.rating > 0);
    const ratedAgg = rated.reduce(
      (acc, i) => ({ sum: acc.sum + i.rating, count: acc.count + 1 }),
      empty(),
    );
    rows.push({
      mode,
      provider,
      total: imgs.length,
      avgRating: avg(ratedAgg),
      ratedCount: ratedAgg.count,
      favoriteRate: imgs.filter((i) => i.is_favorite).length / imgs.length,
      rejectRate: imgs.filter((i) => i.is_rejected).length / imgs.length,
    });
  }
  return rows;
}

export interface TopPromptRow {
  promptKey: string;     // normalized
  displayPrompt: string; // most-recent variant
  times: number;
  avgRating: number;
  ratedCount: number;
  favoriteCount: number;
  rejectCount: number;
  collectionCount: number;
}

export function aggregateTopPrompts(data: InsightsData, minOccurrences = 3): TopPromptRow[] {
  const byKey = new Map<string, InsightImage[]>();
  for (const img of data.images) {
    const k = normalizePrompt(img.prompt);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(img);
  }
  const rows: TopPromptRow[] = [];
  for (const [key, imgs] of byKey) {
    if (imgs.length < minOccurrences) continue;
    const rated = imgs.filter((i) => i.rating > 0);
    const ratedAgg = rated.reduce(
      (acc, i) => ({ sum: acc.sum + i.rating, count: acc.count + 1 }),
      empty(),
    );
    const cols = new Set<string>();
    for (const i of imgs) {
      const s = data.membership.get(i.id);
      if (s) for (const c of s) cols.add(c);
    }
    // Most recent (images array is in fetch order — newest first).
    rows.push({
      promptKey: key,
      displayPrompt: imgs[0].prompt,
      times: imgs.length,
      avgRating: avg(ratedAgg),
      ratedCount: ratedAgg.count,
      favoriteCount: imgs.filter((i) => i.is_favorite).length,
      rejectCount: imgs.filter((i) => i.is_rejected).length,
      collectionCount: cols.size,
    });
  }
  return rows;
}

export interface CollectionPerfRow {
  id: string;
  name: string;
  total: number;
  avgRating: number;
  ratedCount: number;
  favoriteCount: number;
  rejectCount: number;
}

export function aggregateCollectionPerformance(data: InsightsData): CollectionPerfRow[] {
  // Invert membership: collection_id -> image[]
  const byCol = new Map<string, InsightImage[]>();
  const imgById = new Map(data.images.map((i) => [i.id, i] as const));
  for (const [imageId, cols] of data.membership) {
    const img = imgById.get(imageId);
    if (!img) continue;
    for (const cId of cols) {
      if (!byCol.has(cId)) byCol.set(cId, []);
      byCol.get(cId)!.push(img);
    }
  }
  const rows: CollectionPerfRow[] = [];
  for (const c of data.collections) {
    const imgs = byCol.get(c.id) ?? [];
    const rated = imgs.filter((i) => i.rating > 0);
    const ratedAgg = rated.reduce(
      (acc, i) => ({ sum: acc.sum + i.rating, count: acc.count + 1 }),
      empty(),
    );
    rows.push({
      id: c.id,
      name: c.name,
      total: imgs.length,
      avgRating: avg(ratedAgg),
      ratedCount: ratedAgg.count,
      favoriteCount: imgs.filter((i) => i.is_favorite).length,
      rejectCount: imgs.filter((i) => i.is_rejected).length,
    });
  }
  return rows;
}

export interface QuickInsights {
  highestRatedStyle: { mode: string; avg: number } | null;
  bestProviderOverall: { provider: string; avg: number } | null;
  mostSuccessfulPrompt: { prompt: string; avg: number } | null;
  mostFavoritedCollection: { name: string; favorites: number } | null;
  mostGeneratedStyle: { mode: string; total: number } | null;
}

export function computeQuickInsights(data: InsightsData): QuickInsights {
  const styles = aggregateStylePerformance(data);
  const ratedStyles = styles.filter((s) => s.ratedCount >= MIN_SAMPLE);
  const highest = ratedStyles.length
    ? ratedStyles.reduce((a, b) => (b.avgRating > a.avgRating ? b : a))
    : null;
  const mostGen = styles.length
    ? styles.reduce((a, b) => (b.total > a.total ? b : a))
    : null;

  // Provider overall avg.
  const provAgg = new Map<string, RatingAgg>();
  for (const i of data.images) {
    if (!i.generation_provider || i.rating <= 0) continue;
    const a = provAgg.get(i.generation_provider) ?? empty();
    a.sum += i.rating;
    a.count += 1;
    provAgg.set(i.generation_provider, a);
  }
  let bestProv: { provider: string; avg: number } | null = null;
  for (const [k, a] of provAgg) {
    if (a.count < MIN_SAMPLE) continue;
    const v = avg(a);
    if (!bestProv || v > bestProv.avg) bestProv = { provider: k, avg: v };
  }

  const prompts = aggregateTopPrompts(data).filter((p) => p.ratedCount >= MIN_SAMPLE);
  const bestPrompt = prompts.length
    ? prompts.reduce((a, b) => (b.avgRating > a.avgRating ? b : a))
    : null;

  const cols = aggregateCollectionPerformance(data);
  const bestCol = cols.length
    ? cols.reduce((a, b) => (b.favoriteCount > a.favoriteCount ? b : a))
    : null;

  return {
    highestRatedStyle: highest ? { mode: highest.mode, avg: highest.avgRating } : null,
    bestProviderOverall: bestProv,
    mostSuccessfulPrompt: bestPrompt ? { prompt: bestPrompt.displayPrompt, avg: bestPrompt.avgRating } : null,
    mostFavoritedCollection:
      bestCol && bestCol.favoriteCount > 0 ? { name: bestCol.name, favorites: bestCol.favoriteCount } : null,
    mostGeneratedStyle: mostGen ? { mode: mostGen.mode, total: mostGen.total } : null,
  };
}
