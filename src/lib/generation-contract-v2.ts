/**
 * GenerationRequestV2 — the canonical, versioned generation contract.
 *
 * Stage 3A / Turn 1. This is the ONE authoritative schema that every
 * generation workflow (main generator, edit, uploaded-reference, matching
 * collection, batch, style compare, style lab, variant fan-out) will
 * eventually build and every executor (browser router + durable server
 * worker) will consume. Later turns migrate remaining call sites.
 *
 * Design rules:
 *   - Additive, versioned, backward-compatible. `version: 2` is stamped
 *     into every request; older shapes flow through
 *     `normalizeLegacyGenerationRequest`.
 *   - Cross-runtime. A byte-for-byte mirror lives at
 *     `supabase/functions/_shared/generation-contract-v2.ts`. Parity is
 *     enforced by a Vitest that reads both files.
 *   - No zod dependency here — the runtime validator is a hand-rolled
 *     guard so Deno can import the mirror without an npm resolution.
 *   - Silently dropping a field on the server is a bug. The server
 *     acknowledges every field it received, even when it declines to
 *     execute (see `assertDurablyExecutable`).
 */
import type { GenerationStrategy, QualityProfile } from "@/lib/generation-providers/registry";
import type { GeneratorPreference } from "@/lib/generators";

export const GENERATION_REQUEST_VERSION = 2 as const;
export type GenerationRequestVersion = typeof GENERATION_REQUEST_VERSION;

/**
 * Provider identifiers the durable worker actually knows how to execute.
 * Kept in sync with `generation-executable-providers.ts` (client) and
 * `supabase/functions/_shared/executable-providers.ts` (Deno).
 */
export type ExecutableProviderId = "gemini" | "sdxl";

/** Full preference space the browser router understands. */
export type ProviderPreferenceV2 = GeneratorPreference; // "auto" | "gemini" | "sdxl" | "openai"

export type GenerationKind =
  | "single"
  | "edit"
  | "reference"
  | "matching_collection"
  | "batch"
  | "style_compare"
  | "style_lab"
  | "variant";

export type SizeIntent = "preview" | "standard" | "print";
export type BackgroundStyle = "white" | "cream";
export type GenerationModeV2 = "standard" | "print-ready";
export type QualityModeV2 = "web" | "quality";

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

/** The canonical request. Every workflow builds one of these. */
export interface GenerationRequestV2 {
  readonly version: GenerationRequestVersion;

  // Identity / workflow --------------------------------------------------
  kind: GenerationKind;
  styleKey: string;
  mode: string;

  // Prompt ---------------------------------------------------------------
  prompt: string;
  posterFormatHint?: string | null;

  // Reference image ------------------------------------------------------
  sourceImageUrl: string | null;
  sourceImageId: string | null;
  referenceStrength: "low" | "balanced" | "strong" | null;

  // Provider selection ---------------------------------------------------
  providerPreference: ProviderPreferenceV2;
  requestedModelId: string | null;
  qualityProfile: QualityProfile | null;
  generationStrategy: GenerationStrategy | null;
  strictness: "loose" | "balanced" | "strict" | "very_strict" | null;

  // Output shape ---------------------------------------------------------
  aspectRatio: string;
  backgroundStyle: BackgroundStyle;
  generationMode: GenerationModeV2;
  printFormatId: string | null;
  printSize: string | null;
  qualityMode: QualityModeV2;
  targetPpi: number | null;
  targetWidthPx: number | null;
  targetHeightPx: number | null;
  requestedWidth: number | null;
  requestedHeight: number | null;
  sizeIntent: SizeIntent;

  // Display / analytics --------------------------------------------------
  providerLabel: string | null;

  // Matching-collection context — nullable, present only when kind ===
  // "matching_collection".
  matching: MatchingCollectionContext | null;
}

// ── Validation ────────────────────────────────────────────────────────────

export interface ValidationIssue { path: string; message: string; }
export type ValidationResult =
  | { ok: true; value: GenerationRequestV2 }
  | { ok: false; issues: ValidationIssue[] };

const STRING = (v: unknown): v is string => typeof v === "string";
const NUMBER = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const NULLABLE_STRING = (v: unknown): v is string | null => v === null || STRING(v);
const NULLABLE_NUMBER = (v: unknown): v is number | null => v === null || NUMBER(v);

