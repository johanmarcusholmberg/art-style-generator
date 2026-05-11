/**
 * Cost-event helpers (Part D of architecture upgrade).
 *
 * The DB table `public.asset_cost_events` uses the column name
 * `generated_image_id` (not `image_id`). This module is the single
 * mapping layer between the frontend's `imageId` concept and the actual
 * column, so callers don't have to think about it.
 *
 * Recording is BEST-EFFORT. A failure here MUST NEVER block generation,
 * save, upscale, or export. Errors are logged as warnings only.
 */
import { supabase } from "@/integrations/supabase/client";

export type AssetCostEventStatus = "succeeded" | "failed" | "pending";

export interface RecordAssetCostEventInput {
  imageId: string;
  eventType: "generation" | "upscale" | "print_export" | string;
  provider: string;
  model?: string | null;
  mode?: string | null;
  estimatedCost?: number | null;
  currency?: string;
  status?: AssetCostEventStatus;
  metadata?: Record<string, unknown>;
}

export async function recordAssetCostEvent(
  input: RecordAssetCostEventInput,
): Promise<void> {
  try {
    const { error } = await supabase.from("asset_cost_events").insert({
      generated_image_id: input.imageId,
      event_type: input.eventType,
      provider: input.provider,
      model: input.model ?? null,
      mode: input.mode ?? null,
      estimated_cost: input.estimatedCost ?? null,
      currency: input.currency ?? "USD",
      status: input.status ?? "succeeded",
      metadata: (input.metadata ?? {}) as never,
    } as never);
    if (error) {
      console.warn("[cost-events] insert failed (non-fatal):", error.message);
    }
  } catch (e) {
    console.warn("[cost-events] insert threw (non-fatal):", e);
  }
}

export interface CostEventRow {
  id: string;
  event_type: string;
  provider: string | null;
  model: string | null;
  mode: string | null;
  estimated_cost: number | null;
  currency: string | null;
  status: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export async function fetchCostEventsForImage(
  imageId: string,
): Promise<CostEventRow[]> {
  const { data, error } = await supabase
    .from("asset_cost_events")
    .select(
      "id,event_type,provider,model,mode,estimated_cost,currency,status,created_at,metadata",
    )
    .eq("generated_image_id", imageId)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[cost-events] fetch failed:", error.message);
    return [];
  }
  return (data || []) as unknown as CostEventRow[];
}

export interface CostSummary {
  totalKnown: number;
  hasUnknown: boolean;
  count: number;
  currency: string;
}

export function summarizeImageCost(events: CostEventRow[]): CostSummary {
  let total = 0;
  let hasUnknown = false;
  let currency = "USD";
  for (const e of events) {
    if (e.status !== "succeeded") continue;
    if (typeof e.estimated_cost === "number") {
      total += Number(e.estimated_cost);
      if (e.currency) currency = e.currency;
    } else {
      hasUnknown = true;
    }
  }
  return { totalKnown: total, hasUnknown, count: events.length, currency };
}

export function formatCost(amount: number | null | undefined, currency = "USD"): string {
  if (amount === null || amount === undefined) return "Cost unknown";
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
