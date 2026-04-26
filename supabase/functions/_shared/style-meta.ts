/**
 * Style metadata layered ON TOP of STYLE_RULES.
 *
 * Source of truth for non-prompt knowledge:
 *  - human-readable display name of the style (used in prompt anchors)
 *  - "medium" tokens that anchor SDXL away from photorealism
 *    (e.g. "screen print", "risograph", "linocut", "flat vector poster")
 *  - default strictness level
 *  - drift risk (used by debug panel to flag likely problem styles)
 *
 * This keeps STYLE_RULES focused on visual rules, and lets us layer
 * provider-aware reinforcement / validation without touching every style.
 */

import { categoryFor, type StyleCategory } from "./prompt-profiles.ts";

export type Strictness = "balanced" | "strict" | "very_strict";

export interface StyleMeta {
  /** Human-friendly name re-injected at start AND end of SDXL prompt. */
  displayName: string;
  /** Concrete medium tokens — keep short, comma-token style. */
  mediumTokens: string[];
  /** Built-in default strictness for this style. */
  defaultStrictness?: Strictness;
}

const POSTER_FLAT_TOKENS = [
  "flat vector poster",
  "screen print poster",
  "graphic illustration",
];
const MINIMAL_TOKENS = [
  "Scandinavian poster",
  "minimal flat illustration",
  "vector poster",
];
const LINEART_TOKENS = [
  "pen and ink illustration",
  "engraving",
  "etching",
];
const PAINTERLY_TOKENS = [
  "gouache illustration",
  "oil painted illustration",
  "traditional painted artwork",
];
const PHOTO_MONO_TOKENS = [
  "black and white photograph",
  "documentary photo",
  "analog film photograph",
];
const LO_FI_PRINT_TOKENS = [
  "screen print",
  "risograph print",
  "halftone poster",
];
const COMIC_TOKENS = [
  "vintage comic book panel",
  "four-color comic print",
  "halftone comic illustration",
];
const TATTOO_TOKENS = [
  "traditional tattoo flash",
  "American traditional tattoo",
  "flash sheet illustration",
];

export const CATEGORY_MEDIUM_TOKENS: Record<StyleCategory, string[]> = {
  poster_flat: POSTER_FLAT_TOKENS,
  minimal: MINIMAL_TOKENS,
  lineart: LINEART_TOKENS,
  painterly: PAINTERLY_TOKENS,
  photographic_mono: PHOTO_MONO_TOKENS,
  lo_fi_print: LO_FI_PRINT_TOKENS,
  comic_print: COMIC_TOKENS,
  tattoo_flash: TATTOO_TOKENS,
  default: ["high quality illustration"],
};

/**
 * Per-style display name + optional extra medium tokens / strictness override.
 * Anything not listed falls back to category defaults.
 */
