/**
 * Phase 2 — per-style prompt guardrails.
 *
 * Maps a styleKey (as used by STYLE_RULES in prompt-compiler.ts) to a small
 * bundle of optional metadata used to harden prompts:
 *   - `negativeHints`     → extra "do not" terms folded into the AVOID section
 *                           (and the SDXL negative prompt)
 *   - `printIntentModifier` → an extra instruction appended ONLY when the
 *                             request is for print-quality output (printMode)
 *
 * Source of truth for the UI lives in `src/lib/style-catalog.ts`. This file
 * mirrors the per-style fields so the Deno edge runtime can read them
 * without crossing the src/ boundary.
 *
 * Generation behavior is unchanged for styles with no entry here.
 */

export interface StylePromptMetadata {
  negativeHints?: string[];
  printIntentModifier?: string;
}

/**
 * Keyed by the base styleKey (no `-freestyle` / `-minimal` suffix).
 * Variants are resolved via `getStylePromptMetadata()`.
 */
export const STYLE_PROMPT_METADATA: Record<string, StylePromptMetadata> = {
  japanese: {
    negativeHints: ["photorealistic", "3D render", "glossy", "cinematic photo", "airbrushed"],
  },
  whimsical_japanese: {
    negativeHints: ["photorealistic", "dark horror", "gritty realism", "3D render"],
  },
  lineart: {
    negativeHints: ["photorealistic", "heavy shading", "noisy texture", "painterly brushwork"],
    printIntentModifier:
      "Keep linework clean, bold enough for large-format print, and avoid fragile micro-details.",
  },
  botanical: {
    negativeHints: [
      "photorealistic background",
      "blurry petals",
      "cluttered composition",
      "plastic texture",
    ],
    printIntentModifier:
      "Preserve crisp botanical linework, readable ingredient shapes, and clean separation from the background.",
  },
  risograph: {
    negativeHints: ["glossy digital gradients", "photorealistic lighting", "tiny halftone dots"],
    printIntentModifier:
      "Use larger visible ink textures and broad halftone patterns suitable for large-format print.",
  },
  screenprint: {
    negativeHints: ["photographic detail", "soft airbrush", "complex gradients"],
    printIntentModifier:
      "Use clean spot-color separations, bold edges, and large readable shapes suitable for poster printing.",
  },
  popart: {
    negativeHints: [
      "photorealistic rendering",
      "muddy colors",
      "subtle low-contrast palette",
    ],
    printIntentModifier:
      "Use bold flat color regions and controlled halftone areas that remain legible at large print sizes.",
  },
  retrocomic: {
    negativeHints: ["modern 3D render", "cinematic realism", "tiny unreadable text"],
    printIntentModifier:
      "Use bold comic inking, readable panels, and large halftone/Ben-Day textures.",
  },
  xeroxzine: {
    negativeHints: ["smooth glossy finish", "polished corporate design", "photorealistic detail"],
    printIntentModifier:
      "Keep photocopy textures broad and graphic, avoiding noisy fine grain that breaks during upscale.",
  },
  pulpmagazine: {
    negativeHints: ["modern digital realism", "3D render", "clean corporate poster"],
    printIntentModifier:
      "Use bold painted forms, strong silhouettes, and print-safe grain rather than fine photographic noise.",
  },
  brutalistposter: {
    negativeHints: ["ornate decoration", "delicate details", "photorealism"],
    printIntentModifier:
      "Use sharp typography, strong geometry, and large flat areas suitable for crisp large-format print.",
  },
  scandinavian_poster: {
    negativeHints: ["cluttered composition", "gritty texture", "excessive decoration"],
    printIntentModifier:
      "Keep shapes clean, balanced, and legible with generous negative space.",
  },
  modernist_cocktail: {
    negativeHints: [
      "photorealistic glassware",
      "cluttered bar scene",
      "tiny unreadable labels",
    ],
    printIntentModifier:
      "Use clean modernist shapes, readable ingredient silhouettes, and strong poster composition.",
  },
  minimalism: {
    negativeHints: ["ornate", "highly detailed", "busy background", "photorealistic texture"],
    printIntentModifier:
      "Preserve large clean shapes, strong negative space, and crisp edges without fake texture.",
  },
  vintage: {
    negativeHints: [
      "modern glossy 3D render",
      "neon cyberpunk",
      "ultra-sharp digital realism",
    ],
    printIntentModifier:
      "Use controlled aged texture and avoid fine noise that may become muddy in large prints.",
  },
  mediterranean_heritage: {
    negativeHints: [
      "cold corporate palette",
      "photorealistic tourism photo",
      "cluttered details",
    ],
    printIntentModifier:
      "Keep forms warm, graphic, sunlit, and readable as a decorative wall print.",
  },
  urbannoir: {
    negativeHints: [
      "photographic noise",
      "muddy shadows",
      "low-resolution grain",
      "blurry face",
      "realistic surveillance photo",
      "soft low-light photo",
    ],
    printIntentModifier:
      "Prefer bold illustrative noir shapes, crisp silhouettes, and controlled high-contrast shadows over photographic grain for large-format print.",
  },
  tattooflash: {
    negativeHints: ["soft watercolor", "photorealistic shading", "tiny fragile details"],
    printIntentModifier:
      "Use bold black outlines and clean color fills suitable for sharp poster reproduction.",
  },
  graffiti: {
    negativeHints: ["illegible micro-text", "photorealistic wall photo", "muddy overspray"],
    printIntentModifier:
      "Keep letterforms and shapes large, bold, and readable; avoid fine spray noise.",
  },
  blend: {
    negativeHints: [
      "inconsistent mixed styles",
      "muddy hybrid composition",
      "random collage artifacts",
    ],
    printIntentModifier:
      "Keep the blended style coherent, with one dominant visual language and print-safe composition.",
  },
  artnouveau: {
    negativeHints: [
      "photorealistic",
      "3D render",
      "corporate minimalism",
      "messy collage",
      "harsh cyberpunk",
      "modern glossy advertising",
    ],
    printIntentModifier:
      "Use clean ornamental linework, readable botanical shapes, and large elegant color areas suitable for crisp poster printing.",
  },
  midcenturymodern: {
    negativeHints: [
      "photorealistic",
      "3D render",
      "glossy gradients",
      "excessive detail",
      "neon cyberpunk",
      "cluttered composition",
    ],
    printIntentModifier:
      "Use large simplified shapes, clean silhouettes, warm flat colors, and minimal fine texture for strong large-format print clarity.",
  },
  loosewatercolor: {
    negativeHints: [
      "photorealistic",
      "hard vector edges",
      "3D render",
      "overly sharp digital detail",
      "muddy overworked paint",
      "plastic texture",
    ],
    printIntentModifier:
      "Use broad watercolor washes, clear subject silhouettes, and avoid tiny fragile pigment details that may become muddy in large prints.",
  },
};

