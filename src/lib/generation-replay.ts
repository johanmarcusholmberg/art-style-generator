/**
 * Generation replay contract — "Generate again" / "Reuse settings".
 *
 * A `GenerationReplayPreset` carries ONLY reusable generation INPUTS taken
 * from a persisted `generated_images` row. It deliberately excludes:
 *   - generation results / provenance (resolved provider, resolved model,
 *     execution route, fallback flags, estimated cost, measured dimensions)
 *   - post-processing state (upscale/enhanced master, exports, derivatives,
 *     versions, review/admin state, collections, favorites/ratings)
 *   - the source/reference image (replay is a clean text + settings rerun)
 *
 * Where both a requested and a resolved value exist, the REQUESTED value
 * wins so a one-off fallback never becomes the new permanent setting.
 */
import { getStyleModeByValue } from "@/lib/style-registry";
import { getPrintFormat, DEFAULT_PRINT_FORMAT_ID } from "@/lib/print-formats";
import { PRINT_SIZES } from "@/components/PrintSizeSelector";
import type { QualityTarget } from "@/lib/print-resolution";
import { getModelById } from "@/lib/generation-providers/registry";
import type {
  GenerationStrategy,
  QualityProfile,
} from "@/lib/generation-providers/registry";
import { GENERATOR_PROVIDERS, type GeneratorPreference } from "@/lib/generators";

export type ReplayIntent = "edit" | "replay" | "reuse";

export interface GenerationReplayPreset {
  /** Prompt text as originally submitted. */
  prompt: string;
  /** Registered generation mode (style variant) — never remapped. */
  mode: string;
  /** standard | print-ready. */
  generationMode: "standard" | "print-ready";
  /** Poster format id, validated against PRINT_FORMATS. */
  printFormatId: string;
  /** Legacy print-size dimensions token (standard mode), if still valid. */
  printSizeDimensions: string | null;
  /** Quality target for standard mode sizing. */
  qualityTarget: QualityTarget;
  /** Requested provider preference (auto | sdxl | gemini | openai). */
  providerPreference: GeneratorPreference;
  /** Requested registry model id, or null for Auto. */
  modelId: string | null;
  qualityProfile: QualityProfile;
  generationStrategy: GenerationStrategy | null;
  /** Human-readable notes about settings that could not be restored. */
  warnings: string[];
}

/** Subset of a persisted `generated_images` row used for replay. */
export interface ReplaySourceRow {
  prompt?: string | null;
  mode?: string | null;
  generation_mode?: string | null;
  print_format_id?: string | null;
  print_size?: string | null;
  quality_mode?: string | null;
  provider_strategy?: string | null;
  generation_provider?: string | null;
  requested_model_id?: string | null;
  resolved_model_id?: string | null;
  quality_profile?: string | null;
  generation_strategy?: string | null;
  source_image_url?: string | null;
}

const QUALITY_TARGETS: QualityTarget[] = ["web", "print-150", "print-300"];
const QUALITY_PROFILES: QualityProfile[] = ["balanced", "strict", "very_strict"];
const STRATEGIES: GenerationStrategy[] = [
  "artistic",
  "photoreal",
  "poster",
  "interior",
  "graphic",
];

function isProviderPreference(v: unknown): v is GeneratorPreference {
  return v === "auto" || (typeof v === "string" && v in GENERATOR_PROVIDERS);
}

/**
 * Convert a persisted gallery row into a replay preset. Pure and total:
 * unknown / legacy / deprecated values fall back to the safest current
 * default and are reported through `warnings`.
 */
