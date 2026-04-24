/**
 * Normalized generation contract (Phase 2).
 *
 * Every image generation in the app — regardless of which provider runs
 * (Lovable/Gemini, direct SDXL via Replicate, future direct Gemini, etc.) —
 * goes through this single request/response shape. Downstream systems
 * (gallery save, upscale recipes, master-asset, Etsy export, mockups)
 * consume the normalized response and never inspect provider-specific
 * payloads.
 *
 * IMPORTANT: this file is provider-agnostic on purpose. Provider adapters
 * map their own native shapes into / out of these types.
 */

import type { GeneratorPreference, ResolvedProviderId } from "./generators";
import type { ExecutionRoute } from "./style-routing";

// ── Request ──────────────────────────────────────────────────────────────

/** Coarse intent for output dimensions (provider decides exact pixels). */
export type SizeIntent = "preview" | "standard" | "print";

/** Coarse intent for quality vs. speed (provider decides params). */
export type QualityIntent = "fast" | "balanced" | "premium";

export type Strictness = "balanced" | "strict" | "very_strict";

export interface NormalizedGenerationRequest {
  /** Free-text user prompt — never include style boilerplate here. */
  prompt: string;
  /** Style id from STYLE_RULES (e.g. "japanese", "popart-freestyle"). */
  styleKey: string;
  /** Aspect ratio token, e.g. "1:1", "5:7", "2:3". */
  aspectRatio?: string;
  /** Coarse size intent (defaults to "standard"). */
  sizeIntent?: SizeIntent;
  /** Coarse quality intent (defaults to "balanced"). */
  qualityIntent?: QualityIntent;
  /** Provider preference; defaults to "auto". */
  providerPreference?: GeneratorPreference;
  /** Background tint (provider-aware; not all providers honor it). */
  backgroundStyle?: "white" | "cream" | string;
  /** Print mode toggle for prompt compilation. */
  printMode?: boolean;
  /** Optional reference / source image for image-to-image edits. */
  referenceImageUrl?: string;
  /** True when this is an image edit (forces image-capable provider). */
  isEdit?: boolean;
  /** Style strictness — drives SDXL anchor repetition + negative boost. */
  strictness?: Strictness;
}

// ── Response ─────────────────────────────────────────────────────────────

export type GenerationProviderId = ResolvedProviderId;

export interface NormalizedGenerationResponse {
  /** Final image URL (may be a remote provider URL — caller is responsible
   *  for re-hosting if persistence is needed). */
  imageUrl: string;
  /** Reported width in pixels, if provider returns it. */
  width?: number;
  /** Reported height in pixels, if provider returns it. */
  height?: number;
  /** Which provider actually ran. */
  generationProvider: GenerationProviderId;
  /** Specific model id (e.g. "stability-ai/sdxl"). */
  generationModel: string;
  /** The user prompt as submitted (pre-compilation). */
  prompt: string;
  /** Optional revised prompt returned by provider (Gemini sometimes does). */
  revisedPrompt?: string;
  /** Style id used for compilation. */
  styleKey: string;
  /** Random seed if provider exposes it. */
  seed?: number;
  /** Provider-side generation/prediction id, useful for support tickets. */
  providerGenerationId?: string;
  /** True if Auto strategy fell back from primary to backup. */
  fallbackUsed: boolean;
  /** Routing strategy that produced this image. */
  strategy: "auto" | "manual";
  /** Per-attempt diagnostics (one entry per provider tried). */
  attempted?: Array<{ providerId: GenerationProviderId; ok: boolean; error?: string }>;
  /**
   * EXTERNAL execution route — explains to the UI/DB whether the image came
   * from the Lovable gateway, directly from Gemini, or via a fallback.
   * MUST be set by the router based on which adapter actually ran. Never
   * inferred client-side later.
   */
  executionRoute: ExecutionRoute;
  /** Human-readable reason the router chose this route (for diagnostics). */
  routingReason?: string;
  /** Free-form provider metadata (kept opaque to downstream code). */
  metadata?: Record<string, unknown>;
}

// ── Persistence mapping (used by gallery save) ───────────────────────────

/**
 * Map a normalized response into the column subset that `generated_images`
 * already supports. Keeps persistence consistent across provider paths.
 */
export function toGeneratedImageColumns(res: NormalizedGenerationResponse) {
  return {
    generation_provider: res.generationProvider,
    generation_model: res.generationModel,
    provider_strategy: res.strategy,
    fallback_used: res.fallbackUsed,
    actual_width_px: res.width ?? null,
    actual_height_px: res.height ?? null,
    execution_route: res.executionRoute ?? null,
  };
}
