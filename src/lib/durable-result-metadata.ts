/**
 * Durable generation result metadata — typed contract shared between the
 * server (`persist-generation-result`, `generate-single`) and the client
 * (durable hydration + realtime merge).
 *
 * SINGLE SOURCE OF TRUTH: whenever a generation completes durably, the
 * server writes this shape into `generation_job_items.result_metadata`
 * and the client reconstructs a `NormalizedGenerationResponse`-equivalent
 * object from it. Any new field consumed downstream of `generateImage`
 * MUST be added here first so parity holds.
 *
 * A **mirror** of this file lives at
 * `supabase/functions/_shared/durable-result-metadata.ts` for Deno. The
 * two files MUST be kept in sync — the parity test in
 * `durable-result-metadata.test.ts` enforces field coverage.
 */
import type { NormalizedGenerationResponse } from "@/lib/generation-types";

/** Increment when the contract shape changes in a breaking way. */
export const DURABLE_RESULT_METADATA_VERSION = 1 as const;

export interface DurableResultMetadataV1 {
  version: typeof DURABLE_RESULT_METADATA_VERSION;

  // ── Provider / routing ────────────────────────────────────────────────
  generationProvider: string;
  generationModel: string;
  executionRoute: string;
  providerStrategy: "auto" | "manual";
  fallbackUsed: boolean;
  attempted?: Array<{ providerId: string; ok: boolean; error?: string }>;
  routingReason?: string;

  // ── Model-selection truthfulness ──────────────────────────────────────
  requestedModelId?: string | null;
  resolvedModelId?: string | null;
  selectedAdapterId?: string | null;
  modelFallbackReason?: string | null;
  qualityProfile?: "balanced" | "strict" | "very_strict" | null;
  generationStrategy?:
    | "artistic"
    | "photoreal"
    | "poster"
    | "interior"
    | "graphic"
    | null;

  // ── Prompt / cost ─────────────────────────────────────────────────────
  promptVersion?: string | null;
  estimatedCost?: number | null;
  currency?: string | null;
  seed?: number | null;

  // ── Dimensions ────────────────────────────────────────────────────────
  actualWidthPx?: number | null;
  actualHeightPx?: number | null;
  requestedWidth?: number | null;
  requestedHeight?: number | null;
  requestedAspectRatio?: string | null;
  providerExactMatch?: boolean;
  providerAdjusted?: boolean;

  // ── Print format & sizing ─────────────────────────────────────────────
  printFormatId?: string | null;
  printSize?: string | null;
  qualityMode?: string | null;
  targetPpi?: number | null;
  targetWidthPx?: number | null;
  targetHeightPx?: number | null;
  aspectRatio?: string | null;
  sizeIntent?: "preview" | "standard" | "print" | null;

  // ── Upscale linkage ───────────────────────────────────────────────────
  upscaleApplied?: boolean;
  upscaleMethod?: string | null;
  upscaleFactor?: number | null;
  sourceJobId?: string | null;
  sourceItemId?: string | null;

  // ── Storage / gallery linkage ─────────────────────────────────────────
  storagePath?: string | null;
  galleryImageId?: string | null;
  bytes?: number | null;

  // ── Source / edit lineage ─────────────────────────────────────────────
  sourceImageUrl?: string | null;
  sourceStoragePath?: string | null;
  sourceFileName?: string | null;

  // ── Diagnostics / attempts ────────────────────────────────────────────
  attemptCount?: number | null;
}

/**
 * Reconstruct a `NormalizedGenerationResponse`-shaped object from durable
 * metadata + the persisted image URL. Used by the client on hydration so
 * downstream code (gallery save, cost events, UI badges) sees the same
 * shape it does today for the in-memory path.
 */
