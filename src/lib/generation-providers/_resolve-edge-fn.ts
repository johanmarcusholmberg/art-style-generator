/**
 * Resolve the per-style edge function name for a given styleKey.
 * Centralized so both Lovable and Gemini frontend adapters share the
 * exact same dispatch table.
 */

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
  type StyleConfig,
} from "@/lib/style-config";

const ALL: StyleConfig[] = [
  UKIYOE_STYLE, POPART_STYLE, LINEART_STYLE, MINIMALISM_STYLE,
  GRAFFITI_STYLE, BOTANICAL_STYLE, URBANNOIR_STYLE, SCREENPRINT_STYLE,
  RISOGRAPH_STYLE, RETROCOMIC_STYLE, PULPMAGAZINE_STYLE, TATTOOFLASH_STYLE,
  BRUTALISTPOSTER_STYLE, XEROXZINE_STYLE, SCANDINAVIANPOSTER_STYLE,
  VINTAGE_STYLE, WHIMSICALJAPANESE_STYLE, MODERNISTCOCKTAIL_STYLE,
  MEDITERRANEAN_HERITAGE_STYLE,
];

const BY_KEY: Record<string, StyleConfig> = ALL.reduce((acc, s) => {
  acc[s.styleKey] = s;
  return acc;
}, {} as Record<string, StyleConfig>);

export function resolveEdgeFnForStyle(styleKey: string): string {
  const isFreestyleVariant = styleKey.endsWith("-freestyle");
  const baseKey = isFreestyleVariant ? styleKey.replace(/-freestyle$/, "") : styleKey;
  // Special cases that don't follow the base-key convention
  if (baseKey === "lineart-minimal") return "generate-image-lineart-minimal";
  const cfg = BY_KEY[baseKey];
  if (!cfg) return "generate-image"; // safe default (japanese handler)
  if (isFreestyleVariant && cfg.freestyleEdgeFn) return cfg.freestyleEdgeFn;
  return cfg.themedEdgeFn || cfg.freestyleEdgeFn || "generate-image";
}
