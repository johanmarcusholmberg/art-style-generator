/**
 * Persist a format derivative produced by `executeFormatDerivative` into
 * storage + the generated_images table.
 *
 * Split out from `format-derivative.ts` so it can be unit-tested with a
 * mocked Supabase client without pulling in the real client module.
 *
 * Contract:
 *   1. Upload the derivative PNG blob into the `generated-images`
 *      storage bucket under `derivative-<targetFormat>-<sourceId>-<ts>.png`.
 *   2. Insert a `generated_images` row with lineage metadata:
 *        source_image_id, source_format, target_format, crop_box,
 *        derived_from_master = true, plus the exact target pixel dims.
 *   3. NEVER call OpenAI / Lovable / any generator.
 *   4. On upload or insert failure, resolve with { persisted: false,
 *      error, fallbackDownload: { blob, filename } } so the UI can
 *      offer a manual download instead.
 */

import type { FormatDerivativePlan } from "@/lib/format-derivative";

export interface PersistDerivativeInput {
  sourceImageId: string;
  plan: FormatDerivativePlan;
  blob: Blob;
  /** Base image row fields used to seed non-lineage columns. */
  seed?: {
    prompt?: string | null;
    mode?: string | null;
    assetRole?: string | null;
    generationProvider?: string | null;
    generationModel?: string | null;
  };
}

export interface PersistDerivativeSuccess {
  persisted: true;
  storagePath: string;
  publicUrl: string;
  insertedId: string;
  metadata: PersistedDerivativeMetadata;
}

export interface PersistDerivativeFailure {
  persisted: false;
  error: Error;
  stage: "upload" | "insert" | "guard";
  fallbackDownload: { blob: Blob; filename: string };
}

export type PersistDerivativeResult =
  | PersistDerivativeSuccess
  | PersistDerivativeFailure;

export interface PersistedDerivativeMetadata {
  sourceImageId: string;
  sourceFormat: string;
  targetFormat: string;
  cropBox: FormatDerivativePlan["cropBox"];
  derivedFromMaster: true;
  outputWidth: number;
  outputHeight: number;
}

/**
 * Minimal Supabase surface we need. Kept narrow so tests can pass a
 * hand-rolled stub without pulling the real client into the test env.
 */
export interface DerivativeSupabaseLike {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        blob: Blob,
        opts?: { contentType?: string; upsert?: boolean },
      ) => Promise<{ error: { message: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => {
        single: () => Promise<{
          data: { id: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

export interface PersistDerivativeDeps {
  supabase: DerivativeSupabaseLike;
  /** Injectable clock — makes filenames deterministic in tests. */
  now?: () => number;
}

export const DERIVATIVE_BUCKET = "generated-images";

export function buildDerivativeStoragePath(input: {
  sourceImageId: string;
  targetFormat: string;
  now: number;
}): string {
  return `derivative-${input.targetFormat}-${input.sourceImageId}-${input.now}.png`;
}

export function buildDerivativeInsertRow(input: {
  sourceImageId: string;
  plan: FormatDerivativePlan;
  storagePath: string;
  publicUrl: string;
  seed?: PersistDerivativeInput["seed"];
}): Record<string, unknown> {
  const { plan, sourceImageId, storagePath, publicUrl, seed } = input;
  return {
    // Base non-lineage fields (best-effort seed from the source row).
    prompt: seed?.prompt ?? `Format derivative (${plan.targetFormat})`,
    mode: seed?.mode ?? "derivative",
    aspect_ratio: `${plan.outputWidth}:${plan.outputHeight}`,
    print_size: plan.targetFormat,
    storage_path: storagePath,
    master_storage_path: storagePath,
    master_image_url: publicUrl,
    base_image_url: publicUrl,
    actual_width_px: plan.outputWidth,
    actual_height_px: plan.outputHeight,
    master_width: plan.outputWidth,
    master_height: plan.outputHeight,
    export_width: plan.outputWidth,
    export_height: plan.outputHeight,
    export_ready: true,
    print_format_id: plan.targetFormat,
    asset_role: seed?.assetRole ?? "enhanced_master",
    generation_provider: seed?.generationProvider ?? null,
    generation_model: seed?.generationModel ?? null,
    execution_route: "format_derivative_crop",
    crop_mode: "crop",
    padding_mode: "none",
    // Lineage columns (added by the pending migration).
    source_image_id: sourceImageId,
    source_format: plan.sourceFormat,
    target_format: plan.targetFormat,
    crop_box: plan.cropBox,
    derived_from_master: true,
  };
}

export async function persistFormatDerivative(
  input: PersistDerivativeInput,
  deps: PersistDerivativeDeps,
): Promise<PersistDerivativeResult> {
  const now = (deps.now ?? Date.now)();
  const storagePath = buildDerivativeStoragePath({
    sourceImageId: input.sourceImageId,
    targetFormat: input.plan.targetFormat,
    now,
  });
  const fallbackDownload = {
    blob: input.blob,
    filename: `derivative-${input.plan.targetFormat}-${input.plan.outputWidth}x${input.plan.outputHeight}.png`,
  };

  // 1. Upload PNG blob.
  const bucket = deps.supabase.storage.from(DERIVATIVE_BUCKET);
  let uploadRes: { error: { message: string } | null };
  try {
    uploadRes = await bucket.upload(storagePath, input.blob, {
      contentType: "image/png",
      upsert: false,
    });
  } catch (err) {
    return {
      persisted: false,
      stage: "upload",
      error: err instanceof Error ? err : new Error(String(err)),
      fallbackDownload,
    };
  }
  if (uploadRes.error) {
    return {
      persisted: false,
      stage: "upload",
      error: new Error(uploadRes.error.message),
      fallbackDownload,
    };
  }

  const publicUrl = bucket.getPublicUrl(storagePath).data.publicUrl;

  // 2. Insert lineage row.
  const row = buildDerivativeInsertRow({
    sourceImageId: input.sourceImageId,
    plan: input.plan,
    storagePath,
    publicUrl,
    seed: input.seed,
  });
  let insertRes: {
    data: { id: string } | null;
    error: { message: string } | null;
  };
  try {
    insertRes = await deps.supabase
      .from("generated_images")
      .insert(row)
      .select("id")
      .single();
  } catch (err) {
    return {
      persisted: false,
      stage: "insert",
      error: err instanceof Error ? err : new Error(String(err)),
      fallbackDownload,
    };
  }
  if (insertRes.error || !insertRes.data) {
    return {
      persisted: false,
      stage: "insert",
      error: new Error(insertRes.error?.message ?? "insert returned no row"),
      fallbackDownload,
    };
  }

  return {
    persisted: true,
    storagePath,
    publicUrl,
    insertedId: insertRes.data.id,
    metadata: {
      sourceImageId: input.sourceImageId,
      sourceFormat: input.plan.sourceFormat,
      targetFormat: input.plan.targetFormat,
      cropBox: input.plan.cropBox,
      derivedFromMaster: true,
      outputWidth: input.plan.outputWidth,
      outputHeight: input.plan.outputHeight,
    },
  };
}