export function reconstructNormalizedResponse(
  imageUrl: string,
  prompt: string,
  styleKey: string,
  meta: DurableResultMetadataV1,
): NormalizedGenerationResponse {
  return {
    imageUrl,
    prompt,
    styleKey,
    width: meta.actualWidthPx ?? undefined,
    height: meta.actualHeightPx ?? undefined,
    generationProvider: meta.generationProvider as NormalizedGenerationResponse["generationProvider"],
    generationModel: meta.generationModel,
    fallbackUsed: meta.fallbackUsed,
    strategy: meta.providerStrategy,
    attempted: meta.attempted as NormalizedGenerationResponse["attempted"],
    executionRoute: meta.executionRoute as NormalizedGenerationResponse["executionRoute"],
    routingReason: meta.routingReason,
    seed: meta.seed ?? undefined,
    requestedWidth: meta.requestedWidth ?? undefined,
    requestedHeight: meta.requestedHeight ?? undefined,
    requestedAspectRatio: meta.requestedAspectRatio ?? undefined,
    providerExactMatch: meta.providerExactMatch,
    providerAdjusted: meta.providerAdjusted,
    requestedModelId: meta.requestedModelId ?? undefined,
    resolvedModelId: meta.resolvedModelId ?? undefined,
    selectedAdapterId: meta.selectedAdapterId ?? undefined,
    modelFallbackReason: meta.modelFallbackReason ?? undefined,
    qualityProfile: meta.qualityProfile ?? undefined,
    generationStrategy: meta.generationStrategy ?? undefined,
    metadata: {
      promptVersion: meta.promptVersion ?? null,
      estimatedCost: meta.estimatedCost ?? null,
      currency: meta.currency ?? null,
      bytes: meta.bytes ?? null,
      attemptCount: meta.attemptCount ?? null,
      storagePath: meta.storagePath ?? null,
      galleryImageId: meta.galleryImageId ?? null,
      sourceImageUrl: meta.sourceImageUrl ?? null,
      sourceStoragePath: meta.sourceStoragePath ?? null,
      sourceFileName: meta.sourceFileName ?? null,
      printFormatId: meta.printFormatId ?? null,
      printSize: meta.printSize ?? null,
      qualityMode: meta.qualityMode ?? null,
      targetPpi: meta.targetPpi ?? null,
      targetWidthPx: meta.targetWidthPx ?? null,
      targetHeightPx: meta.targetHeightPx ?? null,
      aspectRatio: meta.aspectRatio ?? null,
      sizeIntent: meta.sizeIntent ?? null,
      upscaleApplied: meta.upscaleApplied ?? false,
      upscaleMethod: meta.upscaleMethod ?? null,
      upscaleFactor: meta.upscaleFactor ?? null,
      sourceJobId: meta.sourceJobId ?? null,
      sourceItemId: meta.sourceItemId ?? null,
    },
  };
}

/**
 * Type guard: is the given value a plausible v1 durable metadata payload?
 * Used by hydration code to defensively skip malformed rows.
 */
export function isDurableResultMetadataV1(
  v: unknown,
): v is DurableResultMetadataV1 {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return (
    m.version === DURABLE_RESULT_METADATA_VERSION &&
    typeof m.generationProvider === "string" &&
    typeof m.generationModel === "string" &&
    typeof m.executionRoute === "string" &&
    (m.providerStrategy === "auto" || m.providerStrategy === "manual") &&
    typeof m.fallbackUsed === "boolean"
  );
}

/**
 * Names of every field defined on `DurableResultMetadataV1`. Used by the
 * parity test to guarantee the Deno mirror stays field-compatible.
 * Update this list whenever the interface changes.
 */
export const DURABLE_RESULT_METADATA_FIELDS: readonly string[] = [
  "version",
  "generationProvider",
  "generationModel",
  "executionRoute",
  "providerStrategy",
  "fallbackUsed",
  "attempted",
  "routingReason",
  "requestedModelId",
  "resolvedModelId",
  "selectedAdapterId",
  "modelFallbackReason",
  "qualityProfile",
  "generationStrategy",
  "promptVersion",
  "estimatedCost",
  "currency",
  "seed",
  "actualWidthPx",
  "actualHeightPx",
  "requestedWidth",
  "requestedHeight",
  "requestedAspectRatio",
  "providerExactMatch",
  "providerAdjusted",
  "printFormatId",
  "printSize",
  "qualityMode",
  "targetPpi",
  "targetWidthPx",
  "targetHeightPx",
  "aspectRatio",
  "sizeIntent",
  "upscaleApplied",
  "upscaleMethod",
  "upscaleFactor",
  "sourceJobId",
  "sourceItemId",
  "storagePath",
  "galleryImageId",
  "bytes",
  "sourceImageUrl",
  "sourceStoragePath",
  "sourceFileName",
  "attemptCount",
] as const;