const KIND_SET = new Set<GenerationKind>([
  "single", "edit", "reference", "matching_collection",
  "batch", "style_compare", "style_lab", "variant",
]);
const PREF_SET = new Set<ProviderPreferenceV2>(["auto", "gemini", "sdxl", "openai"]);
const SIZE_INTENT_SET = new Set<SizeIntent>(["preview", "standard", "print"]);
const BG_SET = new Set<BackgroundStyle>(["white", "cream"]);
const MODE_SET = new Set<GenerationModeV2>(["standard", "print-ready"]);
const QUALITY_MODE_SET = new Set<QualityModeV2>(["web", "quality"]);

export function validateGenerationRequestV2(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const push = (path: string, message: string) => issues.push({ path, message });

  if (!input || typeof input !== "object") {
    return { ok: false, issues: [{ path: "$", message: "not an object" }] };
  }
  const r = input as Record<string, unknown>;
  if (r.version !== GENERATION_REQUEST_VERSION) push("version", `expected ${GENERATION_REQUEST_VERSION}`);
  if (!STRING(r.kind) || !KIND_SET.has(r.kind as GenerationKind)) push("kind", "invalid");
  if (!STRING(r.styleKey) || r.styleKey.length === 0) push("styleKey", "required");
  if (!STRING(r.mode) || r.mode.length === 0) push("mode", "required");
  if (!STRING(r.prompt)) push("prompt", "required");
  if (!NULLABLE_STRING(r.sourceImageUrl)) push("sourceImageUrl", "must be string|null");
  if (!NULLABLE_STRING(r.sourceImageId)) push("sourceImageId", "must be string|null");
  if (r.referenceStrength !== null && !["low", "balanced", "strong"].includes(r.referenceStrength as string)) {
    push("referenceStrength", "invalid");
  }
  if (!STRING(r.providerPreference) || !PREF_SET.has(r.providerPreference as ProviderPreferenceV2)) {
    push("providerPreference", "invalid");
  }
  if (!NULLABLE_STRING(r.requestedModelId)) push("requestedModelId", "must be string|null");
  if (!STRING(r.aspectRatio)) push("aspectRatio", "required");
  if (!STRING(r.backgroundStyle) || !BG_SET.has(r.backgroundStyle as BackgroundStyle)) push("backgroundStyle", "invalid");
  if (!STRING(r.generationMode) || !MODE_SET.has(r.generationMode as GenerationModeV2)) push("generationMode", "invalid");
  if (!NULLABLE_STRING(r.printFormatId)) push("printFormatId", "must be string|null");
  if (!NULLABLE_STRING(r.printSize)) push("printSize", "must be string|null");
  if (!STRING(r.qualityMode) || !QUALITY_MODE_SET.has(r.qualityMode as QualityModeV2)) push("qualityMode", "invalid");
  if (!NULLABLE_NUMBER(r.targetPpi)) push("targetPpi", "must be number|null");
  if (!NULLABLE_NUMBER(r.targetWidthPx)) push("targetWidthPx", "must be number|null");
  if (!NULLABLE_NUMBER(r.targetHeightPx)) push("targetHeightPx", "must be number|null");
  if (!NULLABLE_NUMBER(r.requestedWidth)) push("requestedWidth", "must be number|null");
  if (!NULLABLE_NUMBER(r.requestedHeight)) push("requestedHeight", "must be number|null");
  if (!STRING(r.sizeIntent) || !SIZE_INTENT_SET.has(r.sizeIntent as SizeIntent)) push("sizeIntent", "invalid");
  if (!NULLABLE_STRING(r.providerLabel)) push("providerLabel", "must be string|null");

  // Cross-field: matching_collection kind requires matching context.
  if (r.kind === "matching_collection") {
    const m = r.matching as MatchingCollectionContext | null | undefined;
    if (!m || typeof m !== "object") push("matching", "required for matching_collection");
    else if (!STRING(m.anchorImageUrl) && m.anchorImageUrl !== null) push("matching.anchorImageUrl", "invalid");
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: r as unknown as GenerationRequestV2 };
}

// ── Legacy normalizer ─────────────────────────────────────────────────────

