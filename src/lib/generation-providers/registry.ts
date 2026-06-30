/**
 * Provider Registry (Phase 2 — foundation only).
 *
 * Data-driven catalog of every image-generation model the app can route to.
 * This is the single source of truth for capability metadata used by:
 *   - future provider/model pickers in the generator UI
 *   - auto-routing heuristics (style category → preferred provider)
 *   - cost estimation and analytics
 *   - documentation / debug surfaces
 *
 * IMPORTANT: this registry is additive. It does NOT replace `GENERATOR_PROVIDERS`
 * in `src/lib/generators.ts` (which still drives the legacy UI and DB
 * persistence labels). The router continues to dispatch via adapters in
 * `generation-router.ts`. Adding a new model = appending an entry here +
 * (when needed) wiring an adapter. UI consumers should read from here so
 * new entries surface automatically.
 *
 * Backwards compatible: zero call sites change as a result of adding this file.
 */

import type { ResolvedProviderId } from "@/lib/generators";
import type { AdapterId } from "@/lib/generation-router";

/** Coarse, user-facing buckets used by auto-routing. */
export type GenerationStrategy =
  | "artistic"
  | "photoreal"
  | "poster"
  | "interior"
  | "graphic";

/** Quality profile = how strictly the compiler should constrain the model. */
export type QualityProfile = "balanced" | "strict" | "very_strict";

export type AspectRatioToken =
  | "1:1"
  | "2:3"
  | "3:2"
  | "3:4"
  | "4:3"
  | "5:7"
  | "7:5"
  | "16:9"
  | "9:16";

export interface ProviderModelEntry {
  /** Stable id used in selectors, analytics, and DB metadata. */
  id: string;
  /** Resolved provider family (matches DB `generation_provider`). */
  providerId: ResolvedProviderId;
  /** Concrete model id (matches DB `generation_model`). */
  modelId: string;
  /** Which adapter the router uses to invoke this model. */
  adapterId: AdapterId;

  // Display ----------------------------------------------------------------
  displayName: string;
  shortLabel: string;
  category: "Premium" | "Balanced" | "Fast" | "Experimental";

  // Capabilities -----------------------------------------------------------
  supportedAspectRatios: AspectRatioToken[];
  /** Native long-edge ceiling for a single generation (px). */
  nativeMaxLongEdge: number;
  supportsTextToImage: boolean;
  supportsImageToImage: boolean;
  supportsUpscale: boolean;
  supportsStrictMode: boolean;
  supportsNegativePrompt: boolean;
  /** True if completion is delivered via webhook (not the immediate response). */
  async: boolean;
  /**
   * OpenAI-only: the model accepts arbitrary width×height (e.g. gpt-image-2)
   * instead of the three fixed sizes that gpt-image-1 / mini / 1.5 require.
   * Defaults to false so today's gpt-image-1 path stays on the legal three.
   */
  supportsFlexibleDimensions?: boolean;
  /**
   * Gemini-only: the model accepts an explicit `imageSize` (e.g. 2K) in
   * addition to the aspect-ratio token. Defaults to false so today's
   * aspect-ratio-only call shape is preserved.
   */
  supportsImageSizeParameter?: boolean;
  /**
   * The model + our adapter can pin a seed for byte-for-byte (or
   * near-deterministic) regeneration. Used by the Variant Fan-Out "Keep"
   * action to decide whether re-running at print resolution is safe.
   * Defaults to false everywhere until an adapter actually wires seeds.
   */
  supportsDeterministicSeedReplay?: boolean;

  // Routing hints ----------------------------------------------------------
  /** Strategies this model is particularly well-suited for. */
  strengthStrategies: GenerationStrategy[];
  /** Strategies to avoid (auto-routing will skip when possible). */
  weaknessStrategies?: GenerationStrategy[];
  /** Lower = higher priority when multiple candidates tie. */
  routingPriority: number;

  // Economics --------------------------------------------------------------
  /** Estimated USD cost for one standard generation. Null = unknown. */
  estimatedCostUsd: number | null;

