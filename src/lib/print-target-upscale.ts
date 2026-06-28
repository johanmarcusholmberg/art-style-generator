/**
 * Dynamic print-target upscale calculator.
 *
 * Given a CORRECTED poster master (width × height that already matches the
 * selected print format's aspect ratio) and a target print format, compute
 * the exact scale factor required to reach the format's 300 PPI pixel
 * target and return a rich plan the UI / hooks / cost-event writers can
 * consume.
 *
 * Hard rules baked in:
 *   - Never round the required scale DOWN. We ceil to a safe provider
 *     precision (default 2 decimals) so the predicted output is always
 *     ≥ the target width AND target height.
 *   - Slightly above 300 PPI is fine.
 *   - Slightly below 300 PPI is NOT print-ready and must not be labelled
 *     as such (status mapping reflects this).
 *   - Predicted output that exceeds `maxLongSide` is blocked.
 *   - Caller is responsible for actually running poster-ratio correction
 *     before and after the upscale — this helper assumes the input is
 *     already the corrected master.
 *
 * This module is pure (no I/O, no DOM, no fetch) and fully unit-tested.
 */

import { getPrintFormat } from "@/lib/print-formats";
import { TILE_8X_MAX_LONG_SIDE } from "@/lib/upscale-modes";

/** Real-ESRGAN edge function clamps scale into [2, 8]. */
export const REALESRGAN_DYNAMIC_MIN_SCALE = 2;
export const REALESRGAN_DYNAMIC_MAX_SCALE = 8;

/**
 * Default safety cap on the longer side of any dynamic upscale output.
 * Mirrors the frontend tile-8x cap and matches backend ceiling (12288).
 * Front-end is intentionally conservative — backend hard cap is 12288 px
 * and the dynamic helper will block any request whose predicted output
 * would exceed this limit.
 */
export const DYNAMIC_DEFAULT_MAX_LONG_SIDE = TILE_8X_MAX_LONG_SIDE;

export type PrintTargetUpscaleFamily = "realesrgan" | "clarity";

export type PrintTargetUpscaleStatus =
  | "already_ready"
  | "dynamic_upscale_recommended"
  | "source_too_small"
  | "output_too_large"
  | "unsupported_dynamic_scale";

export interface CalculatePrintTargetUpscaleInput {
  sourceWidth: number;
  sourceHeight: number;
  posterFormatId: string;
  /** Target DPI. Currently only 300 is supported as a print-ready target. */
  targetDpi?: 150 | 200 | 300;
  upscaleFamily?: PrintTargetUpscaleFamily;
  /** Hard cap on the longer side of the predicted output. */
  maxLongSide?: number;
  /** Decimal places of provider scale precision. */
  scalePrecision?: number;
}

export interface PrintTargetUpscalePlan {
  posterFormatId: string;
  targetDpi: number;
  targetWidth: number;
  targetHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  /** Raw exact scale (max of width/height ratios). */
  requiredScaleRaw: number;
  /** Required scale rounded to `scalePrecision` decimals (informational). */
  requiredScaleRounded: number;
  /**
   * Scale we actually request from the provider. Always >= required so the
   * predicted output is never below the target on either axis.
   */
  requestedScale: number;
  predictedOutputWidth: number;
  predictedOutputHeight: number;
  predictedLongSide: number;
  /** Effective minimum PPI of the predicted output at the chosen format. */
  effectivePpiAfterUpscale: number;
  /** True iff predicted output ≥ target on BOTH axes (i.e. ≥ 300 PPI). */
  clears300Ppi: boolean;
  exceedsMaxLongSide: boolean;
  status: PrintTargetUpscaleStatus;
  reason: string;
  warning: string | null;
  upscaleFamily: PrintTargetUpscaleFamily;
  scalePrecision: number;
  maxLongSide: number;
  /** True when we had to ceil up (i.e. raw was not on a safe precision step). */
  roundedScaleUp: boolean;
  /** True when no upscale is needed (source already at/above target). */
  noUpscaleNeeded: boolean;
}

const CM_TO_INCHES = 1 / 2.54;

/**
 * Ceil a positive value up to the next multiple of `step` (= 10^-precision).
 * Mirrors `Math.ceil(value * 10^p) / 10^p` while avoiding float quirks.
 */
export function ceilToSafePrecision(value: number, precision: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const p = Math.max(0, Math.floor(precision));
  const m = Math.pow(10, p);
  // Float-safe ceil — values that are already on the precision grid should
  // not jump up an extra step due to binary representation noise.
  const scaled = value * m;
  const eps = 1e-9 * Math.max(1, scaled);
  return Math.ceil(scaled - eps) / m;
}

