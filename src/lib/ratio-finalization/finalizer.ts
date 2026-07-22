/**
 * finalizePendingRatioItem — the durable client finalizer.
 *
 * Execution flow:
 *   1. Claim the item via RPC.
 *   2. Prefer Storage download using `sourceStoragePath`; fall back to the
 *      persisted `sourceImageUrl` only when the storage path is missing.
 *   3. Decode into an ImageBitmap and read its REAL width/height.
 *   4. Build the canonical plan.
 *   5. `none` → call Complete against the existing asset without uploading.
 *   6. `crop` / `pad` → render, build deterministic path, upload with
 *      upsert, resolve public URL, then Complete.
 *   7. On network uncertainty during Complete, retry idempotently; if
 *      still uncertain, read the item and confirm terminal state.
 *   8. Release ImageBitmap / URLs / Canvas memory.
 *
 * The finalizer is pure of React state and takes dependency injection so
 * the queue and integration tests can drive it directly.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  claimRatioFinalization,
  completeRatioFinalization,
  failRatioFinalization,
  RatioFinalizationApiError,
  type ClaimedRatioFinalizationItem,
  type CompleteRatioFinalizationInput,
} from "./api";
import {
  planPosterRatioFinalization,
  ratioMatchesTarget,
  RATIO_FINALIZATION_ALGORITHM_VERSION,
  type RatioFinalizationPlan,
} from "./planner";
import { renderPosterRatioFinalization, type RendererImageSource } from "./renderer";
import {
  buildRatioFinalizedStoragePath,
  RATIO_FINALIZED_BUCKET,
} from "./storage-path";

export type RatioFinalizationResult =
  | {
      status: "completed";
      itemId: string;
      storagePath: string;
      width: number;
      height: number;
      operation: "crop" | "pad";
    }
  | {
      status: "not_required";
      itemId: string;
      storagePath: string;
      width: number;
      height: number;
    }
  | {
      status: "skipped";
      itemId: string;
      reason: "not_claimable" | "already_terminal";
    }
  | {
      status: "failed";
      itemId: string;
      error: string;
    };

// ── Dependency-injection surface (browser side-effects abstracted) ─────

export interface DecodedImage {
  source: RendererImageSource;
  width: number;
  height: number;
  release: () => void;
}

export interface FinalizerDeps {
  client?: SupabaseClient<Database>;
  /** Claim wrapper — swappable for tests. */
  claim?: typeof claimRatioFinalization;
  complete?: typeof completeRatioFinalization;
  fail?: typeof failRatioFinalization;
  /** Given a claim, produce a Blob for the source image. */
  downloadSource?: (claim: ClaimedRatioFinalizationItem, client: SupabaseClient<Database>) => Promise<Blob>;
  /** Decode a Blob into a canvas-drawable source + release() cleanup. */
  decodeImage?: (blob: Blob) => Promise<DecodedImage>;
  /** Render — matches renderer.ts signature. */
  render?: typeof renderPosterRatioFinalization;
  /** Storage upload — bucket / path / blob. */
  uploadBlob?: (
    client: SupabaseClient<Database>,
    bucket: string,
    path: string,
    blob: Blob,
  ) => Promise<{ publicUrl: string }>;
  /** Fetch current item state after a Complete transport error. */
  readItemState?: (
    client: SupabaseClient<Database>,
    itemId: string,
  ) => Promise<{
    status: string | null;
    storagePath: string | null;
    operation: string | null;
    width: number | null;
    height: number | null;
    algorithmVersion: string | null;
    metadata: Record<string, unknown> | null;
  } | null>;
}

// ── Default implementations ────────────────────────────────────────────

async function defaultDownloadSource(
  claim: ClaimedRatioFinalizationItem,
  client: SupabaseClient<Database>,
): Promise<Blob> {
  if (claim.sourceStoragePath) {
    const { data, error } = await client.storage
      .from(RATIO_FINALIZED_BUCKET)
      .download(claim.sourceStoragePath);
    if (!error && data) return data;
    if (!claim.sourceImageUrl) throw error ?? new Error("storage_download_failed");
  }
  if (!claim.sourceImageUrl) throw new Error("no_source_url_fallback");
  const res = await fetch(claim.sourceImageUrl);
  if (!res.ok) throw new Error(`source_url_fetch_failed_${res.status}`);
  return await res.blob();
}

