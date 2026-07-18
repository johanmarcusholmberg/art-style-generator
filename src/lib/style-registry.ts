/**
 * Canonical art-style registry (Stage 1).
 *
 * SINGLE source of truth used by every consumer that needs:
 *   - "list of art styles" (Batch Studio, Style Compare, Style Lab,
 *     Style Control Panel, ProviderDebug, Gallery onboarding)
 *   - "route → styleKey" or "mode → edge function" lookups
 *
 * Two upstream files are intentionally re-used rather than duplicated:
 *   - `src/lib/style-catalog.ts` — presentation metadata (name, emoji,
 *     description, family, visibility, print/texture profile).
 *   - `src/lib/style-config.ts`  — prompt-compiler configs with the
 *     canonical `styleKey`, mode values, edge-fn names.
 *   - `src/lib/generation-providers/_resolve-edge-fn.ts` — mode → edge
 *     function dispatch (already derives from style-config).
 *
 * This module merges the two upstream sources into one flat list of
 * `StyleModeEntry` rows and exposes small helpers per-consumer. No
 * consumer maintains its own list of styles, edge functions, or
 * strictness rows any more.
 */

import {
  STYLE_CATALOG,
  type StyleCatalogEntry,
} from "@/lib/style-catalog";
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
  type StyleConfig,
} from "@/lib/style-config";
import { resolveEdgeFnForStyle } from "@/lib/generation-providers/_resolve-edge-fn";

// ── Route ↔ prompt-compiler config ─────────────────────────────────────
//
// This is the ONLY place in the app that owns the route → StyleConfig
// mapping. Adding a new style page = add one row here plus a matching
// entry in STYLE_CATALOG and STYLE_RULES. Everything else derives.
export const STYLE_CONFIG_BY_ROUTE: Record<string, StyleConfig> = {
  "/": UKIYOE_STYLE,
  "/popart": POPART_STYLE,
  "/lineart": LINEART_STYLE,
  "/minimalism": MINIMALISM_STYLE,
  "/graffiti": GRAFFITI_STYLE,
  "/botanical": BOTANICAL_STYLE,
  "/urbannoir": URBANNOIR_STYLE,
  "/screenprint": SCREENPRINT_STYLE,
  "/risograph": RISOGRAPH_STYLE,
  "/retrocomic": RETROCOMIC_STYLE,
  "/pulpmagazine": PULPMAGAZINE_STYLE,
  "/tattooflash": TATTOOFLASH_STYLE,
  "/brutalistposter": BRUTALISTPOSTER_STYLE,
  "/xeroxzine": XEROXZINE_STYLE,
  "/scandinavian-poster": SCANDINAVIANPOSTER_STYLE,
  "/vintage": VINTAGE_STYLE,
  "/whimsical-japanese": WHIMSICALJAPANESE_STYLE,
  "/modernist-cocktail": MODERNISTCOCKTAIL_STYLE,
  "/mediterranean-heritage": MEDITERRANEAN_HERITAGE_STYLE,
  "/artnouveau": ARTNOUVEAU_STYLE,
  "/midcenturymodern": MIDCENTURYMODERN_STYLE,
  "/loosewatercolor": LOOSEWATERCOLOR_STYLE,
};

/** Reverse index: canonical styleKey → route. */
export const ROUTE_BY_STYLE_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(STYLE_CONFIG_BY_ROUTE).map(([route, cfg]) => [cfg.styleKey, route]),
);

/** Canonical route → styleKey lookup (replaces `style-lab-styles.ts` copy). */
export function styleKeyForRoute(route: string): string | undefined {
  return STYLE_CONFIG_BY_ROUTE[route]?.styleKey;
}

/** Route lookup for a canonical styleKey. */
export function routeForStyleKey(styleKey: string): string | undefined {
  return ROUTE_BY_STYLE_KEY[styleKey];
}

/**
 * Return the edge-function name for a given generation mode value
 * (e.g. `"popart"`, `"popart-freestyle"`, `"lineart-minimal"`).
 * Thin wrapper around the existing dispatcher so consumers don't
 * import from `_resolve-edge-fn.ts` directly.
 */
export function getEdgeFnForMode(mode: string): string {
  // Prefer the registry (built from StyleConfig) so mode values like
  // "freestyle" or "lineart-minimal" resolve to the correct edge fn
  // without relying on the styleKey-based fallback dispatcher.
  const entry = STYLE_MODES.find((m) => m.mode === mode);
  if (entry) return entry.edgeFn;
  return resolveEdgeFnForStyle(mode);
}

// ── Flat mode registry ─────────────────────────────────────────────────

export type StyleModeKind = "themed" | "freestyle" | "tertiary";

export interface StyleModeEntry {
  /** Mode value stored on generated_images.mode and used as styleKey. */
  mode: string;
  /** Emoji-prefixed label, e.g. "🎯 Pop Art". */
  label: string;
  /** Display label without emoji. */
  displayName: string;
  /** Emoji badge for this mode. */
  emoji: string;
  /** Edge function name that generates this mode. */
  edgeFn: string;
  /** Parent style route from STYLE_CATALOG. */
  route: string;
  /** Family taxonomy (from catalog). */
  family?: StyleCatalogEntry["family"];
  /** Catalog visibility of the parent style. */
  parentVisibility: NonNullable<StyleCatalogEntry["visibility"]>;
  /** Kind of mode. */
  kind: StyleModeKind;
  /** Freestyle/tertiary rows carry the themed styleKey for prompt-history keys etc. */
  parentStyleKey: string;
}

