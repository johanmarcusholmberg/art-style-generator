/**
 * Poster Composer — type definitions.
 *
 * Strict additive layer on top of the image generator. The composer never
 * mutates the source image; it only wraps it with a layout + text overlay
 * that gets baked in at export time.
 *
 *   artwork layer → generated image (untouched)
 *   layout layer  → text, margins, composition
 *   export layer  → canvas merge (PNG / Etsy preview)
 */

export type PosterTemplateId = "minimal" | "fika" | "botanical";

/**
 * How the user-entered text is handled:
 *   - "composer"  (DEFAULT, recommended for Etsy/print) — text is rendered
 *                 as a clean canvas/HTML overlay by Poster Composer. The
 *                 text is NOT injected into the generation prompt; the
 *                 generator only receives a layout hint asking it to leave
 *                 a clean empty area.
 *   - "generated" — text is injected into the generation prompt using the
 *                 existing app behaviour. Useful when the user wants the
 *                 typography to be part of the artwork itself.
 */
export type PosterTextMode = "composer" | "generated";

export interface PosterTextContent {
  title?: string;
  subtitle?: string;
  description?: string;
  ingredients?: string[];
}

export interface PosterLayoutConfig {
  /** When true, a reserved area is rendered for text. */
  safeAreaEnabled: boolean;
  /** Where the reserved area sits relative to the image. */
  safeAreaPosition: "bottom" | "top";
  /** Fraction of poster height occupied by the safe area, 0..1. */
  safeAreaHeightRatio: number;
  /** Background colour of the safe area (CSS colour). */
  safeAreaBackground?: string;
}

export interface PosterState {
  templateId: PosterTemplateId;
  textMode: PosterTextMode;
  text: PosterTextContent;
  layout: PosterLayoutConfig;
  /** URL of the artwork image — never mutated by the composer. */
  imageUrl: string;
  /**
   * Optional override telling the export pipeline which print format id
   * to use. Defaults to the registry default in print-formats.ts.
   */
  printFormatId?: string;
}

/**
 * Result of `exportPoster()` — mirrors PrintExportResult for parity with
 * the existing download UI.
 */
export interface PosterExportResult {
  blob: Blob;
  width: number;
  height: number;
  printFormatId: string;
  /** Tier achieved by the underlying print export. */
  tier: "preferred" | "fallback" | "source";
}
