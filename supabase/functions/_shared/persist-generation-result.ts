/**
 * Shared helper — durably persist a generated image + side effects before we
 * mark the generation_job_item as completed.
 *
 * B1.2 update: this path is now IDEMPOTENT and OWNS three side effects that
 * used to live client-side:
 *
 *   1. generated_images row     (keyed by generation_job_item_id, unique)
 *   2. asset_cost_events row    (keyed by (generation_job_item_id, event_type), unique)
 *   3. prompt_history row/link  (keyed by generation_job_item_id, unique)
 *
 * Re-entering at any point in the sequence produces the same logical result.
 * Storage uploads use a deterministic filename (`${mode}-${itemId}.png`) +
 * `upsert: true`, so replaying a completed step is a real no-op.
 *
 * See `src/lib/durable-persist-idempotent.ts` for the pure state machine that
 * mirrors this file 1:1; the Vitest suite exercises the same sequence with an
 * in-memory repo. See `docs/side-effect-ownership.md` for ownership matrix.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface PersistArgs {
  imageUrl: string;
  prompt: string;
  mode: string;
  aspectRatio: string;
  // B1.2: required — the item id anchors idempotency for every side effect.
  generationJobItemId: string;
  generationJobId?: string | null;
  // Optional profile scoping for prompt-history. When null, prompt history is skipped.
  profileId?: string | null;
  printSize?: string | null;
  qualityMode?: string;
  targetPpi?: number | null;
  targetWidthPx?: number | null;
  targetHeightPx?: number | null;
  enhanced?: boolean;
  providerLabel?: string | null;
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
  sourceImageId?: string | null;
  upscaleApplied?: boolean | null;
  upscaleMethod?: string | null;
  upscaleFactor?: number | null;
  // Cost + diagnostic metadata pass-through
  costEventMetadata?: Record<string, unknown>;
}

export interface PersistResult {
  storagePath: string;
  galleryImageId: string;
  publicUrl: string;
  bytes: number;
  reusedExistingRow: boolean;
  costEventInserted: boolean;
  promptHistoryInserted: boolean;
  promptHistoryLinked: boolean;
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

function deterministicStoragePath(mode: string, itemId: string): string {
  const safe = (mode || "gen").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "gen";
  return `${safe}-${itemId}.png`;
}

export async function persistGenerationResult(
  supabase: SupabaseClient,
  args: PersistArgs,
): Promise<PersistResult> {
  if (!args.generationJobItemId) {
    throw new Error("persistGenerationResult: generationJobItemId is required");
  }
  const itemId = args.generationJobItemId;

  // 1. Idempotency check — reuse existing row if a prior attempt got here.
  const { data: existing, error: exErr } = await supabase
    .from("generated_images")
    .select("id, storage_path")
    .eq("generation_job_item_id", itemId)
    .maybeSingle();
  if (exErr) throw new Error(`idempotency lookup: ${exErr.message}`);

  let storagePath = existing?.storage_path ?? deterministicStoragePath(args.mode, itemId);
  let galleryImageId = existing?.id ?? null;
  let bytesLen = 0;

  if (!existing) {
    // 2. Upload storage. Deterministic filename + upsert = idempotent on retry.
    const bytes = await toBytes(args.imageUrl);
    bytesLen = bytes.byteLength;
    const { error: upErr } = await supabase.storage
      .from("generated-images")
      .upload(storagePath, bytes, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error(`storage upload: ${upErr.message}`);

    // 3. Insert gallery row. Unique partial index on generation_job_item_id
    //    protects against races; if a concurrent worker beat us, fall back
    //    to the existing row.
    const { data: row, error: insErr } = await supabase
      .from("generated_images")
      .insert({
        prompt: args.prompt,
        mode: args.mode,
        aspect_ratio: args.aspectRatio,
        storage_path: storagePath,
        master_storage_path: storagePath,
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
        requested_model_id: args.requestedModelId ?? null,
        resolved_model_id: args.resolvedModelId ?? null,
        selected_adapter_id: args.selectedAdapterId ?? null,
        quality_profile: args.qualityProfile ?? null,
        generation_strategy: args.generationStrategy ?? null,
        model_fallback_reason: args.modelFallbackReason ?? null,
        source_image_url: args.sourceImageUrl ?? null,
        source_storage_path: args.sourceStoragePath ?? null,
        source_file_name: args.sourceFileName ?? null,
        generation_job_id: args.generationJobId ?? null,
        generation_job_item_id: itemId,
      })
      .select("id")
      .single();
    if (insErr) {
      // Race: another worker inserted first. Recover.
      const { data: raced } = await supabase
        .from("generated_images")
        .select("id, storage_path")
        .eq("generation_job_item_id", itemId)
        .maybeSingle();
      if (!raced) throw new Error(`gallery insert: ${insErr.message}`);
      galleryImageId = raced.id as string;
      storagePath = raced.storage_path as string;
    } else if (row) {
      galleryImageId = row.id as string;
    }
  }

  if (!galleryImageId) throw new Error("gallery insert produced no id");

  // 4. Cost event — unique index (generation_job_item_id, event_type).
  let costEventInserted = false;
  const eventType = "generation";
  const { data: existingCost } = await supabase
    .from("asset_cost_events")
    .select("id")
    .eq("generation_job_item_id", itemId)
    .eq("event_type", eventType)
    .maybeSingle();
  if (!existingCost) {
    const { error: costErr } = await supabase.from("asset_cost_events").insert({
      generated_image_id: galleryImageId,
      generation_job_item_id: itemId,
      event_type: eventType,
      provider: args.provider ?? args.generationProvider ?? null,
      model: args.model ?? args.generationModel ?? null,
      mode: args.mode ?? null,
      estimated_cost: args.estimatedCost ?? null,
      currency: args.currency ?? "USD",
      status: "succeeded",
      metadata: {
        route: args.executionRoute ?? args.route ?? null,
        strategy: args.providerStrategy ?? null,
        fallback_used: args.fallbackUsed ?? false,
        ...(args.costEventMetadata ?? {}),
      },
    });
    if (!costErr) costEventInserted = true;
    // Unique-violation is fine — a concurrent worker beat us.
  }

  // 5. Prompt history — unique on generation_job_item_id; also dedupe on
  //    (profile_id, mode, prompt) to reuse a pre-existing row and bump usage.
  let promptHistoryInserted = false;
  let promptHistoryLinked = false;
  if (args.profileId && args.prompt && args.prompt.trim() && args.mode) {
    const { data: existingLink } = await supabase
      .from("prompt_history")
      .select("id")
      .eq("generation_job_item_id", itemId)
      .maybeSingle();
    if (!existingLink) {
      const { data: dedupe } = await supabase
        .from("prompt_history")
        .select("id, usage_count")
        .eq("profile_id", args.profileId)
        .eq("mode", args.mode)
        .eq("prompt", args.prompt)
        .maybeSingle();
      if (dedupe) {
        // Only bump usage_count when this specific item hasn't been counted.
        // A concurrent linker will fail on the unique index — that's fine.
        const { error: linkErr } = await supabase
          .from("prompt_history")
          .update({
            generation_job_item_id: itemId,
            usage_count: (dedupe as { usage_count: number }).usage_count + 1,
            last_used_at: new Date().toISOString(),
            provider: args.provider ?? args.generationProvider ?? null,
            model: args.model ?? args.generationModel ?? null,
            source_image_id: args.sourceImageId ?? null,
            generation_job_id: args.generationJobId ?? null,
          })
          .eq("id", (dedupe as { id: string }).id)
          .is("generation_job_item_id", null);
        if (!linkErr) promptHistoryLinked = true;
      } else {
        const { error: phErr } = await supabase.from("prompt_history").insert({
          profile_id: args.profileId,
          prompt: args.prompt,
          mode: args.mode,
          provider: args.provider ?? args.generationProvider ?? null,
          model: args.model ?? args.generationModel ?? null,
          source_image_id: args.sourceImageId ?? null,
          generation_job_id: args.generationJobId ?? null,
          generation_job_item_id: itemId,
        });
        if (!phErr) promptHistoryInserted = true;
      }
    }
  }

  const { data: pub } = supabase.storage.from("generated-images").getPublicUrl(storagePath);

  return {
    storagePath,
    galleryImageId,
    publicUrl: pub.publicUrl,
    bytes: bytesLen,
    reusedExistingRow: !!existing,
    costEventInserted,
    promptHistoryInserted,
    promptHistoryLinked,
  };
}
