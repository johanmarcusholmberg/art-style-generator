/**
 * Upscale recommendation engine.
 *
 * Given a source image size and a target print format / PPI, returns the
 * cheapest upscale preset that reaches the requested print quality, plus a
 * full breakdown of every preset for transparency.
 *
 * Pure functions — no side effects, no provider calls. Used by the standalone
 * Print Calculator page.
 */
import {
  UPSCALE_MODES,
  UPSCALE_MODE_OPTIONS,
  UPSCALE_COST_LABEL,
  TILE_8X_MAX_LONG_SIDE,
  type UpscaleMode,
  type UpscaleModeConfig,
} from "./upscale-modes";
import { type PrintFormat } from "./print-formats";

export type PpiTier = "preferred" | "fallback" | "below";

export interface UpscaleEstimate {
  mode: UpscaleMode;
  config: UpscaleModeConfig;
  /** Effective scale factor actually applied (may be clamped, e.g. tile_8x → 4×) */
  effectiveScale: number;
  /** Output pixels after upscale (clamped where the provider would downshift) */
  outputWidth: number;
  outputHeight: number;
  /** Effective PPI at the requested print format (min of W/H PPI). */
  ppi: number;
  ppiTier: PpiTier;
  /** True if mode meets the user's target PPI. */
  meetsTarget: boolean;
  /** True if the provider would downshift (tile_8x clamp). */
  willDownshift: boolean;
  /** Rank used for cheapest-fits selection (lower = cheaper / faster). */
  costRank: number;
  /** Approx tile count for tiled modes — purely informational. */
  estimatedTiles?: number;
}

export interface UpscaleRecommendation {
  /** Cheapest preset that meets the target PPI (or the strongest if none do). */
  recommended: UpscaleEstimate;
  /** True if `recommended` actually meets the target. */
  reachesTarget: boolean;
  /** Required pixels at the target PPI for the chosen format. */
  targetWidthPx: number;
  targetHeightPx: number;
  /** Full breakdown for every enabled preset, ordered by cost rank. */
  options: UpscaleEstimate[];
  /** Human-readable explanation of the recommendation. */
  rationale: string;
}

/** Lower rank = cheaper / faster. */
const COST_RANK: Record<UpscaleMode, number> = {
  none: 0,
  realesrgan_4x: 1,
  print_target_300: 1, // single dynamic Real-ESRGAN pass — same cost tier as 4×
  tile_4x: 2,
  print_plus: 3,
  tile_8x: 4,
};

const CM_TO_IN = 1 / 2.54;

/** Pixel target for a print format at an arbitrary PPI. */
export function pixelsForFormat(format: PrintFormat, ppi: number): { width: number; height: number } {
  return {
    width: Math.round(format.widthCm * CM_TO_IN * ppi),
    height: Math.round(format.heightCm * CM_TO_IN * ppi),
  };
}

/** Effective PPI for given pixels at a print format (min of width/height). */
export function ppiForPixels(format: PrintFormat, width: number, height: number): number {
  const ppiW = width / (format.widthCm * CM_TO_IN);
  const ppiH = height / (format.heightCm * CM_TO_IN);
  return Math.floor(Math.min(ppiW, ppiH));
}

export function ppiTier(ppi: number): PpiTier {
  if (ppi >= 300) return "preferred";
  if (ppi >= 150) return "fallback";
  return "below";
}

function estimateTiles(outputWidth: number, outputHeight: number): number {
  // Clarity tiles ~1024px with overlap; coarse estimate for UI display only.
  const cols = Math.max(1, Math.ceil(outputWidth / 1024));
  const rows = Math.max(1, Math.ceil(outputHeight / 1024));
  return cols * rows;
}

/** Build an estimate for a single preset. */
export function estimateUpscale(
  sourceWidth: number,
  sourceHeight: number,
  format: PrintFormat,
  targetPpi: number,
  config: UpscaleModeConfig,
): UpscaleEstimate {
  let effectiveScale = config.scaleFactor;
  let outputWidth = Math.round(sourceWidth * effectiveScale);
  let outputHeight = Math.round(sourceHeight * effectiveScale);
  let willDownshift = false;

  // Reproduce the tile_8x downshift rule: if long side would exceed cap, fall back to 4×.
  if (config.id === "tile_8x") {
    const longSide = Math.max(outputWidth, outputHeight);
    if (longSide > TILE_8X_MAX_LONG_SIDE) {
      effectiveScale = 4;
      outputWidth = Math.round(sourceWidth * 4);
      outputHeight = Math.round(sourceHeight * 4);
      willDownshift = true;
    }
  }

  const ppi = ppiForPixels(format, outputWidth, outputHeight);
  const tier = ppiTier(ppi);
  const meetsTarget = ppi >= targetPpi;

  return {
    mode: config.id,
    config,
    effectiveScale,
    outputWidth,
    outputHeight,
    ppi,
    ppiTier: tier,
    meetsTarget,
    willDownshift,
    costRank: COST_RANK[config.id],
    estimatedTiles: config.tiled ? estimateTiles(outputWidth, outputHeight) : undefined,
  };
}

/**
 * Recommend the cheapest enabled preset that reaches `targetPpi` for the given
 * print format. If no preset reaches it, return the strongest available.
 */
export function recommendUpscale(
  sourceWidth: number,
  sourceHeight: number,
  format: PrintFormat,
  targetPpi: number = 300,
): UpscaleRecommendation {
  const target = pixelsForFormat(format, targetPpi);

  const options = UPSCALE_MODE_OPTIONS.filter((o) => o.enabled)
    .map((cfg) => estimateUpscale(sourceWidth, sourceHeight, format, targetPpi, cfg))
    .sort((a, b) => a.costRank - b.costRank);

  const fits = options.filter((o) => o.meetsTarget);
  let recommended: UpscaleEstimate;
  let rationale: string;

  if (fits.length > 0) {
    recommended = fits[0];
    if (recommended.mode === "none") {
      rationale = `Source already exceeds ${targetPpi} PPI at ${format.label}. No upscale needed.`;
    } else {
      rationale =
        `${recommended.config.label} is the cheapest preset that reaches ` +
        `${targetPpi} PPI for ${format.label} (${recommended.ppi} PPI, ` +
        `${recommended.outputWidth}×${recommended.outputHeight}px).`;
    }
  } else {
    // None reach the target — pick the strongest by output PPI.
    recommended = [...options].sort((a, b) => b.ppi - a.ppi)[0];
    rationale =
      `No preset reaches ${targetPpi} PPI for ${format.label} from this source. ` +
      `${recommended.config.label} gets closest at ~${recommended.ppi} PPI. ` +
      `Consider generating at a larger base size, or accept 150 PPI standard-print quality.`;
  }

  return {
    recommended,
    reachesTarget: recommended.meetsTarget,
    targetWidthPx: target.width,
    targetHeightPx: target.height,
    options,
    rationale,
  };
}

export { UPSCALE_COST_LABEL, UPSCALE_MODES };