export function buildGenerationReplayPreset(
  row: ReplaySourceRow,
): GenerationReplayPreset {
  const warnings: string[] = [];

  // ── Mode / style ──────────────────────────────────────────────────
  const mode = typeof row.mode === "string" ? row.mode : "";
  if (!mode || !getStyleModeByValue(mode)) {
    warnings.push("This artwork's style mode is no longer registered.");
  }

  // ── Generation mode ───────────────────────────────────────────────
  const rawGenMode = row.generation_mode;
  const generationMode: "standard" | "print-ready" =
    rawGenMode === "standard"
      ? "standard"
      : rawGenMode === "print-ready" || rawGenMode === "print_ready"
      ? "print-ready"
      : "print-ready";

  // ── Print format ──────────────────────────────────────────────────
  let printFormatId = DEFAULT_PRINT_FORMAT_ID;
  if (row.print_format_id) {
    if (getPrintFormat(row.print_format_id)) {
      printFormatId = row.print_format_id;
    } else {
      warnings.push(
        `Print format "${row.print_format_id}" no longer exists — using the default format.`,
      );
    }
  }

  // ── Legacy print size / quality target ────────────────────────────
  const printSizeDimensions =
    row.print_size && PRINT_SIZES.some((s) => s.dimensions === row.print_size)
      ? row.print_size
      : null;
  const qualityTarget: QualityTarget = QUALITY_TARGETS.includes(
    row.quality_mode as QualityTarget,
  )
    ? (row.quality_mode as QualityTarget)
    : "print-300";

  // ── Provider preference (REQUESTED, not the resolved fallback) ─────
  // `provider_strategy` records how the provider was chosen:
  //   "auto"   → the user asked for Auto; `generation_provider` is only
  //              the provider that happened to win (possibly a fallback).
  //   "manual" → the user pinned `generation_provider`.
  let providerPreference: GeneratorPreference = "auto";
  if (row.provider_strategy === "manual") {
    if (isProviderPreference(row.generation_provider)) {
      providerPreference = row.generation_provider as GeneratorPreference;
    } else if (row.generation_provider) {
      warnings.push(
        `Generator "${row.generation_provider}" is no longer available — using Auto.`,
      );
    }
  }

  // ── Model selection (requested wins over resolved) ────────────────
  let modelId: string | null = null;
  const requested = row.requested_model_id;
  if (requested) {
    const entry = getModelById(requested);
    if (entry && entry.enabled) {
      modelId = requested;
    } else {
      warnings.push(
        `Model "${requested}" is no longer selectable — using the recommended model.`,
      );
    }
  }

  const qualityProfile: QualityProfile = QUALITY_PROFILES.includes(
    row.quality_profile as QualityProfile,
  )
    ? (row.quality_profile as QualityProfile)
    : "balanced";

  const generationStrategy: GenerationStrategy | null = STRATEGIES.includes(
    row.generation_strategy as GenerationStrategy,
  )
    ? (row.generation_strategy as GenerationStrategy)
    : null;

  if (row.source_image_url) {
    warnings.push(
      "Source image not automatically reused — add a reference image again if you need it.",
    );
  }

  return {
    prompt: typeof row.prompt === "string" ? row.prompt : "",
    mode,
    generationMode,
    printFormatId,
    printSizeDimensions,
    qualityTarget,
    providerPreference,
    modelId,
    qualityProfile,
    generationStrategy,
    warnings,
  };
}

// ── Gallery → generator request contract ────────────────────────────────

/**
 * A request from the Gallery (or any surface) to hydrate the generator.
 *
 * `intent`:
 *   - "edit"   → existing image-to-image workflow (carries imageUrl +
 *                originalId + originalStoragePath)
 *   - "replay" → fresh generation with the same settings, auto-started
 *   - "reuse"  → same settings loaded, user presses Generate manually
 */
export interface EditRequest {
  prompt: string;
  mode: string;
  /** Only set for "edit" — replay/reuse are source-free by contract. */
  imageUrl?: string;
  originalId?: string;
  originalStoragePath?: string;
  intent?: ReplayIntent;
  preset?: GenerationReplayPreset;
  /** Unique per request so repeat clicks remount the generator. */
  requestId?: string;
}

export function replayIntentOf(req: EditRequest | null | undefined): ReplayIntent {
  return req?.intent ?? "edit";
}

/** Stable remount key for the generator, unique per request. */
export function replayEditKey(req: EditRequest | null | undefined): string {
  if (!req) return "default";
  return `${replayIntentOf(req)}-${req.mode}-${req.requestId ?? req.originalId ?? req.prompt}`;
}

/**
 * Props a style page should spread onto `<ImageGenerator>` for a given
 * mode. Keeps the Gallery ↔ generator coordination in one place instead of
 * repeating five ternaries on every style page.
 */
export function generatorReplayProps(
  editState: EditRequest | null | undefined,
  mode: string,
  onExitEdit: () => void,
) {
  if (!editState || editState.mode !== mode) return {} as Record<string, never>;
  const intent = replayIntentOf(editState);
  return {
    onExitEdit,
    initialPrompt: editState.preset?.prompt ?? editState.prompt,
    initialImageUrl: intent === "edit" ? editState.imageUrl : undefined,
    originalImageId: intent === "edit" ? editState.originalId : undefined,
    originalStoragePath: intent === "edit" ? editState.originalStoragePath : undefined,
    initialPreset: editState.preset,
    autoGenerate: intent === "replay",
  };
}

/** Copy for the shared unsaved-work confirmation dialog. */
export function replayDialogCopy(
  req: EditRequest | null | undefined,
  hasUnsavedImage: boolean,
) {
  const intent = replayIntentOf(req);
  const noun =
    intent === "replay" ? "Generate Again" : intent === "reuse" ? "Reuse Settings" : "Edit";
  const title = hasUnsavedImage
    ? "You have an unsaved image"
    : intent === "replay"
    ? "Generate again from this artwork?"
    : intent === "reuse"
    ? "Reuse this artwork's settings?"
    : "Edit this image?";
  const description = hasUnsavedImage
    ? `Your current generated image hasn't been saved to the gallery yet. Continuing will discard it. Do you want to continue?`
    : intent === "replay"
    ? "This starts a brand-new generation using the same prompt and settings. The existing artwork is left untouched."
    : intent === "reuse"
    ? "This loads the generator with the same prompt and settings so you can adjust them before generating."
    : "This will load the selected image into the editor. You can then modify it with a new prompt and choose to replace the original or save as a new image.";
  const action = hasUnsavedImage ? `Discard & ${noun}` : "Continue";
  return { title, description, action };
}