function catalogForRoute(route: string): StyleCatalogEntry | undefined {
  return STYLE_CATALOG.find((s) => s.route === route);
}

function buildStyleModes(): StyleModeEntry[] {
  const rows: StyleModeEntry[] = [];
  // Iterate in STYLE_CATALOG order so UI presentation is stable.
  for (const cat of STYLE_CATALOG) {
    const cfg = STYLE_CONFIG_BY_ROUTE[cat.route];
    if (!cfg) continue; // e.g. /blend — no generation config here
    const parentVisibility = cat.visibility ?? "primary";

    const themed: StyleModeEntry = {
      mode: cfg.themedModeValue,
      label: `${cfg.themedBadge} ${cat.name}`,
      displayName: cat.name,
      emoji: cfg.themedBadge,
      edgeFn: cfg.themedEdgeFn,
      route: cat.route,
      family: cat.family,
      parentVisibility,
      kind: "themed",
      parentStyleKey: cfg.styleKey,
    };
    rows.push(themed);

    rows.push({
      mode: cfg.freestyleModeValue,
      label: `${cfg.themedBadge} ${cat.name} Freestyle`,
      displayName: `${cat.name} Freestyle`,
      emoji: cfg.themedBadge,
      edgeFn: cfg.freestyleEdgeFn,
      route: cat.route,
      family: cat.family,
      parentVisibility,
      kind: "freestyle",
      parentStyleKey: cfg.styleKey,
    });

    if (cfg.tertiaryModeValue && cfg.tertiaryEdgeFn) {
      rows.push({
        mode: cfg.tertiaryModeValue,
        label: `${cfg.tertiaryBadge ?? cfg.themedBadge} ${
          cfg.tertiaryTabLabel?.replace(/^[^\w]+\s*/, "") ?? cfg.tertiaryModeValue
        }`,
        displayName: cfg.tertiaryTabLabel?.replace(/^[^\w]+\s*/, "") ?? cfg.tertiaryModeValue,
        emoji: cfg.tertiaryBadge ?? cfg.themedBadge,
        edgeFn: cfg.tertiaryEdgeFn,
        route: cat.route,
        family: cat.family,
        parentVisibility,
        kind: "tertiary",
        parentStyleKey: cfg.styleKey,
      });
    }
  }
  return rows;
}

/** All generation modes across every registered style. Ordered by catalog. */
export const STYLE_MODES: StyleModeEntry[] = buildStyleModes();

export function getStyleModeByValue(mode: string): StyleModeEntry | undefined {
  return STYLE_MODES.find((m) => m.mode === mode);
}

// ── Per-consumer views (all derived — never hand-maintained) ───────────

/**
 * Options shown in Batch Studio (Batch / Style Grid / Prompt Matrix).
 * Includes themed + freestyle + tertiary for every style whose parent is
 * a primary catalog entry OR a variant. Keeps existing `{value,label}`
 * shape so DB payloads and existing UI keep working.
 */
export function getBatchStyleOptions(): { value: string; label: string }[] {
  return STYLE_MODES
    .filter((m) => m.parentVisibility !== "hidden")
    .map((m) => ({ value: m.mode, label: m.label }));
}

/**
 * Options offered by Style Compare. Primary + variant themed styles only
 * (no freestyle rows — Compare focuses on one subject rendered across
 * distinct styles, not across themed/freestyle pairs).
 */
export function getCompareStyleOptions(): { value: string; label: string; route: string }[] {
  return STYLE_MODES
    .filter((m) => m.kind === "themed" && m.parentVisibility !== "hidden")
    .map((m) => ({ value: m.mode, label: m.label, route: m.route }));
}

/**
 * Rows shown in the Style Control Panel strictness table. Includes
 * themed + freestyle + tertiary for every visible style so overrides
 * cover the same surface area users can generate.
 */
export function getControlPanelStyleOptions(): { id: string; label: string }[] {
  return STYLE_MODES
    .filter((m) => m.parentVisibility !== "hidden")
    .map((m) => ({ id: m.mode, label: m.label }));
}

/**
 * Rows Style Lab can test against. Themed modes only, matching the
 * existing StyleLabStyle shape.
 */
export interface StyleLabRegistryEntry {
  route: string;
  styleKey: string;
  name: string;
  emoji: string;
}

export function getStyleLabStyles(): StyleLabRegistryEntry[] {
  return STYLE_MODES
    .filter((m) => m.kind === "themed" && m.parentVisibility !== "hidden")
    .map((m) => {
      const cat = catalogForRoute(m.route)!;
      return {
        route: m.route,
        styleKey: m.parentStyleKey,
        name: cat.name,
        emoji: cat.emoji,
      };
    });
}

/**
 * Compact list of primary style cards shown in the Gallery empty-state
 * onboarding. Returns the first `limit` primary catalog entries that
 * have a matching generation config (so /blend is excluded).
 */
export interface GalleryOnboardingCard {
  emoji: string;
  label: string;
  desc: string;
  to: string;
}

export function getGalleryOnboardingStyles(limit = 6): GalleryOnboardingCard[] {
  return STYLE_CATALOG
    .filter((s) => (s.visibility ?? "primary") === "primary")
    .filter((s) => STYLE_CONFIG_BY_ROUTE[s.route])
    .slice(0, limit)
    .map((s) => ({ emoji: s.emoji, label: s.name, desc: s.description, to: s.route }));
}
