/**
 * Style Lab — canonical style metadata.
 *
 * Single source of truth that links Style Lab UI rows (route + display)
 * to the canonical `styleKey` defined in `src/lib/style-config.ts`.
 *
 * Use this everywhere in Style Lab (Test, Review, Insights, Collections)
 * so we never reintroduce drift between compact keys (e.g.
 * `whimsicaljapanese`) and canonical keys (e.g. `whimsical_japanese`).
 */

import { STYLE_CATALOG } from "@/lib/style-catalog";
import {
  UKIYOE_STYLE,
  POPART_STYLE,
  LINEART_STYLE,
  MINIMALISM_STYLE,
  GRAFFITI_STYLE,
  BOTANICAL_STYLE,
  URBANNOIR_STYLE,
  SCREENPRINT_STYLE,
  RISOGRAPH_STYLE,
  RETROCOMIC_STYLE,
  PULPMAGAZINE_STYLE,
  TATTOOFLASH_STYLE,
  BRUTALISTPOSTER_STYLE,
  XEROXZINE_STYLE,
  SCANDINAVIANPOSTER_STYLE,
  VINTAGE_STYLE,
  WHIMSICALJAPANESE_STYLE,
  MODERNISTCOCKTAIL_STYLE,
  MEDITERRANEAN_HERITAGE_STYLE,
  ARTNOUVEAU_STYLE,
  MIDCENTURYMODERN_STYLE,
  LOOSEWATERCOLOR_STYLE,
} from "@/lib/style-config";

export interface StyleLabStyle {
  /** Route used in the style-catalog / nav. */
  route: string;
  /** Canonical style key (matches `StyleConfig.styleKey`). */
  styleKey: string;
  /** Display name (from style-catalog). */
  name: string;
  /** Emoji (from style-catalog). */
  emoji: string;
}

const ROUTE_TO_STYLE_KEY: Record<string, string> = {
  "/": UKIYOE_STYLE.styleKey,
  "/popart": POPART_STYLE.styleKey,
  "/lineart": LINEART_STYLE.styleKey,
  "/minimalism": MINIMALISM_STYLE.styleKey,
  "/graffiti": GRAFFITI_STYLE.styleKey,
  "/botanical": BOTANICAL_STYLE.styleKey,
  "/urbannoir": URBANNOIR_STYLE.styleKey,
  "/screenprint": SCREENPRINT_STYLE.styleKey,
  "/risograph": RISOGRAPH_STYLE.styleKey,
  "/retrocomic": RETROCOMIC_STYLE.styleKey,
  "/pulpmagazine": PULPMAGAZINE_STYLE.styleKey,
  "/tattooflash": TATTOOFLASH_STYLE.styleKey,
  "/brutalistposter": BRUTALISTPOSTER_STYLE.styleKey,
  "/xeroxzine": XEROXZINE_STYLE.styleKey,
  "/scandinavian-poster": SCANDINAVIANPOSTER_STYLE.styleKey,
  "/vintage": VINTAGE_STYLE.styleKey,
  "/whimsical-japanese": WHIMSICALJAPANESE_STYLE.styleKey,
  "/modernist-cocktail": MODERNISTCOCKTAIL_STYLE.styleKey,
  "/mediterranean-heritage": MEDITERRANEAN_HERITAGE_STYLE.styleKey,
  "/artnouveau": ARTNOUVEAU_STYLE.styleKey,
  "/midcenturymodern": MIDCENTURYMODERN_STYLE.styleKey,
  "/loosewatercolor": LOOSEWATERCOLOR_STYLE.styleKey,
};

/**
 * Ordered list of styles usable inside Style Lab. Derived from
 * `STYLE_CATALOG` so display order, name, and emoji stay in sync with
 * the rest of the app — but only entries that have a generation
 * `styleKey` mapping are included (the `/blend` route is intentionally
 * excluded).
 */
export const STYLE_LAB_STYLES: StyleLabStyle[] = STYLE_CATALOG.filter(
  (s) => ROUTE_TO_STYLE_KEY[s.route] !== undefined,
).map((s) => ({
  route: s.route,
  styleKey: ROUTE_TO_STYLE_KEY[s.route],
  name: s.name,
  emoji: s.emoji,
}));

export function styleKeyForRoute(route: string): string | undefined {
  return ROUTE_TO_STYLE_KEY[route];
}

export function styleByKey(key: string): StyleLabStyle | undefined {
  return STYLE_LAB_STYLES.find((s) => s.styleKey === key);
}
