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

export async function retryFailedItems(jobId: string) {
  // Only reset failed items back to queued — completed items are untouched
  const { error: resetError } = await supabase
    .from("generation_job_items")
    .update({ status: "queued", error_message: null, updated_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("status", "failed");
  if (resetError) throw resetError;

  // Re-count from items to get accurate failed_images count
  const { data: allItems } = await supabase
    .from("generation_job_items")
    .select("status")
    .eq("job_id", jobId);

  const failed = allItems?.filter((it) => it.status === "failed").length || 0;

  // Set job back to queued for re-processing
  const { error: jobError } = await supabase
    .from("generation_jobs")
    .update({
      status: "queued",
      failed_images: failed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (jobError) throw jobError;

  // Re-invoke the edge function
  supabase.functions
    .invoke("batch-generate", { body: { jobId } })
    .catch((err) => console.error("Failed to invoke batch-generate:", err));
}

export async function deleteJob(jobId: string) {
  // Delete items first (cascade should handle this, but be explicit)
  await supabase.from("generation_job_items").delete().eq("job_id", jobId);
  const { error } = await supabase.from("generation_jobs").delete().eq("id", jobId);
  if (error) throw error;
}

/** All available styles for style grid */
export const ALL_STYLES = [
  { value: "japanese", label: "🏯 Ukiyo-e" },
  { value: "freestyle", label: "🏯 Ukiyo-e Freestyle" },
  { value: "popart", label: "🎯 Pop Art" },
  { value: "popart-freestyle", label: "🎯 Pop Art Freestyle" },
  { value: "lineart", label: "✒️ Line Art" },
  { value: "lineart-freestyle", label: "✒️ Line Art Freestyle" },
  { value: "lineart-minimal", label: "〰️ Minimal Lines" },
  { value: "minimalism", label: "◻ Minimalism" },
  { value: "minimalism-freestyle", label: "◻ Minimalism Freestyle" },
  { value: "graffiti", label: "🎨 Graffiti" },
  { value: "graffiti-freestyle", label: "🎨 Graffiti Freestyle" },
  { value: "botanical", label: "🌿 Botanical" },
  { value: "botanical-freestyle", label: "🌿 Botanical Freestyle" },
  { value: "urbannoir", label: "🖤 Urban Noir" },
  { value: "urbannoir-freestyle", label: "🖤 Urban Noir Freestyle" },
  { value: "screenprint", label: "🖨️ Screen Print" },
  { value: "screenprint-freestyle", label: "🖨️ Screen Print Freestyle" },
  { value: "risograph", label: "📠 Risograph" },
  { value: "risograph-freestyle", label: "📠 Risograph Freestyle" },
  { value: "retrocomic", label: "💥 Retro Comic" },
  { value: "retrocomic-freestyle", label: "💥 Retro Comic Freestyle" },
  { value: "pulpmagazine", label: "📕 Pulp Magazine" },
  { value: "pulpmagazine-freestyle", label: "📕 Pulp Magazine Freestyle" },
  { value: "tattooflash", label: "🔥 Tattoo Flash" },
  { value: "tattooflash-freestyle", label: "🔥 Tattoo Flash Freestyle" },
  { value: "brutalistposter", label: "⬛ Brutalist Poster" },
  { value: "brutalistposter-freestyle", label: "⬛ Brutalist Poster Freestyle" },
  { value: "xeroxzine", label: "📋 Xerox Zine" },
  { value: "xeroxzine-freestyle", label: "📋 Xerox Zine Freestyle" },
  { value: "artnouveau", label: "🌸 Art Nouveau" },
  { value: "artnouveau-freestyle", label: "🌸 Art Nouveau Freestyle" },
  { value: "midcenturymodern", label: "🌞 Mid-Century Modern" },
  { value: "midcenturymodern-freestyle", label: "🌞 Mid-Century Modern Freestyle" },
  { value: "loosewatercolor", label: "💧 Loose Watercolor" },
  { value: "loosewatercolor-freestyle", label: "💧 Loose Watercolor Freestyle" },
] as const;