  // Documentation ---------------------------------------------------------
  qualityNotes: string;
  strengths: string[];
  weaknesses: string[];

  /** When false the entry is hidden from selectors but kept for analytics. */
  enabled: boolean;
}

const COMMON_RATIOS: AspectRatioToken[] = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "5:7", "7:5", "16:9", "9:16",
];

/**
 * Canonical model registry. Keep entries terse; richer docs belong in
 * dedicated knowledge files. Order is meaningful only as a default UI order.
 */
export const PROVIDER_MODEL_REGISTRY: ProviderModelEntry[] = [
  {
    id: "openai:gpt-image-2",
    providerId: "openai",
    modelId: "gpt-image-2",
    adapterId: "openai",
    displayName: "OpenAI GPT Image 2",
    shortLabel: "OpenAI",
    category: "Premium",
    supportedAspectRatios: COMMON_RATIOS,
    nativeMaxLongEdge: 3200,
    supportsTextToImage: true,
    supportsImageToImage: true,
    supportsUpscale: true,
    supportsStrictMode: true,
    supportsNegativePrompt: false,
    async: false,
    supportsFlexibleDimensions: true,
    strengthStrategies: ["poster", "graphic", "interior"],
    weaknessStrategies: ["photoreal"],
    routingPriority: 10,
    estimatedCostUsd: 0.04,
    qualityNotes: "Strong prompt-adherence, flexible exact-pixel dimensions. Best for poster typography-adjacent layouts.",
    strengths: ["Prompt fidelity", "Composition control", "Exact poster pixel sizes"],
    weaknesses: ["Less photoreal nuance than SDXL"],
    enabled: true,
  },
  {
    id: "gemini:nano-banana-pro",
    providerId: "gemini",
    modelId: "google/gemini-3-pro-image-preview",
    adapterId: "gemini",
    displayName: "Gemini 3 Pro Image",
    shortLabel: "Gemini",
    category: "Premium",
    supportedAspectRatios: COMMON_RATIOS,
    nativeMaxLongEdge: 2048,
    supportsTextToImage: true,
    supportsImageToImage: true,
    supportsUpscale: true,
    supportsStrictMode: true,
    supportsNegativePrompt: false,
    async: false,
    strengthStrategies: ["artistic", "graphic", "poster"],
    routingPriority: 20,
    estimatedCostUsd: 0.03,
    qualityNotes: "Fast, flexible, handles image edits. Original generator path — best when iterating quickly.",
    strengths: ["Image-to-image edits", "Wide aspect-ratio coverage", "Speed"],
    weaknesses: ["Less precise typography than OpenAI"],
    enabled: true,
  },
  {
    id: "sdxl:stability-ai",
    providerId: "sdxl",
    modelId: "stability-ai/sdxl",
    adapterId: "replicate",
    displayName: "SDXL (Replicate)",
    shortLabel: "SDXL",
    category: "Premium",
    supportedAspectRatios: ["1:1", "2:3", "3:2", "3:4", "4:3", "5:7", "7:5"],
    nativeMaxLongEdge: 1984,
    supportsTextToImage: true,
    supportsImageToImage: false,
    supportsUpscale: true,
    supportsStrictMode: true,
    supportsNegativePrompt: true,
    async: false,
    strengthStrategies: ["photoreal", "interior", "artistic"],
    weaknessStrategies: ["poster"],
    routingPriority: 30,
    estimatedCostUsd: 0.012,
    qualityNotes: "Best photoreal foundation. Honors negative prompts and strict anchors.",
    strengths: ["Photoreal detail", "Negative-prompt support", "Cost-efficient"],
    weaknesses: ["Weaker at typography & flat poster art", "No native image edits"],
    enabled: true,
  },
  // Gateway-mediated SDXL stays available as a safety-net path; not shown
  // in selectors but kept for analytics/diagnostics.
  {
    id: "lovable:sdxl-gateway",
    providerId: "sdxl",
    modelId: "stability-ai/sdxl",
    adapterId: "lovable",
    displayName: "SDXL via Lovable Gateway",
    shortLabel: "SDXL (gateway)",
    category: "Balanced",
    supportedAspectRatios: ["1:1", "2:3", "3:2", "3:4", "4:3", "5:7", "7:5"],
    nativeMaxLongEdge: 1984,
    supportsTextToImage: true,
    supportsImageToImage: true,
    supportsUpscale: true,
    supportsStrictMode: true,
    supportsNegativePrompt: true,
    async: false,
    strengthStrategies: ["artistic", "graphic"],
    routingPriority: 90,
    estimatedCostUsd: 0.02,
    qualityNotes: "Safety-net path. Same model as direct SDXL but routed through the Lovable gateway.",
    strengths: ["Highest reliability", "Image-edit dispatch"],
    weaknesses: ["Higher per-call cost than direct Replicate"],
    enabled: true,
  },
  // ── Future-ready placeholder (kept disabled so it never gets routed to)
  {
    id: "flux:placeholder",
    providerId: "sdxl", // until a real provider family is added
    modelId: "black-forest-labs/flux-1.1-pro",
    adapterId: "replicate",
    displayName: "Flux 1.1 Pro (coming soon)",
    shortLabel: "Flux",
    category: "Experimental",
    supportedAspectRatios: COMMON_RATIOS,
    nativeMaxLongEdge: 2048,
    supportsTextToImage: true,
    supportsImageToImage: false,
    supportsUpscale: true,
    supportsStrictMode: true,
    supportsNegativePrompt: false,
    async: false,
    strengthStrategies: ["artistic", "poster", "graphic"],
    routingPriority: 100,
    estimatedCostUsd: 0.05,
    qualityNotes: "Placeholder so the UI can advertise upcoming support without breaking selectors.",
    strengths: ["Premium quality", "Strong prompt comprehension"],
    weaknesses: ["Not yet wired — selecting falls back to Auto"],
    enabled: false,
  },
];