/**
 * Normalize a styleKey to its base form (strip `-freestyle` / `-minimal`
 * variants). The map above is keyed by the base name only.
 */
export function normalizeStyleKey(styleKey: string): string {
  if (!styleKey) return styleKey;
  if (styleKey.endsWith("-freestyle")) return styleKey.slice(0, -"-freestyle".length);
  if (styleKey === "lineart-minimal") return "lineart";
  // "freestyle" alone is the Ukiyo-e freestyle variant
  if (styleKey === "freestyle") return "japanese";
  return styleKey;
}

export function getStylePromptMetadata(styleKey: string): StylePromptMetadata {
  return STYLE_PROMPT_METADATA[normalizeStyleKey(styleKey)] ?? {};
}

/**
 * Case-insensitive dedupe-merge of negative-hint terms. Preserves the
 * order of `existing`, then appends new `hints` not already present.
 * Whitespace is trimmed. Empty strings are dropped.
 */
export function mergeNegativeHints(
  existing: readonly string[] = [],
  hints: readonly string[] = [],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const term of [...existing, ...hints]) {
    const t = (term ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Build the optional "PRINT INTENT" line. Returns "" unless print mode is
 * active AND a modifier exists for the style.
 */
export function buildPrintIntentLine(
  modifier: string | undefined,
  printMode: boolean | undefined,
): string {
  if (!printMode) return "";
  const m = (modifier ?? "").trim();
  if (!m) return "";
  return `PRINT INTENT: ${m}`;
}
