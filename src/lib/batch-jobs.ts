import { supabase } from "@/integrations/supabase/client";
import type { QualityTarget } from "@/lib/print-resolution";

export interface BatchJobConfig {
  prompt: string;
  mode: string;
  batchSize: number;
  aspectRatio: string;
  printSize: string | null;
  hdEnhance: boolean;
  backgroundStyle: "white" | "cream";
  speedMode: "fast" | "quality";
  jobType: "batch" | "style-grid" | "matrix";
  styleGridStyles?: string[];
  matrixVariables?: Record<string, string[]>;
  qualityTarget?: QualityTarget;
  targetPpi?: number;
  targetWidthPx?: number;
  targetHeightPx?: number;
}

function expandMatrix(basePrompt: string, variables: Record<string, string[]>): string[] {
  const keys = Object.keys(variables);
  if (keys.length === 0) return [basePrompt];

  let combinations: Record<string, string>[] = [{}];
  for (const key of keys) {
    const values = variables[key];
    const newCombinations: Record<string, string>[] = [];
    for (const combo of combinations) {
      for (const val of values) {
        newCombinations.push({ ...combo, [key]: val });
      }
    }
    combinations = newCombinations;
  }

  return combinations.map((combo) => {
    let result = basePrompt;
    for (const [key, val] of Object.entries(combo)) {
      result += `, ${key}: ${val}`;
    }
    return result;
  });
}

/**
 * Creates a generation job with items and kicks off background processing.
 * Uses the SECURITY DEFINER `create_generation_job` RPC so the job is created
 * atomically with idempotency, profile ownership, and per-item request
 * payloads that the server worker can reproduce.
 */
export async function createBatchJob(config: BatchJobConfig): Promise<string> {
  interface Item {
    prompt: string;
    styleKey: string;
    providerLabel?: string;
  }
  const items: Item[] = [];

  if (config.jobType === "style-grid" && config.styleGridStyles?.length) {
    for (const style of config.styleGridStyles) {
      for (let i = 0; i < config.batchSize; i++) {
        items.push({ prompt: config.prompt, styleKey: style, providerLabel: style });
      }
    }
  } else if (config.jobType === "matrix" && config.matrixVariables) {
    const prompts = expandMatrix(config.prompt, config.matrixVariables);
    for (const p of prompts) {
      for (let i = 0; i < config.batchSize; i++) {
        items.push({ prompt: p, styleKey: config.mode });
      }
    }
  } else {
    for (let i = 0; i < config.batchSize; i++) {
      items.push({ prompt: config.prompt, styleKey: config.mode });
    }
  }

  const totalImages = items.length;

  // Deterministic idempotency key so a duplicate submit reuses the job.
  const idempotencyKey =
    (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`) + `-b${totalImages}`;

  // Build per-item request_payload the server worker can execute directly.
  const itemPayloads = items.map((it) => ({
    prompt: it.prompt,
    styleKey: it.styleKey,
    providerLabel: it.providerLabel ?? null,
    aspectRatio: config.aspectRatio,
    backgroundStyle: config.backgroundStyle,
    generationMode: config.hdEnhance ? "print-ready" : "standard",
    printSize: config.printSize,
    qualityMode: config.speedMode === "fast" ? "web" : "quality",
    targetPpi: config.targetPpi ?? null,
    targetWidthPx: config.targetWidthPx ?? null,
    targetHeightPx: config.targetHeightPx ?? null,
    mode: config.mode,
  }));

  const { data, error } = await supabase.rpc("create_generation_job", {
    p_idempotency_key: idempotencyKey,
    p_job_type: config.jobType,
    p_style_key: config.mode,
    p_generation_mode: config.hdEnhance ? "print-ready" : "standard",
    p_context_key: config.jobType === "style-grid" ? "style-grid" : null,
    p_prompt: config.prompt,
    p_aspect_ratio: config.aspectRatio,
    p_background_style: config.backgroundStyle,
    p_items: itemPayloads as unknown as never,
  });
  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    throw new Error(error?.message || "Failed to create job");
  }
  const jobId = Array.isArray(data) ? (data[0] as { job_id: string }).job_id : (data as { job_id: string }).job_id;

  // Fire and forget — the edge function handles everything from here
  supabase.functions
    .invoke("batch-generate", { body: { jobId } })
    .catch((err) => console.error("Failed to invoke batch-generate:", err));

  return jobId;
}


export async function cancelJob(jobId: string) {
  // Cancel the job — only if it's still in a cancellable state
  const { error } = await supabase
    .from("generation_jobs")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .in("status", ["queued", "processing"]);
  if (error) throw error;

  // Also mark any remaining queued items as cancelled
  await supabase
    .from("generation_job_items")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("status", "queued");
}

/**
 * Retry every failed item in a job through the DURABLE server path.
 *
 * The old implementation directly mutated `generation_jobs` and
 * `generation_job_items` from the browser to reset failed rows to
 * `queued`, then re-invoked `batch-generate` to sweep the whole job.
 * That bypassed lease/attempt bookkeeping and could race the aggregate
 * trigger. It is intentionally removed here: retry now goes through
 * `generate-single-item-retry`, which validates ownership, resets the
 * single item under the RPC contract, and dispatches `generate-single`.
 *
 * We fan out one edge-function call per failed item so the aggregate
 * trigger drives the job status forward as each retry lands.
 */
export async function retryFailedItems(jobId: string) {
  const { data: failedItems, error: selErr } = await supabase
    .from("generation_job_items")
    .select("id")
    .eq("job_id", jobId)
    .eq("status", "failed");
  if (selErr) throw selErr;
  if (!failedItems || failedItems.length === 0) return;

  await Promise.all(
    failedItems.map((it) =>
      supabase.functions
        .invoke("generate-single-item-retry", { body: { itemId: it.id } })
        .catch((err) =>
          console.error(`[retryFailedItems] item ${it.id} retry dispatch failed:`, err),
        ),
    ),
  );
}

export async function deleteJob(jobId: string) {
  // Delete items first (cascade should handle this, but be explicit)
  await supabase.from("generation_job_items").delete().eq("job_id", jobId);
  const { error } = await supabase.from("generation_jobs").delete().eq("id", jobId);
  if (error) throw error;
}

/**
 * All available styles for the style grid. Derived from the canonical
 * `style-registry` so newly-added styles (Whimsical Japanese, Modernist
 * Cocktail, Mediterranean Heritage, Scandinavian, Vintage, …) show up
 * automatically without a manual list to keep in sync.
 */
export { getBatchStyleOptions } from "@/lib/style-registry";
import { getBatchStyleOptions } from "@/lib/style-registry";
export const ALL_STYLES: ReadonlyArray<{ value: string; label: string }> =
  getBatchStyleOptions();