export const STYLE_META: Record<string, StyleMeta> = {
  japanese: {
    displayName: "Ukiyo-e woodblock print",
    mediumTokens: ["ukiyo-e woodblock print", "Japanese block print"],
    defaultStrictness: "strict",
  },
  freestyle: {
    displayName: "Ukiyo-e woodblock print",
    mediumTokens: ["ukiyo-e woodblock print"],
  },
  popart: {
    displayName: "Pop art screen print",
    mediumTokens: ["pop art screen print", "Lichtenstein comic print"],
    defaultStrictness: "strict",
  },
  "popart-freestyle": {
    displayName: "Pop art illustration",
    mediumTokens: ["pop art screen print", "comic print"],
  },
  lineart: {
    displayName: "Pen-and-ink illustration",
    mediumTokens: LINEART_TOKENS,
    defaultStrictness: "very_strict",
  },
  "lineart-freestyle": {
    displayName: "Pen-and-ink illustration",
    mediumTokens: LINEART_TOKENS,
    defaultStrictness: "strict",
  },
  "lineart-minimal": {
    displayName: "Single-line drawing",
    mediumTokens: ["one-line drawing", "continuous line illustration"],
    defaultStrictness: "very_strict",
  },
  minimalism: {
    displayName: "Scandinavian minimalist poster",
    mediumTokens: ["Scandinavian poster", "Swiss design poster", "flat vector poster"],
    defaultStrictness: "strict",
  },
  "minimalism-freestyle": {
    displayName: "Minimalist poster",
    mediumTokens: MINIMAL_TOKENS,
  },
  graffiti: {
    displayName: "Spray-paint street mural",
    mediumTokens: ["spray paint mural", "stencil street art"],
  },
  "graffiti-freestyle": {
    displayName: "Street art mural",
    mediumTokens: ["spray paint mural", "street art"],
  },
  botanical: {
    displayName: "Scientific botanical illustration",
    mediumTokens: ["botanical watercolor illustration", "scientific plant plate"],
    defaultStrictness: "strict",
  },
  "botanical-freestyle": {
    displayName: "Botanical watercolor",
    mediumTokens: ["botanical watercolor", "natural history illustration"],
  },
  urbannoir: {
    displayName: "B&W urban noir photograph",
    mediumTokens: ["black and white street photograph", "high-contrast monochrome photo"],
    defaultStrictness: "strict",
  },
  "urbannoir-freestyle": {
    displayName: "B&W urban photograph",
    mediumTokens: PHOTO_MONO_TOKENS,
  },
  screenprint: {
    displayName: "Vintage screen print poster",
    mediumTokens: ["vintage screen print poster", "halftone print"],
    defaultStrictness: "very_strict",
  },
  "screenprint-freestyle": {
    displayName: "Screen print poster",
    mediumTokens: ["screen print", "halftone poster"],
    defaultStrictness: "strict",
  },
  risograph: {
    displayName: "Risograph print",
    mediumTokens: ["risograph print", "riso poster", "spot-color print"],
    defaultStrictness: "very_strict",
  },
  "risograph-freestyle": {
    displayName: "Risograph print",
    mediumTokens: ["risograph print", "spot-color print"],
    defaultStrictness: "strict",
  },
  retrocomic: {
    displayName: "Retro comic book print",
    mediumTokens: ["vintage comic book panel", "halftone comic print"],
    defaultStrictness: "strict",
  },
  "retrocomic-freestyle": {
    displayName: "Retro comic illustration",
    mediumTokens: COMIC_TOKENS,
  },
  pulpmagazine: {
    displayName: "Pulp magazine cover painting",
    mediumTokens: ["pulp magazine cover painting", "gouache illustration"],
  },
  "pulpmagazine-freestyle": {
    displayName: "Pulp painted illustration",
    mediumTokens: PAINTERLY_TOKENS,
  },
  tattooflash: {
    displayName: "Traditional tattoo flash",
    mediumTokens: TATTOO_TOKENS,
    defaultStrictness: "very_strict",
  },
  "tattooflash-freestyle": {
    displayName: "Tattoo flash illustration",
    mediumTokens: TATTOO_TOKENS,
    defaultStrictness: "strict",
  },
  brutalistposter: {
    displayName: "Brutalist graphic poster",
    mediumTokens: ["brutalist poster", "raw graphic poster"],
    defaultStrictness: "strict",
  },
  "brutalistposter-freestyle": {
    displayName: "Brutalist poster",
    mediumTokens: ["brutalist poster"],
  },
  xeroxzine: {
    displayName: "Photocopied zine page",
    mediumTokens: ["photocopied zine", "xerox zine page"],
    defaultStrictness: "very_strict",
  },
  "xeroxzine-freestyle": {
    displayName: "Xerox zine page",
    mediumTokens: ["photocopied zine"],
    defaultStrictness: "strict",
  },
  scandinavian_poster: {
    displayName: "Scandinavian minimalist poster",
    mediumTokens: ["Scandinavian poster", "Nordic minimalist poster", "flat vector poster"],
    defaultStrictness: "strict",
  },
  "scandinavian_poster-freestyle": {
    displayName: "Scandinavian minimalist poster",
    mediumTokens: ["Scandinavian poster", "Nordic minimalist poster", "flat vector poster"],
    defaultStrictness: "strict",
  },
};

/** Fallback-aware lookup. Always returns a usable meta. */
export function getStyleMeta(styleKey: string): StyleMeta {
  const meta = STYLE_META[styleKey];
  if (meta) return meta;
  const cat = categoryFor(styleKey);
  return {
    displayName: styleKey,
    mediumTokens: CATEGORY_MEDIUM_TOKENS[cat],
  };
}

/** Get medium tokens, deduped, capped. */
export function getMediumTokens(styleKey: string, max = 4): string[] {
  const meta = getStyleMeta(styleKey);
  const cat = categoryFor(styleKey);
  const merged = [...meta.mediumTokens, ...CATEGORY_MEDIUM_TOKENS[cat]];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of merged) {
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
      if (out.length >= max) break;
    }
  }
  return out;
}

// ── Strictness ──────────────────────────────────────────────────────────

export function defaultStrictnessFor(
  styleKey: string,
  provider: "gemini" | "sdxl" | "openai",
): Strictness {
  const explicit = STYLE_META[styleKey]?.defaultStrictness;
  if (explicit) return explicit;
  // SDXL drifts more — bias to strict
  if (provider === "sdxl") return "strict";
  return "balanced";
}

