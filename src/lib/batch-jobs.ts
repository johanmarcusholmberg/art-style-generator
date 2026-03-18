import { supabase } from "@/integrations/supabase/client";

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
  /** For style grid: which styles to generate */
  styleGridStyles?: string[];
  /** For matrix: variables to combine */
  matrixVariables?: Record<string, string[]>;
}

/**
 * Expand matrix variables into all combinations.
 */
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
 */
export async function createBatchJob(config: BatchJobConfig): Promise<string> {
  const items: Array<{ prompt_variant: string; style: string | null }> = [];

  if (config.jobType === "style-grid" && config.styleGridStyles?.length) {
    for (const style of config.styleGridStyles) {
      for (let i = 0; i < config.batchSize; i++) {
        items.push({ prompt_variant: config.prompt, style });
      }
    }
  } else if (config.jobType === "matrix" && config.matrixVariables) {
    const prompts = expandMatrix(config.prompt, config.matrixVariables);
    for (const p of prompts) {
      items.push({ prompt_variant: p, style: null });
    }
  } else {
    for (let i = 0; i < config.batchSize; i++) {
      items.push({ prompt_variant: config.prompt, style: null });
    }
  }

  const totalImages = items.length;

  const { data: job, error: jobError } = await supabase
    .from("generation_jobs")
    .insert({
      prompt: config.prompt,
      mode: config.mode,
      batch_size: config.batchSize,
      total_images: totalImages,
      aspect_ratio: config.aspectRatio,
      print_size: config.printSize,
      hd_enhance: config.hdEnhance,
      white_frame: false, // deprecated but kept for DB compat
      background_style: config.backgroundStyle,
      speed_mode: config.speedMode,
      job_type: config.jobType,
      style_grid_styles: config.styleGridStyles || null,
      matrix_variables: config.matrixVariables || null,
      status: "queued",
    })
    .select("id")
    .single();

  if (jobError || !job) throw new Error(jobError?.message || "Failed to create job");

  const jobItems = items.map((item) => ({
    job_id: job.id,
    prompt_variant: item.prompt_variant,
    style: item.style,
    seed: Math.floor(Math.random() * 999999),
    status: "queued" as const,
  }));

  const { error: itemsError } = await supabase.from("generation_job_items").insert(jobItems);
  if (itemsError) throw new Error(itemsError.message);

  supabase.functions
    .invoke("batch-generate", { body: { jobId: job.id } })
    .catch((err) => console.error("Failed to invoke batch-generate:", err));

  return job.id;
}

export async function cancelJob(jobId: string) {
  const { error } = await supabase.from("generation_jobs").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", jobId);
  if (error) throw error;
}

export async function retryFailedItems(jobId: string) {
  const { error: resetError } = await supabase.from("generation_job_items").update({ status: "queued", error_message: null, updated_at: new Date().toISOString() }).eq("job_id", jobId).eq("status", "failed");
  if (resetError) throw resetError;

  const { error: jobError } = await supabase.from("generation_jobs").update({ status: "queued", failed_images: 0, updated_at: new Date().toISOString() }).eq("id", jobId);
  if (jobError) throw jobError;

  supabase.functions.invoke("batch-generate", { body: { jobId } }).catch((err) => console.error("Failed to invoke batch-generate:", err));
}

export async function deleteJob(jobId: string) {
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
] as const;