function targetPixelsFor(
  format: ReturnType<typeof getPrintFormat>,
  dpi: number,
): { width: number; height: number } {
  if (!format) throw new Error("targetPixelsFor: unknown format");
  if (dpi === 300) {
    return { width: format.preferredPixelWidth, height: format.preferredPixelHeight };
  }
  // Derive width/height from cm dimensions at the requested DPI.
  const w = Math.round(format.widthCm * CM_TO_INCHES * dpi);
  const h = Math.round(format.heightCm * CM_TO_INCHES * dpi);
  return { width: w, height: h };
}

/**
 * Compute the dynamic upscale plan. Pure & deterministic.
 */
export function calculatePrintTargetUpscale(
  input: CalculatePrintTargetUpscaleInput,
): PrintTargetUpscalePlan {
  const targetDpi = input.targetDpi ?? 300;
  const upscaleFamily: PrintTargetUpscaleFamily = input.upscaleFamily ?? "realesrgan";
  const maxLongSide = input.maxLongSide ?? DYNAMIC_DEFAULT_MAX_LONG_SIDE;
  const scalePrecision = input.scalePrecision ?? 2;

  const format = getPrintFormat(input.posterFormatId);
  if (!format) {
    throw new Error(`calculatePrintTargetUpscale: unknown posterFormatId "${input.posterFormatId}"`);
  }
  if (input.sourceWidth <= 0 || input.sourceHeight <= 0) {
    throw new Error("calculatePrintTargetUpscale: invalid source dimensions");
  }

  const target = targetPixelsFor(format, targetDpi);
  const requiredScaleRaw = Math.max(
    target.width / input.sourceWidth,
    target.height / input.sourceHeight,
  );
  const requiredScaleRounded =
    Math.round(requiredScaleRaw * Math.pow(10, scalePrecision)) /
    Math.pow(10, scalePrecision);

  // Already meets target — no upscale required.
  if (requiredScaleRaw <= 1) {
    const long = Math.max(input.sourceWidth, input.sourceHeight);
    const ppi = Math.round(
      Math.min(
        input.sourceWidth / (format.widthCm * CM_TO_INCHES),
        input.sourceHeight / (format.heightCm * CM_TO_INCHES),
      ),
    );
    return {
      posterFormatId: input.posterFormatId,
      targetDpi,
      targetWidth: target.width,
      targetHeight: target.height,
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      requiredScaleRaw,
      requiredScaleRounded,
      requestedScale: 1,
      predictedOutputWidth: input.sourceWidth,
      predictedOutputHeight: input.sourceHeight,
      predictedLongSide: long,
      effectivePpiAfterUpscale: ppi,
      clears300Ppi: targetDpi <= 300 ? ppi >= 300 : ppi >= targetDpi,
      exceedsMaxLongSide: long > maxLongSide,
      status: "already_ready",
      reason: "Corrected master already meets the target — no upscale needed.",
      warning: null,
      upscaleFamily,
      scalePrecision,
      maxLongSide,
      roundedScaleUp: false,
      noUpscaleNeeded: true,
    };
  }

  // Ceil up to safe provider precision so predicted output ≥ target.
  let requestedScale = ceilToSafePrecision(requiredScaleRaw, scalePrecision);
  // Guard against any floating-point shortfall on either axis.
  const step = Math.pow(10, -scalePrecision);
  let predW = Math.round(input.sourceWidth * requestedScale);
  let predH = Math.round(input.sourceHeight * requestedScale);
  let guard = 0;
  while ((predW < target.width || predH < target.height) && guard < 10) {
    requestedScale = Math.round((requestedScale + step) * Math.pow(10, scalePrecision)) /
      Math.pow(10, scalePrecision);
    predW = Math.round(input.sourceWidth * requestedScale);
    predH = Math.round(input.sourceHeight * requestedScale);
    guard++;
  }

  const predictedLongSide = Math.max(predW, predH);
  const effectivePpi = Math.round(
    Math.min(
      predW / (format.widthCm * CM_TO_INCHES),
      predH / (format.heightCm * CM_TO_INCHES),
    ),
  );
  const clears = predW >= target.width && predH >= target.height && effectivePpi >= targetDpi;
  const exceedsMax = predictedLongSide > maxLongSide;

  const roundedScaleUp = requestedScale > requiredScaleRaw + 1e-9;

  // Source too small for any dynamic-supported scale (>8× single-pass).
  // Both families share the 8× single-pass ceiling.
  if (requiredScaleRaw > REALESRGAN_DYNAMIC_MAX_SCALE) {
    return {
      posterFormatId: input.posterFormatId,
      targetDpi,
      targetWidth: target.width,
      targetHeight: target.height,
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      requiredScaleRaw,
      requiredScaleRounded,
      requestedScale: REALESRGAN_DYNAMIC_MAX_SCALE,
      predictedOutputWidth: Math.round(input.sourceWidth * REALESRGAN_DYNAMIC_MAX_SCALE),
      predictedOutputHeight: Math.round(input.sourceHeight * REALESRGAN_DYNAMIC_MAX_SCALE),
      predictedLongSide: Math.max(
        Math.round(input.sourceWidth * REALESRGAN_DYNAMIC_MAX_SCALE),
        Math.round(input.sourceHeight * REALESRGAN_DYNAMIC_MAX_SCALE),
      ),
      effectivePpiAfterUpscale: effectivePpi,
      clears300Ppi: false,
      exceedsMaxLongSide: exceedsMax,
      status: "source_too_small",
      reason: `Source is too small — required scale ${requiredScaleRaw.toFixed(3)}× exceeds the ${REALESRGAN_DYNAMIC_MAX_SCALE}× dynamic limit. Regenerate at a larger size for reliable 300 PPI at this format.`,
      warning: "Source too small for reliable 300 PPI at this print format.",
      upscaleFamily,
      scalePrecision,
      maxLongSide,
      roundedScaleUp: false,
      noUpscaleNeeded: false,
    };
  }

  // Predicted output exceeds the hard cap — block.
  if (exceedsMax) {
    return {
      posterFormatId: input.posterFormatId,
      targetDpi,
      targetWidth: target.width,
      targetHeight: target.height,
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      requiredScaleRaw,
      requiredScaleRounded,
      requestedScale,
      predictedOutputWidth: predW,
      predictedOutputHeight: predH,
      predictedLongSide,
      effectivePpiAfterUpscale: effectivePpi,
      clears300Ppi: clears,
      exceedsMaxLongSide: true,
      status: "output_too_large",
      reason: `Predicted output ${predW}×${predH} px exceeds the ${maxLongSide} px safety cap.`,
      warning: `Predicted output exceeds ${maxLongSide} px on the long side. Choose a smaller print format or regenerate at a different size.`,
      upscaleFamily,
      scalePrecision,
      maxLongSide,
      roundedScaleUp,
      noUpscaleNeeded: false,
    };
  }

  // Clarity dynamic decimal scale_factor IS supported on the async path.
  // Both families fall through to the regular recommended branch.

  // Real-ESRGAN can request scales in [2, 8]. Sub-2× still needs scale=2.
  // Clarity has no provider minimum, so we keep sub-2 scales there.
  if (
    upscaleFamily === "realesrgan" &&
    requestedScale < REALESRGAN_DYNAMIC_MIN_SCALE
  ) {
    const clampedScale = REALESRGAN_DYNAMIC_MIN_SCALE;
    const cpW = Math.round(input.sourceWidth * clampedScale);
    const cpH = Math.round(input.sourceHeight * clampedScale);
    const cpLong = Math.max(cpW, cpH);
    const cpPpi = Math.round(
      Math.min(
        cpW / (format.widthCm * CM_TO_INCHES),
        cpH / (format.heightCm * CM_TO_INCHES),
      ),
    );
    return {
      posterFormatId: input.posterFormatId,
      targetDpi,
      targetWidth: target.width,
      targetHeight: target.height,
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      requiredScaleRaw,
      requiredScaleRounded,
      requestedScale: clampedScale,
      predictedOutputWidth: cpW,
      predictedOutputHeight: cpH,
      predictedLongSide: cpLong,
      effectivePpiAfterUpscale: cpPpi,
      clears300Ppi: cpW >= target.width && cpH >= target.height && cpPpi >= targetDpi,
      exceedsMaxLongSide: cpLong > maxLongSide,
      status: cpLong > maxLongSide ? "output_too_large" : "dynamic_upscale_recommended",
      reason: `Required scale ${requiredScaleRaw.toFixed(3)}× is below the ${REALESRGAN_DYNAMIC_MIN_SCALE}× provider minimum — using ${clampedScale}× (output will be downsampled to exact print dimensions at export).`,
      warning: null,
      upscaleFamily,
      scalePrecision,
      maxLongSide,
      roundedScaleUp: true,
      noUpscaleNeeded: false,
    };
  }

  return {
    posterFormatId: input.posterFormatId,
    targetDpi,
    targetWidth: target.width,
    targetHeight: target.height,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    requiredScaleRaw,
    requiredScaleRounded,
    requestedScale,
    predictedOutputWidth: predW,
    predictedOutputHeight: predH,
    predictedLongSide,
    effectivePpiAfterUpscale: effectivePpi,
    clears300Ppi: clears,
    exceedsMaxLongSide: false,
    status: "dynamic_upscale_recommended",
    reason: `Dynamic ${upscaleFamily === "clarity" ? "Clarity" : "Real-ESRGAN"} ${requestedScale}× clears the ${target.width}×${target.height} target (≥ ${targetDpi} PPI at ${format.label}).`,
    warning: null,
    upscaleFamily,
    scalePrecision,
    maxLongSide,
    roundedScaleUp,
    noUpscaleNeeded: false,
  };
}
