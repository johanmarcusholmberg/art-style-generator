/**
 * Deno mirror of `src/lib/generation-contract-v2.ts`.
 *
 * Kept intentionally minimal — server code only needs the field list,
 * the version constant, and the normalizer to accept legacy payloads
 * from long-lived jobs created before Turn 1. Type definitions are
 * duplicated (Deno cannot cross-import from `src/`); the parity test
 * `src/lib/generation-contract-v2.test.ts` enforces that the field list
 * matches the client contract byte-for-byte.
 */

export const GENERATION_REQUEST_VERSION = 2 as const;

export type ExecutableProviderId = "gemini" | "sdxl";
export type ProviderPreferenceV2 = "auto" | "gemini" | "sdxl" | "openai";

export type GenerationKind =
  | "single"
  | "edit"
  | "reference"
  | "matching_collection"
  | "batch"
  | "style_compare"
  | "style_lab"
  | "variant";

export interface MatchingCollectionContext {
  collectionId: string | null;
  anchorImageId: string | null;
  anchorImageUrl: string | null;
  subject: string | null;
  rawSubject: string | null;
  artDirection: unknown | null;
  artDirectionVersion: number | null;
  consistencyStrength: "loose" | "balanced" | "strict" | null;
}

export interface GenerationRequestV2 {
  version: typeof GENERATION_REQUEST_VERSION;
  kind: GenerationKind;
  styleKey: string;
  mode: string;
  prompt: string;
  posterFormatHint: string | null;
  sourceImageUrl: string | null;
  sourceImageId: string | null;
  referenceStrength: "low" | "balanced" | "strong" | null;
  providerPreference: ProviderPreferenceV2;
  requestedModelId: string | null;
  qualityProfile: "balanced" | "strict" | "very_strict" | null;
  generationStrategy: "artistic" | "photoreal" | "poster" | "interior" | "graphic" | null;
  strictness: "loose" | "balanced" | "strict" | "very_strict" | null;
  aspectRatio: string;
  backgroundStyle: "white" | "cream";
  generationMode: "standard" | "print-ready";
  printFormatId: string | null;
  printSize: string | null;
  qualityMode: "web" | "quality";
  targetPpi: number | null;
  targetWidthPx: number | null;
  targetHeightPx: number | null;
  requestedWidth: number | null;
  requestedHeight: number | null;
  sizeIntent: "preview" | "standard" | "print";
  providerLabel: string | null;
  matching: MatchingCollectionContext | null;
}

// Duplicated on purpose — see file header. Update in lockstep with the
// client file; the parity test asserts equality.
export const GENERATION_REQUEST_V2_FIELDS: readonly string[] = [
  "version",
  "kind",
  "styleKey",
  "mode",
  "prompt",
  "posterFormatHint",
  "sourceImageUrl",
  "sourceImageId",
  "referenceStrength",
  "providerPreference",
  "requestedModelId",
  "qualityProfile",
  "generationStrategy",
  "strictness",
  "aspectRatio",
  "backgroundStyle",
  "generationMode",
  "printFormatId",
  "printSize",
  "qualityMode",
  "targetPpi",
  "targetWidthPx",
  "targetHeightPx",
  "requestedWidth",
  "requestedHeight",
  "sizeIntent",
  "providerLabel",
  "matching",
] as const;

const STRING = (v: unknown): v is string => typeof v === "string";
const NUMBER = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const KIND_SET = new Set<GenerationKind>([
  "single", "edit", "reference", "matching_collection",
  "batch", "style_compare", "style_lab", "variant",
]);
const PREF_SET = new Set<ProviderPreferenceV2>(["auto", "gemini", "sdxl", "openai"]);

/**
 * Server-side legacy normalizer. Mirrors the client-side function 1:1
 * for the fields the server actually consumes. Any legacy job whose
 * `request_payload` predates Turn 1 flows through here on claim.
 */