async function defaultDecodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => { try { bitmap.close(); } catch { /* noop */ } },
    };
  }
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image_decode_failed"));
    el.src = url;
  });
  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    release: () => { URL.revokeObjectURL(url); img.src = ""; },
  };
}

async function defaultUploadBlob(
  client: SupabaseClient<Database>,
  bucket: string,
  path: string,
  blob: Blob,
): Promise<{ publicUrl: string }> {
  const { error } = await client.storage.from(bucket).upload(path, blob, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) throw error;
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return { publicUrl: data.publicUrl };
}

async function defaultReadItemState(
  client: SupabaseClient<Database>,
  itemId: string,
) {
  const { data, error } = await client
    .from("generation_job_items")
    .select("ratio_enforcement_status, storage_path, finalization_operation, finalization_metadata")
    .eq("id", itemId)
    .maybeSingle();
  if (error || !data) return null;
  const meta = (data.finalization_metadata as Record<string, unknown> | null) ?? null;
  const metaWidth = meta && typeof meta.outputWidth === "number" ? (meta.outputWidth as number) : null;
  const metaHeight = meta && typeof meta.outputHeight === "number" ? (meta.outputHeight as number) : null;
  const metaAlgo = meta && typeof meta.algorithmVersion === "string" ? (meta.algorithmVersion as string) : null;
  return {
    status: (data.ratio_enforcement_status as string | null) ?? null,
    storagePath: (data.storage_path as string | null) ?? null,
    operation: (data.finalization_operation as string | null) ?? null,
    width: metaWidth,
    height: metaHeight,
    algorithmVersion: metaAlgo,
    metadata: meta,
  };
}

// ── Metadata builder ───────────────────────────────────────────────────

export function buildCompletionMetadata(
  claim: ClaimedRatioFinalizationItem,
  plan: RatioFinalizationPlan,
  outputWidth: number,
  outputHeight: number,
) {
  return {
    algorithmVersion: plan.algorithmVersion,
    targetAspectRatio: plan.targetAspectRatio,
    sourceWidth: plan.sourceRect.width + (plan.padding?.left ?? 0) + (plan.padding?.right ?? 0),
    sourceHeight: plan.sourceRect.height + (plan.padding?.top ?? 0) + (plan.padding?.bottom ?? 0),
    outputWidth,
    outputHeight,
    operation: plan.operation,
    sourceRect: plan.sourceRect,
    padding: plan.padding,
    posterFormatId: claim.posterFormatId,
  } as Record<string, unknown>;
}

// ── Completion with transport-uncertainty handling ─────────────────────

async function completeWithVerification(
  input: CompleteRatioFinalizationInput,
  deps: {
    complete: typeof completeRatioFinalization;
    client: SupabaseClient<Database>;
    readItemState: (client: SupabaseClient<Database>, itemId: string) => ReturnType<typeof defaultReadItemState>;
  },
): Promise<void> {
  const attempt = async () => deps.complete(input, { client: deps.client });
  try {
    await attempt();
    return;
  } catch (err) {
    // Authoritative RPC errors (mapped codes) must NOT be retried — they
    // reflect a decided database state, not transport uncertainty.
    if (err instanceof RatioFinalizationApiError && err.code !== "unknown_rpc_error") {
      throw err;
    }
    // Transport uncertainty: retry once idempotently.
    try {
      await attempt();
      return;
    } catch (err2) {
      if (err2 instanceof RatioFinalizationApiError && err2.code !== "unknown_rpc_error") {
        throw err2;
      }
      // Still uncertain — verify actual state.
      const state = await deps.readItemState(deps.client, input.itemId);
      if (state && state.status === "completed"
          && state.storagePath === input.finalStoragePath
          && (state.operation === input.operation || state.operation == null)) {
        return; // DB actually committed the first attempt.
      }
      throw err2;
    }
  }
}

// ── Main entry point ───────────────────────────────────────────────────

