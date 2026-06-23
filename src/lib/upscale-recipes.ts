/**
 * Upscale Recipe Layer
 * --------------------
 * Recipes are a thin policy layer that sits ABOVE the raw upscale modes in
 * `src/lib/upscale-modes.ts`. The mode registry is the technical source of
 * truth (what each provider actually does). Recipes encode editorial intent:
 *
 *   "For a flat-color screen-print poster, what's the best upscale path?"
 *
 * Resolution is fully deterministic and rule-based — no AI guessing.
 * Priority order:
 *
 *   1. Explicit print/export intent (printIntent flag)
 *   2. Style metadata (styleKey or `mode` from generated_images)
 *   3. Generator/provider family (sdxl vs gemini vs unknown)
 *   4. Safe default
 *
 * Recipes only REFERENCE existing UpscaleMode ids — never duplicate them.
 *
 * Designed for future tuning:
 *   - per-provider overrides (Gemini vs SDXL)
 *   - per-style cleanup tuning
 *   - print presets (dimensions / DPI) — can hang off `extras` later
 */

import type { UpscaleMode } from "@/lib/upscale-modes";
import { UPSCALE_MODES } from "@/lib/upscale-modes";

export type UpscaleRecipeId =
  | "poster_clean"
  | "poster_print"
  | "painterly_soft"
  | "photo_restore"
  | "decorative_linework"
  | "flat_graphic"
  | "illustrative_noir"
  | "safe_default";

export interface UpscaleRecipe {
  id: UpscaleRecipeId;
  label: string;
  /** Short rationale shown in the UI ("Best for poster-style edges") */
  reason: string;
  /** Primary mode this recipe maps to. MUST exist in UPSCALE_MODES. */
  recommendedMode: UpscaleMode;
  /** Fallback mode if the user previously declined the recommended one */
  fallbackMode: UpscaleMode;
  /** Whether this recipe prefers cleanup-style refinement (Clarity tile) */
  preferCleanup: boolean;
  /** Whether this recipe is print-oriented (UI highlights it more strongly) */
  preferPrint: boolean;
}

export const UPSCALE_RECIPES: Record<UpscaleRecipeId, UpscaleRecipe> = {
  poster_clean: {
    id: "poster_clean",
    label: "Poster — Clean Edges",
    reason: "Best for poster-style flat shapes & crisp edges",
    recommendedMode: "realesrgan_4x",
    fallbackMode: "realesrgan_4x",
    preferCleanup: false,
    preferPrint: false,
  },
  poster_print: {
    id: "poster_print",
    label: "Poster — Print",
    reason: "Recommended for print-quality poster output",
    recommendedMode: "tile_4x",
    fallbackMode: "realesrgan_4x",
    preferCleanup: true,
    preferPrint: true,
  },
  painterly_soft: {
    id: "painterly_soft",
    label: "Painterly — Soft Detail",
    reason: "Safer for soft painterly detail — avoids harsh sharpening",
    recommendedMode: "realesrgan_4x",
    fallbackMode: "tile_4x",
    preferCleanup: false,
    preferPrint: false,
  },
  photo_restore: {
    id: "photo_restore",
    label: "Photoreal — Restore",
    reason: "Stronger cleanup & detail recovery for photoreal output",
    recommendedMode: "print_plus",
    fallbackMode: "tile_4x",
    preferCleanup: true,
    preferPrint: true,
  },
  decorative_linework: {
    id: "decorative_linework",
    label: "Decorative Poster — Ornamental Linework",
    reason:
      "Best for clean decorative poster art; preserves ornamental linework and large flat color areas",
    recommendedMode: "realesrgan_4x",
    fallbackMode: "tile_4x",
    preferCleanup: false,
    preferPrint: false,
  },
  flat_graphic: {
    id: "flat_graphic",
    label: "Flat Graphic Poster",
    reason:
      "Excellent large-format candidate; clean shapes and flat colors upscale well without painterly artifacts",
    recommendedMode: "realesrgan_4x",
    fallbackMode: "tile_4x",
    preferCleanup: false,
    preferPrint: false,
  },
  illustrative_noir: {
    id: "illustrative_noir",
    label: "Illustrative Noir — High Contrast",
    reason:
      "Best when generated with bold illustrative shadows rather than photographic noise; preserves silhouettes and hard shadow edges",
    recommendedMode: "tile_4x",
    fallbackMode: "realesrgan_4x",
    preferCleanup: true,
    preferPrint: false,
  },
  safe_default: {
    id: "safe_default",
    label: "Safe Default",
    reason: "Balanced upscale — works for most styles",
    recommendedMode: "realesrgan_4x",
    fallbackMode: "realesrgan_4x",
    preferCleanup: false,
    preferPrint: false,
  },
};