export function normalizeLegacyGenerationRequest(input: unknown): GenerationRequestV2 {
  const p = (input && typeof input === "object" ? (input as Record<string, unknown>) : {});

  if (p.version === GENERATION_REQUEST_VERSION) {
    // Trust already-V2 payloads (still fill any missing fields defensively).
  }

  const kind: GenerationKind =
    STRING(p.kind) && KIND_SET.has(p.kind as GenerationKind)
      ? (p.kind as GenerationKind)
      : "single";

  const styleKey = STRING(p.styleKey) ? (p.styleKey as string)
    : (STRING(p.mode) ? (p.mode as string) : "japanese");
  const mode = STRING(p.mode) ? (p.mode as string) : styleKey;

  const anchorUrl = STRING(p.anchorImageUrl) ? (p.anchorImageUrl as string) : null;
  const sourceUrl = STRING(p.sourceImageUrl) ? (p.sourceImageUrl as string) : anchorUrl;

  const matching: MatchingCollectionContext | null =
    kind === "matching_collection" || anchorUrl
      ? {
          collectionId: STRING(p.matchingCollectionId) ? (p.matchingCollectionId as string) : null,
          anchorImageId: STRING(p.anchorImageId) ? (p.anchorImageId as string) : null,
          anchorImageUrl: anchorUrl,
          subject: STRING(p.subject) ? (p.subject as string) : null,
          rawSubject: STRING(p.rawSubject) ? (p.rawSubject as string) : null,
          artDirection: p.artDirection ?? null,
          artDirectionVersion: NUMBER(p.artDirectionVersion) ? (p.artDirectionVersion as number) : null,
          consistencyStrength:
            STRING(p.consistencyStrength) && ["loose", "balanced", "strict"].includes(p.consistencyStrength as string)
              ? (p.consistencyStrength as "loose" | "balanced" | "strict")
              : null,
        }
      : null;

  return {
    version: GENERATION_REQUEST_VERSION,
    kind,
    styleKey,
    mode,
    prompt: STRING(p.prompt) ? (p.prompt as string) : "",
    posterFormatHint: STRING(p.posterFormatHint) ? (p.posterFormatHint as string) : null,
    sourceImageUrl: sourceUrl,
    sourceImageId: STRING(p.sourceImageId) ? (p.sourceImageId as string) : null,
    referenceStrength:
      STRING(p.referenceStrength) && ["low", "balanced", "strong"].includes(p.referenceStrength as string)
        ? (p.referenceStrength as "low" | "balanced" | "strong")
        : null,
    providerPreference:
      STRING(p.providerPreference) && PREF_SET.has(p.providerPreference as ProviderPreferenceV2)
        ? (p.providerPreference as ProviderPreferenceV2)
        : "auto",
    requestedModelId: STRING(p.requestedModelId) ? (p.requestedModelId as string) : null,
    qualityProfile:
      STRING(p.qualityProfile) && ["balanced", "strict", "very_strict"].includes(p.qualityProfile as string)
        ? (p.qualityProfile as "balanced" | "strict" | "very_strict")
        : null,
    generationStrategy:
      STRING(p.generationStrategy)
        ? (p.generationStrategy as GenerationRequestV2["generationStrategy"])
        : null,
    strictness:
      STRING(p.strictness) && ["loose", "balanced", "strict", "very_strict"].includes(p.strictness as string)
        ? (p.strictness as GenerationRequestV2["strictness"])
        : null,
    aspectRatio: STRING(p.aspectRatio) ? (p.aspectRatio as string) : "5:7",
    backgroundStyle: p.backgroundStyle === "cream" ? "cream" : "white",
    generationMode: p.generationMode === "print-ready" ? "print-ready" : "standard",
    printFormatId: STRING(p.printFormatId) ? (p.printFormatId as string) : null,
    printSize: STRING(p.printSize) ? (p.printSize as string) : null,
    qualityMode: p.qualityMode === "web" ? "web" : "quality",
    targetPpi: NUMBER(p.targetPpi) ? (p.targetPpi as number) : null,
    targetWidthPx: NUMBER(p.targetWidthPx) ? (p.targetWidthPx as number) : null,
    targetHeightPx: NUMBER(p.targetHeightPx) ? (p.targetHeightPx as number) : null,
    requestedWidth: NUMBER(p.requestedWidth) ? (p.requestedWidth as number) : null,
    requestedHeight: NUMBER(p.requestedHeight) ? (p.requestedHeight as number) : null,
    sizeIntent:
      p.sizeIntent === "preview" || p.sizeIntent === "print" ? p.sizeIntent
      : "standard",
    providerLabel: STRING(p.providerLabel) ? (p.providerLabel as string) : null,
    matching,
  };
}
