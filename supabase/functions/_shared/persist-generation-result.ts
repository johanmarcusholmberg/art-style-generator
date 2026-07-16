/**
 * Shared helper — durably persist a generated image before we mark the
 * generation_job_item as completed.
 *
 * Steps:
 *   1. Decode a data: URL or fetch a remote URL into bytes.
 *   2. Upload the PNG into the `generated-images` bucket.
 *   3. Insert a row into `generated_images` so it shows up in galleries.
 *   4. Return the storage path, gallery id and a public URL for realtime.
 *
 * B1.1 update: accepts and persists the full metadata-parity column set
 * (provider/model/route/print-format/dimensions/upscale linkage). Side-
 * effect ownership between server-inserted rows and any client-owned
 * post-processing is finalized in B1.2 — this turn only broadens the
 * server row so parity is possible.
 *
 * Callers MUST await this before calling complete_generation_item.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface PersistArgs {
  imageUrl: string;
  prompt: string;
  mode: string;
  aspectRatio: string;
  printSize?: string | null;
  qualityMode?: string;
  targetPpi?: number | null;
  targetWidthPx?: number | null;
  targetHeightPx?: number | null;
  enhanced?: boolean;
  providerLabel?: string | null;
  // ── B1.1 parity fields (all optional / nullable) ──────────────────────
  actualWidthPx?: number | null;
  actualHeightPx?: number | null;
  generationProvider?: string | null;
  generationModel?: string | null;
  providerStrategy?: string | null;
  fallbackUsed?: boolean | null;
  executionRoute?: string | null;
  printFormatId?: string | null;
  generationMode?: string | null;
  provider?: string | null;
  model?: string | null;
  route?: string | null;
  estimatedCost?: number | null;
  currency?: string | null;
  promptVersion?: string | null;
  requestedModelId?: string | null;
  resolvedModelId?: string | null;
  selectedAdapterId?: string | null;
  qualityProfile?: string | null;
  generationStrategy?: string | null;
  modelFallbackReason?: string | null;
  sourceImageUrl?: string | null;
  sourceStoragePath?: string | null;
  sourceFileName?: string | null;
  upscaleApplied?: boolean | null;
  upscaleMethod?: string | null;
  upscaleFactor?: number | null;
}

export interface PersistResult {
  storagePath: string;
  galleryImageId: string;
  publicUrl: string;
  bytes: number;
}

async function toBytes(imageUrl: string): Promise<Uint8Array> {
  if (imageUrl.startsWith("data:")) {
    const b64 = imageUrl.split(",")[1] ?? "";
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`fetch image failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE env");
  return createClient(url, key);
}

export async function persistGenerationResult(
  supabase: SupabaseClient,
  args: PersistArgs,
): Promise<PersistResult> {
  const bytes = await toBytes(args.imageUrl);
  const filename = `${args.mode}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.png`;

  const { error: upErr } = await supabase.storage
    .from("generated-images")
    .upload(filename, bytes, { contentType: "image/png" });
  if (upErr) throw new Error(`storage upload: ${upErr.message}`);

  const { data: pub } = supabase.storage.from("generated-images").getPublicUrl(filename);

  const { data: row, error: insErr } = await supabase
    .from("generated_images")
    .insert({
      prompt: args.prompt,
      mode: args.mode,
      aspect_ratio: args.aspectRatio,
      storage_path: filename,
      master_storage_path: filename,
      print_size: args.printSize ?? null,
      quality_mode: args.qualityMode ?? "quality",
      target_ppi: args.targetPpi ?? null,
      target_width_px: args.targetWidthPx ?? null,
      target_height_px: args.targetHeightPx ?? null,
      actual_width_px: args.actualWidthPx ?? null,
      actual_height_px: args.actualHeightPx ?? null,
      enhanced: args.enhanced ?? false,
      generation_provider: args.generationProvider ?? null,
      generation_model: args.generationModel ?? null,
      provider_strategy: args.providerStrategy ?? null,
      fallback_used: args.fallbackUsed ?? false,
      execution_route: args.executionRoute ?? null,
      print_format_id: args.printFormatId ?? null,
      generation_mode: args.generationMode ?? null,
      asset_role: "base_generation",
      provider: args.provider ?? null,
      model: args.model ?? null,
      route: args.route ?? null,
      estimated_cost: args.estimatedCost ?? null,
      currency: args.currency ?? "USD",
      prompt_version: args.promptVersion ?? null,
      upscale_applied: args.upscaleApplied ?? false,
      upscale_method: args.upscaleMethod ?? null,
      upscale_factor: args.upscaleFactor ?? null,
    })
    .select("id")
    .single();
  if (insErr || !row) throw new Error(`gallery insert: ${insErr?.message}`);

  return {
    storagePath: filename,
    galleryImageId: row.id as string,
    publicUrl: pub.publicUrl,
    bytes: bytes.byteLength,
  };
}
