/**
 * Deno mirror of `src/lib/durable-result-metadata.ts`.
 *
 * Kept intentionally minimal — server code only needs the builder + the
 * version constant. The full type surface (reconstructor, guards) lives
 * on the client. The parity test in `durable-result-metadata.test.ts`
 * enforces that the field list here matches the client contract.
 */

export const DURABLE_RESULT_METADATA_VERSION = 1 as const;

// Duplicated on purpose — this file is Deno-imported by edge functions
// and cannot cross-import from `src/`. Update in lockstep with the
// client file; the parity test asserts equality.
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

export interface BuildDurableMetadataInput {
  // Provider outcome
  generationProvider: string;
  generationModel: string;
  executionRoute: string;
  providerStrategy: "auto" | "manual";
  fallbackUsed: boolean;
  attempted?: Array<{ providerId: string; ok: boolean; error?: string }>;
  routingReason?: string;
  // Dimensions from provider
  actualWidthPx?: number | null;
  actualHeightPx?: number | null;
  requestedWidth?: number | null;
  requestedHeight?: number | null;
  requestedAspectRatio?: string | null;
  providerExactMatch?: boolean;
  providerAdjusted?: boolean;
  // From request payload (client-provided at job creation)
  printFormatId?: string | null;
  printSize?: string | null;
  qualityMode?: string | null;
  targetPpi?: number | null;
  targetWidthPx?: number | null;
  targetHeightPx?: number | null;
  aspectRatio?: string | null;
  sizeIntent?: "preview" | "standard" | "print" | null;
  sourceImageUrl?: string | null;
  sourceStoragePath?: string | null;
  sourceFileName?: string | null;
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
  promptVersion?: string | null;
  estimatedCost?: number | null;
  currency?: string | null;
  seed?: number | null;
  // Upscale linkage (durable print replay in B1.3)
  upscaleApplied?: boolean;
  upscaleMethod?: string | null;
  upscaleFactor?: number | null;
  sourceJobId?: string | null;
  sourceItemId?: string | null;
  // Persistence
  storagePath?: string | null;
  galleryImageId?: string | null;
  bytes?: number | null;
  attemptCount?: number | null;
}

/**
 * Build the durable metadata object the server writes into
 * `generation_job_items.result_metadata`. Always stamps `version`.
 * Omits nothing — every declared field is present (nullable when unknown)
 * so hydration code can rely on stable keys.
 */
export function buildDurableResultMetadata(
  input: BuildDurableMetadataInput,
): Record<string, unknown> {
  return {
    version: DURABLE_RESULT_METADATA_VERSION,
    generationProvider: input.generationProvider,
    generationModel: input.generationModel,
    executionRoute: input.executionRoute,
    providerStrategy: input.providerStrategy,
    fallbackUsed: input.fallbackUsed,
    attempted: input.attempted ?? null,
    routingReason: input.routingReason ?? null,
    requestedModelId: input.requestedModelId ?? null,
    resolvedModelId: input.resolvedModelId ?? null,
    selectedAdapterId: input.selectedAdapterId ?? null,
    modelFallbackReason: input.modelFallbackReason ?? null,
    qualityProfile: input.qualityProfile ?? null,
    generationStrategy: input.generationStrategy ?? null,
    promptVersion: input.promptVersion ?? null,
    estimatedCost: input.estimatedCost ?? null,
    currency: input.currency ?? null,
    seed: input.seed ?? null,
    actualWidthPx: input.actualWidthPx ?? null,
    actualHeightPx: input.actualHeightPx ?? null,
    requestedWidth: input.requestedWidth ?? null,
    requestedHeight: input.requestedHeight ?? null,
    requestedAspectRatio: input.requestedAspectRatio ?? null,
    providerExactMatch: input.providerExactMatch ?? false,
    providerAdjusted: input.providerAdjusted ?? false,
    printFormatId: input.printFormatId ?? null,
    printSize: input.printSize ?? null,
    qualityMode: input.qualityMode ?? null,
    targetPpi: input.targetPpi ?? null,
    targetWidthPx: input.targetWidthPx ?? null,
    targetHeightPx: input.targetHeightPx ?? null,
    aspectRatio: input.aspectRatio ?? null,
    sizeIntent: input.sizeIntent ?? null,
    upscaleApplied: input.upscaleApplied ?? false,
    upscaleMethod: input.upscaleMethod ?? null,
    upscaleFactor: input.upscaleFactor ?? null,
    sourceJobId: input.sourceJobId ?? null,
    sourceItemId: input.sourceItemId ?? null,
    storagePath: input.storagePath ?? null,
    galleryImageId: input.galleryImageId ?? null,
    bytes: input.bytes ?? null,
    sourceImageUrl: input.sourceImageUrl ?? null,
    sourceStoragePath: input.sourceStoragePath ?? null,
    sourceFileName: input.sourceFileName ?? null,
    attemptCount: input.attemptCount ?? null,
  };
}

/** Map a resolved provider id to the DB execution_route value. */
export function executionRouteForProvider(providerId: string): string {
  if (providerId === "gemini") return "lovable_gateway";
  if (providerId === "sdxl") return "replicate_direct";
  if (providerId === "openai") return "openai_direct";
  return providerId;
}
