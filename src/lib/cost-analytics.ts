/**
 * Cost analytics — read & aggregate `asset_cost_events`.
 *
 * Pure aggregation helpers + a thin Supabase fetch.
 * Admin-only at the policy layer; this module assumes the caller is allowed.
 */
import { supabase } from "@/integrations/supabase/client";

export interface CostEventRow {
  id: string;
  generated_image_id: string | null;
  event_type: string;
  provider: string | null;
  model: string | null;
  mode: string | null;
  estimated_cost: number | null;
  currency: string | null;
  status: string;
  created_at: string;
}

export interface CostFilters {
  from?: string | null; // ISO
  to?: string | null;   // ISO
  eventType?: string | null;
  provider?: string | null;
  status?: string | null; // default "succeeded"
}

export async function fetchCostEvents(
  filters: CostFilters = {},
  limit = 5000,
): Promise<CostEventRow[]> {
  let q = supabase
    .from("asset_cost_events")
    .select(
      "id,generated_image_id,event_type,provider,model,mode,estimated_cost,currency,status,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);
  if (filters.eventType) q = q.eq("event_type", filters.eventType);
  if (filters.provider) q = q.eq("provider", filters.provider);
  if (filters.status) q = q.eq("status", filters.status);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CostEventRow[];
}

// ── Aggregations ───────────────────────────────────────────────────────

export interface Summary {
  totalKnownCost: number;
  unknownCount: number;
  eventCount: number;
  distinctImages: number;
  currency: string;
  knownPct: number;
}

export function summarize(rows: CostEventRow[]): Summary {
  let total = 0;
  let unknown = 0;
  let currency = "USD";
  const imgs = new Set<string>();
  for (const r of rows) {
    if (r.generated_image_id) imgs.add(r.generated_image_id);
    if (typeof r.estimated_cost === "number") {
      total += Number(r.estimated_cost);
      if (r.currency) currency = r.currency;
    } else {
      unknown += 1;
    }
  }
  const known = rows.length - unknown;
  return {
    totalKnownCost: total,
    unknownCount: unknown,
    eventCount: rows.length,
    distinctImages: imgs.size,
    currency,
    knownPct: rows.length === 0 ? 0 : known / rows.length,
  };
}

export interface GroupRow {
  key: string;
  events: number;
  knownCost: number;
  unknownCount: number;
  avgCost: number; // over known-cost events only
}

function groupBy(
  rows: CostEventRow[],
  keyFn: (r: CostEventRow) => string | null,
): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const r of rows) {
    const k = keyFn(r) ?? "(unknown)";
    const g = map.get(k) ?? { key: k, events: 0, knownCost: 0, unknownCount: 0, avgCost: 0 };
    g.events += 1;
    if (typeof r.estimated_cost === "number") g.knownCost += Number(r.estimated_cost);
    else g.unknownCount += 1;
    map.set(k, g);
  }
  for (const g of map.values()) {
    const known = g.events - g.unknownCount;
    g.avgCost = known > 0 ? g.knownCost / known : 0;
  }
  return Array.from(map.values()).sort((a, b) => b.knownCost - a.knownCost || b.events - a.events);
}

export const groupByProvider = (rows: CostEventRow[]) => groupBy(rows, (r) => r.provider);
export const groupByMode = (rows: CostEventRow[]) => groupBy(rows, (r) => r.mode);
export const groupByEventType = (rows: CostEventRow[]) => groupBy(rows, (r) => r.event_type);

export interface DailyRow {
  date: string; // YYYY-MM-DD (UTC)
  events: number;
  knownCost: number;
  unknownCount: number;
}

export function groupByDay(rows: CostEventRow[]): DailyRow[] {
  const map = new Map<string, DailyRow>();
  for (const r of rows) {
    const d = r.created_at.slice(0, 10);
    const g = map.get(d) ?? { date: d, events: 0, knownCost: 0, unknownCount: 0 };
    g.events += 1;
    if (typeof r.estimated_cost === "number") g.knownCost += Number(r.estimated_cost);
    else g.unknownCount += 1;
    map.set(d, g);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function formatCost(amount: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 4,
    }).format(amount);
  } catch {
    return `${amount.toFixed(4)} ${currency}`;
  }
}
