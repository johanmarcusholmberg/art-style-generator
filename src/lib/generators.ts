/**
 * Generator provider architecture (Phase 1).
 *
 * This is the single source of truth for which image generators the app
 * supports, how they're chosen, and what metadata gets stored alongside
 * each saved image. Provider choice is intentionally kept SEPARATE from
 * the upscale pipeline (see `src/lib/upscale-modes.ts`).
 */

export type GeneratorPreference = "auto" | "gemini" | "sdxl";
export type ResolvedProviderId = "gemini" | "sdxl";

export interface GeneratorProvider {
  /** Internal id stored in the DB (`generation_provider`) */
  providerId: ResolvedProviderId;
  /** Specific model id (stored in `generation_model`) */
  modelId: string;
  displayName: string;
  shortLabel: string;
  /** Whether this provider can be selected at all */
  enabled: boolean;
  qualityTier: "premium" | "standard";
  speedTier: "fast" | "medium" | "slow";
  intendedUse: string;
  supportsTextToImage: boolean;
  supportsImageToImage: boolean;
  /** Lower number = higher priority in Auto fallback chain */
  fallbackPriority: number;
  /** One-line helper text for the UI */
  description: string;
}

export const GENERATOR_PROVIDERS: Record<ResolvedProviderId, GeneratorProvider> = {
  sdxl: {
    providerId: "sdxl",
    modelId: "stability-ai/sdxl",
    displayName: "SDXL",
    shortLabel: "SDXL",
    enabled: true,
    qualityTier: "premium",
    speedTier: "medium",
    intendedUse: "High-quality print-oriented base generation",
    supportsTextToImage: true,
    supportsImageToImage: false, // Phase 1 — text-to-image only
    fallbackPriority: 1,
    description: "Stable Diffusion XL via Replicate. Best foundation for print-oriented workflows.",
  },
  gemini: {
    providerId: "gemini",
    modelId: "google/gemini-3-pro-image-preview",
    displayName: "Gemini",
    shortLabel: "Gemini",
    enabled: true,
    qualityTier: "premium",
    speedTier: "fast",
    intendedUse: "Original generator — strong prompt comprehension, supports image edits",
    supportsTextToImage: true,
    supportsImageToImage: true,
    fallbackPriority: 2,
    description: "Google Gemini via Lovable AI Gateway. Original generator — strong for edits and varied prompts.",
  },
};

export interface GeneratorOption {
  id: GeneratorPreference;
  label: string;
  shortLabel: string;
  description: string;
}

export const GENERATOR_OPTIONS: GeneratorOption[] = [
  {
    id: "auto",
    label: "Auto",
    shortLabel: "Auto",
    description: "Prefers SDXL for best quality, falls back to Gemini if needed.",
  },
  {
    id: "sdxl",
    label: "SDXL",
    shortLabel: "SDXL",
    description: "Stable Diffusion XL — premium print-oriented quality.",
  },
  {
    id: "gemini",
    label: "Gemini",
    shortLabel: "Gemini",
    description: "Google Gemini — fast, strong prompt comprehension, supports edits.",
  },
];

export const DEFAULT_GENERATOR: GeneratorPreference = "auto";

/** Persisted user preference key (sessionStorage). */
const STORAGE_KEY = "generator-preference";

export function loadGeneratorPreference(): GeneratorPreference {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === "auto" || raw === "sdxl" || raw === "gemini") return raw;
  } catch { /* ignore */ }
  return DEFAULT_GENERATOR;
}

export function saveGeneratorPreference(pref: GeneratorPreference) {
  try {
    sessionStorage.setItem(STORAGE_KEY, pref);
  } catch { /* ignore */ }
}

/**
 * Resolve which provider should be tried first given the user preference.
 *
 * Auto strategy is INTENTIONAL and DETERMINISTIC:
 *   1. SDXL (premium / print-oriented)
 *   2. Gemini (fallback)
 *
 * Auto is never random.
 */
export interface ResolvedGenerator {
  primary: GeneratorProvider;
  /** Only populated for `auto`. For manual selections we never auto-fallback unless the caller opts in. */
  fallbackChain: GeneratorProvider[];
  strategy: "auto" | "manual";
}

export function resolveGenerator(pref: GeneratorPreference): ResolvedGenerator {
  if (pref === "auto") {
    const ordered = (Object.values(GENERATOR_PROVIDERS) as GeneratorProvider[])
      .filter((p) => p.enabled)
      .sort((a, b) => a.fallbackPriority - b.fallbackPriority);
    return {
      primary: ordered[0],
      fallbackChain: ordered.slice(1),
      strategy: "auto",
    };
  }
  const provider = GENERATOR_PROVIDERS[pref];
  return {
    primary: provider,
    fallbackChain: [], // Manual selection — fail loudly instead of silently switching
    strategy: "manual",
  };
}

/**
 * Standardized generator request shape.
 * All generator entry points should use this.
 */
export interface GeneratorRequest {
  prompt: string;
  styleKey: string;
  aspectRatio?: string;
  backgroundStyle?: string;
  printMode?: boolean;
  isEdit?: boolean;
  sourceImageUrl?: string;
  generatorPreference: GeneratorPreference;
}

/**
 * Standardized generator response — what the rest of the app sees regardless
 * of which provider ran.
 */
export interface GeneratorResponse {
  imageUrl: string;
  providerId: ResolvedProviderId;
  modelId: string;
  width?: number;
  height?: number;
  warnings?: string[];
  revisedPrompt?: string;
  metadata?: Record<string, unknown>;
  /** True if Auto fell back from primary to a backup provider */
  fallbackUsed: boolean;
  strategy: "auto" | "manual";
}

export interface ProviderHealth {
  providerId: ResolvedProviderId;
  status: "ready" | "missing-key" | "connection-failed" | "model-unavailable" | "disabled" | "unknown";
  message: string;
  testedAt?: string;
  latencyMs?: number;
  sampleImageUrl?: string;
}