// ── Query helpers ────────────────────────────────────────────────────────

export function listEnabledModels(): ProviderModelEntry[] {
  return PROVIDER_MODEL_REGISTRY.filter((m) => m.enabled);
}

export function getModelById(id: string): ProviderModelEntry | undefined {
  return PROVIDER_MODEL_REGISTRY.find((m) => m.id === id);
}

export function getModelsByProvider(providerId: ResolvedProviderId): ProviderModelEntry[] {
  return PROVIDER_MODEL_REGISTRY.filter((m) => m.providerId === providerId && m.enabled);
}

export interface AutoSelectInput {
  strategy?: GenerationStrategy;
  aspectRatio?: AspectRatioToken | string;
  /** True when the user is generating for print export. */
  printIntent?: boolean;
  /** True when image-to-image is required. */
  needsImageToImage?: boolean;
}

/**
 * Deterministic, conservative model picker driven entirely by registry data.
 * Returns the best-fit enabled model, or `null` when nothing matches (caller
 * should fall back to the existing router's Auto chain in that case).
 *
 * This helper is intentionally pure & side-effect-free so it's safe to call
 * from UI badges, debug pages, and routing experiments alike.
 */
export function selectModelFromRegistry(input: AutoSelectInput): ProviderModelEntry | null {
  const { strategy, aspectRatio, printIntent, needsImageToImage } = input;
  const candidates = listEnabledModels().filter((m) => {
    if (needsImageToImage && !m.supportsImageToImage) return false;
    if (aspectRatio && !m.supportedAspectRatios.includes(aspectRatio as AspectRatioToken)) {
      return false;
    }
    if (printIntent && m.nativeMaxLongEdge < 1536) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((m) => {
      let score = 1000 - m.routingPriority;
      if (strategy) {
        if (m.strengthStrategies.includes(strategy)) score += 200;
        if (m.weaknessStrategies?.includes(strategy)) score -= 150;
      }
      if (printIntent) score += Math.min(100, Math.round(m.nativeMaxLongEdge / 32));
      return { m, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0].m;
}