/**
 * Coerce a legacy request payload into a `GenerationRequestV2`. Legacy
 * payloads are the loose `ItemPayload` shape used before Turn 1 (see
 * `supabase/functions/generate-single/index.ts`) plus the old
 * `NormalizedGenerationRequest` from `src/lib/generation-types.ts`.
 *
 * Rules:
 *   - Every V2 field is populated (null when unknown). No V2 consumer
 *     needs to guard for `undefined` on a legacy input.
 *   - When the input already carries `version: 2` we validate and return
 *     it unchanged. Nothing is silently downgraded.
 *   - Never invents provider/model choices. Manual selections stay
 *     manual; auto stays auto.
 */
export function normalizeLegacyGenerationRequest(input: unknown): GenerationRequestV2 {
  if (input && typeof input === "object" && (input as Record<string, unknown>).version === GENERATION_REQUEST_VERSION) {
    const check = validateGenerationRequestV2(input);
    if (check.ok) return check.value;
    // Fall through — treat as legacy so we still produce a valid shape.
  }
  const p = (input ?? {}) as Record<string, unknown>;
  const kind = (STRING(p.kind) && KIND_SET.has(p.kind as GenerationKind)
    ? (p.kind as GenerationKind)
    : "single") as GenerationKind;

  const styleKey = STRING(p.styleKey) ? p.styleKey : (STRING(p.mode) ? (p.mode as string) : "japanese");
  const mode = STRING(p.mode) ? (p.mode as string) : styleKey;

  const providerPref: ProviderPreferenceV2 =
    STRING(p.providerPreference) && PREF_SET.has(p.providerPreference as ProviderPreferenceV2)
      ? (p.providerPreference as ProviderPreferenceV2)
      : "auto";

  const anchorUrl = STRING(p.anchorImageUrl) ? (p.anchorImageUrl as string) : null;
  const sourceUrl =
    STRING(p.sourceImageUrl) ? (p.sourceImageUrl as string)
    : anchorUrl;

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

  const out: GenerationRequestV2 = {
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
    providerPreference: providerPref,
    requestedModelId: STRING(p.requestedModelId) ? (p.requestedModelId as string) : null,
    qualityProfile:
      STRING(p.qualityProfile) && ["balanced", "strict", "very_strict"].includes(p.qualityProfile as string)
        ? (p.qualityProfile as QualityProfile)
        : null,
    generationStrategy:
      STRING(p.generationStrategy)
        ? (p.generationStrategy as GenerationStrategy)
        : null,
    strictness:
      STRING(p.strictness) && ["loose", "balanced", "strict", "very_strict"].includes(p.strictness as string)
        ? (p.strictness as "loose" | "balanced" | "strict" | "very_strict")
        : null,
    aspectRatio: STRING(p.aspectRatio) ? (p.aspectRatio as string) : "5:7",
    backgroundStyle:
      STRING(p.backgroundStyle) && BG_SET.has(p.backgroundStyle as BackgroundStyle)
        ? (p.backgroundStyle as BackgroundStyle)
        : "white",
    generationMode:
      STRING(p.generationMode) && MODE_SET.has(p.generationMode as GenerationModeV2)
        ? (p.generationMode as GenerationModeV2)
        : "standard",
    printFormatId: STRING(p.printFormatId) ? (p.printFormatId as string) : null,
    printSize: STRING(p.printSize) ? (p.printSize as string) : null,
    qualityMode:
      STRING(p.qualityMode) && QUALITY_MODE_SET.has(p.qualityMode as QualityModeV2)
        ? (p.qualityMode as QualityModeV2)
        : "quality",
    targetPpi: NUMBER(p.targetPpi) ? (p.targetPpi as number) : null,
    targetWidthPx: NUMBER(p.targetWidthPx) ? (p.targetWidthPx as number) : null,
    targetHeightPx: NUMBER(p.targetHeightPx) ? (p.targetHeightPx as number) : null,
    requestedWidth: NUMBER(p.requestedWidth) ? (p.requestedWidth as number) : null,
    requestedHeight: NUMBER(p.requestedHeight) ? (p.requestedHeight as number) : null,
    sizeIntent:
      STRING(p.sizeIntent) && SIZE_INTENT_SET.has(p.sizeIntent as SizeIntent)
        ? (p.sizeIntent as SizeIntent)
        : "standard",
    providerLabel: STRING(p.providerLabel) ? (p.providerLabel as string) : null,
    matching,
  };
  return out;
}

/**
 * Flat list of every field in `GenerationRequestV2`. Cross-checked at
 * runtime by the parity test so the Deno mirror can't drift.
 */
export const GENERATION_REQUEST_V2_FIELDS = [
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