export async function finalizePendingRatioItem(
  itemId: string,
  deps: FinalizerDeps = {},
): Promise<RatioFinalizationResult> {
  const client = deps.client ?? defaultClient;
  const claimFn = deps.claim ?? claimRatioFinalization;
  const completeFn = deps.complete ?? completeRatioFinalization;
  const failFn = deps.fail ?? failRatioFinalization;
  const downloadSource = deps.downloadSource ?? defaultDownloadSource;
  const decodeImage = deps.decodeImage ?? defaultDecodeImage;
  const render = deps.render ?? renderPosterRatioFinalization;
  const uploadBlob = deps.uploadBlob ?? defaultUploadBlob;
  const readItemState = deps.readItemState ?? defaultReadItemState;

  // 1. Claim
  let claim: ClaimedRatioFinalizationItem;
  try {
    claim = await claimFn(itemId, { client });
  } catch (err) {
    if (err instanceof RatioFinalizationApiError) {
      if (err.code === "not_claimable") {
        return { status: "skipped", itemId, reason: "not_claimable" };
      }
    }
    return { status: "failed", itemId, error: describeError(err) };
  }

  const claimToken = claim.claimToken;

  // 2–4. Download → decode → plan → render → upload → complete
  let decoded: DecodedImage | null = null;
  let processingError: unknown = null;

  try {
    const blob = await downloadSource(claim, client);
    decoded = await decodeImage(blob);

    const plan = planPosterRatioFinalization({
      sourceWidth: decoded.width,
      sourceHeight: decoded.height,
      targetAspectRatio: claim.targetAspectRatio,
      policy: claim.correctionPolicy,
    });

    // ── none: reuse existing asset, no upload ────────────────────────
    if (plan.operation === "none") {
      if (!claim.sourceStoragePath) {
        // No canonical asset to preserve — treat as failed rather than
        // fabricating a storage path we can't validate.
        throw new Error("cannot_finalize_none_without_source_storage_path");
      }
      const publicUrl = client.storage
        .from(RATIO_FINALIZED_BUCKET)
        .getPublicUrl(claim.sourceStoragePath).data.publicUrl;
      const metadata = buildCompletionMetadata(claim, plan, decoded.width, decoded.height);
      await completeWithVerification(
        {
          itemId, claimToken,
          finalStoragePath: claim.sourceStoragePath,
          finalImageUrl: publicUrl,
          finalWidth: decoded.width,
          finalHeight: decoded.height,
          operation: "none",
          metadata,
        },
        { complete: completeFn, client, readItemState },
      );
      return {
        status: "not_required",
        itemId,
        storagePath: claim.sourceStoragePath,
        width: decoded.width,
        height: decoded.height,
      };
    }

    // ── crop / pad ───────────────────────────────────────────────────
    const rendered = await render({ source: decoded.source, plan });

    // Sanity check output ratio before we ever call Complete.
    if (!ratioMatchesTarget(rendered.width, rendered.height, plan.targetAspectRatio)) {
      throw new Error("rendered_output_ratio_mismatch");
    }

    const finalPath = buildRatioFinalizedStoragePath({
      galleryImageId: claim.galleryImageId ?? claim.itemId,
      itemId: claim.itemId,
      posterFormatId: claim.posterFormatId,
      algorithmVersion: plan.algorithmVersion,
      extension: "png",
    });

    const { publicUrl } = await uploadBlob(client, RATIO_FINALIZED_BUCKET, finalPath, rendered.blob);

    const metadata = buildCompletionMetadata(claim, plan, rendered.width, rendered.height);
    await completeWithVerification(
      {
        itemId, claimToken,
        finalStoragePath: finalPath,
        finalImageUrl: publicUrl,
        finalWidth: rendered.width,
        finalHeight: rendered.height,
        operation: plan.operation,
        metadata,
      },
      { complete: completeFn, client, readItemState },
    );

    return {
      status: "completed",
      itemId,
      storagePath: finalPath,
      width: rendered.width,
      height: rendered.height,
      operation: plan.operation,
    };
  } catch (err) {
    processingError = err;
  } finally {
    if (decoded) {
      try { decoded.release(); } catch { /* noop */ }
      decoded = null;
    }
  }

  // Failure branch: report to server, preserve original error in return.
  if (processingError) {
    const originalMsg = describeError(processingError);
    try {
      await failFn({ itemId, claimToken, error: originalMsg }, { client });
    } catch (failErr) {
      // Failure-reporting errors do not hide the original processing error.
      // eslint-disable-next-line no-console
      console.error("[ratio-finalization] failReport failed for", itemId, failErr);
    }
    return { status: "failed", itemId, error: originalMsg };
  }

  // Should be unreachable, but keep TS happy.
  return { status: "failed", itemId, error: "unknown_finalization_error" };
}

function describeError(err: unknown): string {
  if (err instanceof RatioFinalizationApiError) return `${err.code}: ${err.message}`;
  if (err instanceof Error) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}
