/**
 * Phase 2 — client-side mirror of the per-style prompt guardrail helpers.
 *
 * The canonical runtime version lives in
 * `supabase/functions/_shared/style-prompt-metadata.ts` (Deno cannot import
 * from `src/`, so the data table is intentionally duplicated). This module
 * exists so the pure helpers can be unit-tested with Vitest and so future
 * client UI (e.g. "what does this style avoid?" tooltips) can read the same
 * fields from `STYLE_CATALOG` without going through the edge function.
 *
 * Generation behavior is NOT driven by this file — it is driven by the
 * mirror in `supabase/functions/_shared/`.
 */

import { STYLE_CATALOG, type StyleCatalogEntry } from "./style-catalog";

export interface StylePromptMetadata {
  negativeHints?: string[];
  printIntentModifier?: string;
}

/** Normalize a styleKey to its base form (strip provider/variant suffixes). */
export function normalizeStyleKey(styleKey: string): string {
  if (!styleKey) return styleKey;
  if (styleKey.endsWith("-freestyle")) return styleKey.slice(0, -"-freestyle".length);
  if (styleKey === "lineart-minimal") return "lineart";
  if (styleKey === "freestyle") return "japanese";
  return styleKey;
}

/**
 * Map a base styleKey to its catalog `route` so we can look up the
 * Phase-1 metadata fields. Mirrors the mapping in the edge runtime.
 */
const STYLE_KEY_TO_ROUTE: Record<string, string> = {
  japanese: "/",
  popart: "/popart",
  lineart: "/lineart",
  minimalism: "/minimalism",
  graffiti: "/graffiti",
  botanical: "/botanical",
  urbannoir: "/urbannoir",
  screenprint: "/screenprint",
  risograph: "/risograph",
  retrocomic: "/retrocomic",
  pulpmagazine: "/pulpmagazine",
  tattooflash: "/tattooflash",
  brutalistposter: "/brutalistposter",
  xeroxzine: "/xeroxzine",
  scandinavian_poster: "/scandinavian-poster",
  vintage: "/vintage",
  whimsical_japanese: "/whimsical-japanese",
  modernist_cocktail: "/modernist-cocktail",
  mediterranean_heritage: "/mediterranean-heritage",
  blend: "/blend",
  // Phase 3
  artnouveau: "/artnouveau",
  midcenturymodern: "/midcenturymodern",
  loosewatercolor: "/loosewatercolor",
};

export function getCatalogEntryForStyleKey(
  styleKey: string,
): StyleCatalogEntry | undefined {
  const route = STYLE_KEY_TO_ROUTE[normalizeStyleKey(styleKey)];
  if (!route) return undefined;
  return STYLE_CATALOG.find((s) => s.route === route);
}

export function getStylePromptMetadata(styleKey: string): StylePromptMetadata {
  const entry = getCatalogEntryForStyleKey(styleKey);
  if (!entry) return {};
  return {
    negativeHints: entry.negativePromptHints,
    printIntentModifier: entry.printIntentModifier,
  };
}

/** Case-insensitive dedupe-merge. Preserves order; drops empty / whitespace. */
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

/** Build the "PRINT INTENT: ..." line; "" unless printMode + modifier exist. */
export function buildPrintIntentLine(
  modifier: string | undefined,
  printMode: boolean | undefined,
): string {
  if (!printMode) return "";
  const m = (modifier ?? "").trim();
  if (!m) return "";
  return `PRINT INTENT: ${m}`;
}