/* ------------------------------------------------------------------ */
/*  Style → Recipe mapping                                             */
/* ------------------------------------------------------------------ */

/**
 * Group styleKeys / generation modes into stylistic families that share an
 * upscale strategy. Add new styles here as the registry grows.
 */
const POSTER_FAMILY = new Set([
  "screenprint",
  "risograph",
  "brutalistposter",
  "popart",
  "pulpmagazine",
  "retrocomic",
  "graffiti",
  "xeroxzine",
  "tattooflash",
]);

const SOFT_PAINTERLY_FAMILY = new Set([
  "botanical",
  "ukiyoe",
  "japanese", // legacy mode value
  "lineart",
  "lineart-minimal",
  "minimalism",
  "loosewatercolor",
  "loosewatercolor-freestyle",
]);

const PHOTOREAL_FAMILY = new Set<string>([
  // urbannoir was here but has been repositioned as illustrative noir (Phase 4)
]);

const DECORATIVE_LINEWORK_FAMILY = new Set([
  "artnouveau",
  "artnouveau-freestyle",
]);

const FLAT_GRAPHIC_FAMILY = new Set([
  "midcenturymodern",
  "midcenturymodern-freestyle",
]);

const ILLUSTRATIVE_NOIR_FAMILY = new Set([
  "urbannoir",
  "urbannoir-freestyle",
]);

/** Coarse provider family — SDXL benefits from stronger cleanup than Gemini/OpenAI. */
export type GeneratorFamily = "sdxl" | "gemini" | "openai" | "unknown";

export interface ResolveRecipeInput {
  /** Style key from style-config (preferred). */
  styleKey?: string | null;
  /** Stored `mode` value from generated_images (fallback when styleKey is unknown). */
  mode?: string | null;
  /** Provider family of the generator that produced the image. */
  generatorFamily?: GeneratorFamily;
  /** True when the user has signalled print/export intent. */
  printIntent?: boolean;
}

/**
 * Deterministic recipe resolver. Always returns a recipe — never null.
 *
 * Priority:
 *   1. printIntent → upgrade poster recipes to their print variant
 *   2. style family
 *   3. provider family (used as a tiebreaker for unknown styles)
 *   4. safe_default
 */
export function resolveUpscaleRecipe(input: ResolveRecipeInput): UpscaleRecipe {
  const key = (input.styleKey || input.mode || "").toLowerCase();
  const printIntent = !!input.printIntent;

  // 1) Style family
  if (POSTER_FAMILY.has(key)) {
    return printIntent
      ? UPSCALE_RECIPES.poster_print
      : UPSCALE_RECIPES.poster_clean;
  }
  if (DECORATIVE_LINEWORK_FAMILY.has(key)) {
    return UPSCALE_RECIPES.decorative_linework;
  }
  if (FLAT_GRAPHIC_FAMILY.has(key)) {
    return UPSCALE_RECIPES.flat_graphic;
  }
  if (ILLUSTRATIVE_NOIR_FAMILY.has(key)) {
    return UPSCALE_RECIPES.illustrative_noir;
  }
  if (SOFT_PAINTERLY_FAMILY.has(key)) {
    return UPSCALE_RECIPES.painterly_soft;
  }
  if (PHOTOREAL_FAMILY.has(key)) {
    return UPSCALE_RECIPES.photo_restore;
  }

  // 2) Provider family fallback
  if (input.generatorFamily === "sdxl") {
    return printIntent
      ? UPSCALE_RECIPES.photo_restore
      : UPSCALE_RECIPES.safe_default;
  }

  // 3) Safe default
  return UPSCALE_RECIPES.safe_default;
}

/**
 * Map a stored `generation_provider` string to a coarse family.
 * Tolerant of nulls, unknown providers, and casing.
 */
export function generatorFamilyFromProvider(
  provider?: string | null,
): GeneratorFamily {
  if (!provider) return "unknown";
  const p = provider.toLowerCase();
  if (p.includes("sdxl") || p.includes("stability")) return "sdxl";
  if (p.includes("gemini") || p.includes("google")) return "gemini";
  if (p.includes("openai") || p.includes("gpt-image")) return "openai";
  return "unknown";
}

/**
 * Sanity check — ensures every recipe references a real, enabled UpscaleMode.
 * Throws at module load time if anything drifts. Cheap insurance.
 */
(function validateRecipes() {
  for (const r of Object.values(UPSCALE_RECIPES)) {
    if (!UPSCALE_MODES[r.recommendedMode]) {
      throw new Error(
        `[upscale-recipes] recipe ${r.id} references unknown mode ${r.recommendedMode}`,
      );
    }
    if (!UPSCALE_MODES[r.fallbackMode]) {
      throw new Error(
        `[upscale-recipes] recipe ${r.id} references unknown fallback mode ${r.fallbackMode}`,
      );
    }
  }
})();