export interface StrictnessProfile {
  /** How many times to repeat the medium / style anchor in SDXL prompt. */
  sdxlAnchorRepeats: number;
  /** How many extra negative tokens to enforce in SDXL. */
  sdxlNegativeBoost: number;
  /** Whether to append a final "STYLE RECONFIRM" tail block. */
  appendReconfirmTail: boolean;
}

export const STRICTNESS_PROFILES: Record<Strictness, StrictnessProfile> = {
  balanced: {
    sdxlAnchorRepeats: 1,
    sdxlNegativeBoost: 0,
    appendReconfirmTail: false,
  },
  strict: {
    sdxlAnchorRepeats: 2,
    sdxlNegativeBoost: 4,
    appendReconfirmTail: true,
  },
  very_strict: {
    sdxlAnchorRepeats: 3,
    sdxlNegativeBoost: 8,
    appendReconfirmTail: true,
  },
};

// ── Prompt validation ───────────────────────────────────────────────────

export interface ValidationIssue {
  level: "error" | "warning";
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
}

/**
 * Validate a compiled prompt before sending it to the provider.
 * Returns issues — caller decides whether to block.
 */
export function validateCompiledPrompt(args: {
  styleKey: string;
  provider: "gemini" | "sdxl" | "openai";
  prompt: string;
  negativePrompt?: string;
  styleMustHavesCount: number;
  styleAvoidCount: number;
}): ValidationReport {
  const issues: ValidationIssue[] = [];
  const meta = getStyleMeta(args.styleKey);
  const lower = args.prompt.toLowerCase();

  if (!lower.includes(meta.displayName.toLowerCase().split(" ")[0])) {
    // First word of display name is a soft anchor — only warn, not block
    issues.push({
      level: "warning",
      message: `Prompt does not mention style anchor (${meta.displayName})`,
    });
  }

  if (args.styleMustHavesCount < 3) {
    issues.push({
      level: "error",
      message: "Compiled prompt has fewer than 3 style must-haves",
    });
  }
  if (args.styleAvoidCount < 3) {
    issues.push({
      level: "error",
      message: "Compiled prompt has fewer than 3 avoid rules",
    });
  }

  if (!/print|poster|wall art|resolution/i.test(args.prompt)) {
    issues.push({
      level: "warning",
      message: "Prompt does not include a print-quality instruction",
    });
  }

  if (args.provider === "sdxl") {
    if (!args.negativePrompt || args.negativePrompt.length < 30) {
      issues.push({
        level: "error",
        message: "SDXL prompt is missing a substantive negative prompt",
      });
    }
    // Anchor must appear at least twice for SDXL style lock
    const anchorWord = meta.displayName.toLowerCase().split(" ")[0];
    const occurrences = (lower.match(new RegExp(anchorWord, "g")) || []).length;
    if (occurrences < 2) {
      issues.push({
        level: "warning",
        message: `SDXL: style anchor "${anchorWord}" appears only ${occurrences}× — should appear at start AND end`,
      });
    }
  }

  return {
    ok: issues.every((i) => i.level !== "error"),
    issues,
  };
}

// ── Drift risk estimate (debug only) ────────────────────────────────────

export type DriftRisk = "low" | "medium" | "high";

/**
 * Heuristic: how likely is the provider to drift from the selected style.
 * Used in the debug panel to flag risky combinations before wasting credits.
 */
export function estimateDriftRisk(
  styleKey: string,
  provider: "gemini" | "sdxl" | "openai",
  strictness: Strictness,
): DriftRisk {
  const cat = categoryFor(styleKey);

  // SDXL drifts most on flat poster / minimal / line art unless very_strict
  if (provider === "sdxl") {
    const risky: StyleCategory[] = ["poster_flat", "minimal", "lineart", "lo_fi_print", "tattoo_flash"];
    if (risky.includes(cat)) {
      if (strictness === "very_strict") return "low";
      if (strictness === "strict") return "medium";
      return "high";
    }
    return strictness === "balanced" ? "medium" : "low";
  }

  // OpenAI tends to drift toward photorealism on flat/poster styles
  if (provider === "openai") {
    const risky: StyleCategory[] = ["poster_flat", "lineart", "lo_fi_print", "comic_print"];
    if (risky.includes(cat)) {
      return strictness === "balanced" ? "medium" : "low";
    }
    return "low";
  }

  // Gemini follows instructions well — usually low
  return "low";
}
