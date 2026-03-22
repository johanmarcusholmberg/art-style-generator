/**
 * Aspect-ratio normalization utilities.
 *
 * Given a source image size and a target ratio, calculate crop or pad
 * parameters so the output matches the ratio exactly — never stretching.
 */

export interface RatioNormalizationResult {
  /** Method used to reach target ratio */
  method: "none" | "crop" | "pad";
  /** Source dimensions */
  sourceWidth: number;
  sourceHeight: number;
  /** Final dimensions after normalization */
  outputWidth: number;
  outputHeight: number;
  /** Crop offsets (only when method === "crop") */
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  /** Pad offsets (only when method === "pad") */
  padLeft: number;
  padTop: number;
  padRight: number;
  padBottom: number;
  /** The target ratio that was requested */
  targetRatio: number;
  /** The source ratio before normalization */
  sourceRatio: number;
}

/**
 * Parse an aspect ratio string like "5:7" into a decimal (width / height).
 */
export function parseRatio(ratio: string): number {
  const [w, h] = ratio.split(":").map(Number);
  if (!w || !h || h === 0) return 1;
  return w / h;
}

/** Tolerance for considering ratios equal (< 0.5 %) */
const RATIO_TOLERANCE = 0.005;

/**
 * Determine whether a source image already matches the target ratio.
 */
export function ratioMatches(
  sourceWidth: number,
  sourceHeight: number,
  targetRatio: string,
): boolean {
  const target = parseRatio(targetRatio);
  const source = sourceWidth / sourceHeight;
  return Math.abs(source - target) / target < RATIO_TOLERANCE;
}

/**
 * Calculate smart-crop parameters to reach the target ratio.
 *
 * Crops the minimal amount from the longer relative dimension,
 * centred on the image (preserving the middle of the composition).
 */
export function calculateCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetRatio: string,
): RatioNormalizationResult {
  const target = parseRatio(targetRatio);
  const sourceRatio = sourceWidth / sourceHeight;

  if (Math.abs(sourceRatio - target) / target < RATIO_TOLERANCE) {
    return noChange(sourceWidth, sourceHeight, target, sourceRatio);
  }

  let cropWidth: number;
  let cropHeight: number;

  if (sourceRatio > target) {
    // Source is wider than target — crop width
    cropHeight = sourceHeight;
    cropWidth = Math.round(sourceHeight * target);
  } else {
    // Source is taller than target — crop height
    cropWidth = sourceWidth;
    cropHeight = Math.round(sourceWidth / target);
  }

  // Centre the crop
  const cropX = Math.round((sourceWidth - cropWidth) / 2);
  const cropY = Math.round((sourceHeight - cropHeight) / 2);

  return {
    method: "crop",
    sourceWidth,
    sourceHeight,
    outputWidth: cropWidth,
    outputHeight: cropHeight,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    padLeft: 0,
    padTop: 0,
    padRight: 0,
    padBottom: 0,
    targetRatio: target,
    sourceRatio,
  };
}

/**
 * Calculate padding parameters to reach the target ratio.
 *
 * Extends the canvas on the shorter relative dimension,
 * evenly on both sides, so the original image stays centred.
 */
export function calculatePad(
  sourceWidth: number,
  sourceHeight: number,
  targetRatio: string,
): RatioNormalizationResult {
  const target = parseRatio(targetRatio);
  const sourceRatio = sourceWidth / sourceHeight;

  if (Math.abs(sourceRatio - target) / target < RATIO_TOLERANCE) {
    return noChange(sourceWidth, sourceHeight, target, sourceRatio);
  }

  let outputWidth: number;
  let outputHeight: number;

  if (sourceRatio > target) {
    // Source is wider — pad height
    outputWidth = sourceWidth;
    outputHeight = Math.round(sourceWidth / target);
  } else {
    // Source is taller — pad width
    outputHeight = sourceHeight;
    outputWidth = Math.round(sourceHeight * target);
  }

  const padLeft = Math.round((outputWidth - sourceWidth) / 2);
  const padTop = Math.round((outputHeight - sourceHeight) / 2);

  return {
    method: "pad",
    sourceWidth,
    sourceHeight,
    outputWidth,
    outputHeight,
    cropX: 0,
    cropY: 0,
    cropWidth: sourceWidth,
    cropHeight: sourceHeight,
    padLeft,
    padTop,
    padRight: outputWidth - sourceWidth - padLeft,
    padBottom: outputHeight - sourceHeight - padTop,
    targetRatio: target,
    sourceRatio,
  };
}

/**
 * Smart normalization: choose crop or pad based on which discards /
 * adds less area. Prefers crop when the difference is small (< 10 %
 * area loss) since it preserves native pixels.
 */
export function normalizeRatio(
  sourceWidth: number,
  sourceHeight: number,
  targetRatio: string,
  preferredMethod: "crop" | "pad" | "auto" = "pad",
): RatioNormalizationResult {
  const target = parseRatio(targetRatio);
  const sourceRatio = sourceWidth / sourceHeight;

  if (Math.abs(sourceRatio - target) / target < RATIO_TOLERANCE) {
    return noChange(sourceWidth, sourceHeight, target, sourceRatio);
  }

  if (preferredMethod === "crop") return calculateCrop(sourceWidth, sourceHeight, targetRatio);
  if (preferredMethod === "pad") return calculatePad(sourceWidth, sourceHeight, targetRatio);

  // Auto: prefer padding to never crop artwork
  return calculatePad(sourceWidth, sourceHeight, targetRatio);
}

// ── helpers ──

function noChange(
  w: number,
  h: number,
  target: number,
  source: number,
): RatioNormalizationResult {
  return {
    method: "none",
    sourceWidth: w,
    sourceHeight: h,
    outputWidth: w,
    outputHeight: h,
    cropX: 0,
    cropY: 0,
    cropWidth: w,
    cropHeight: h,
    padLeft: 0,
    padTop: 0,
    padRight: 0,
    padBottom: 0,
    targetRatio: target,
    sourceRatio: source,
  };
}
