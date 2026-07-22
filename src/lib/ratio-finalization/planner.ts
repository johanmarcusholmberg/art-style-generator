/**
 * planPosterRatioFinalization — canonical ratio planner.
 *
 * Wraps the existing `planPosterRatioCorrection` behavior in a shape
 * the durable finalizer can consume directly (source rect + explicit
 * padding + algorithm version). Behavior parity with the existing
 * generator planner is enforced by `planner.test.ts` (co-fixtures).
 *
 * This module has ZERO I/O and no dependency on Supabase or the DOM.
 */

import { POSTER_RATIO_TOLERANCE } from "@/lib/poster-ratio-enforce";
import { parseRatio } from "@/lib/ratio-normalization";

export const RATIO_FINALIZATION_ALGORITHM_VERSION = "v1";

export type RatioFinalizationOperation = "none" | "crop" | "pad";
export type RatioFinalizationPolicy = "pad" | "crop";

export interface RatioFinalizationSourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RatioFinalizationPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface RatioFinalizationPlan {
  operation: RatioFinalizationOperation;
  sourceRect: RatioFinalizationSourceRect;
  outputWidth: number;
  outputHeight: number;
  padding: RatioFinalizationPadding | null;
  targetAspectRatio: number;
  algorithmVersion: string;
}

export interface PlanInput {
  sourceWidth: number;
  sourceHeight: number;
  /** Target aspect ratio as either a string ("5:7") or decimal (width/height). */
  targetAspectRatio: string | number;
  policy: RatioFinalizationPolicy;
}

export class RatioFinalizationPlanError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ?? code);
    this.name = "RatioFinalizationPlanError";
  }
}

function resolveTarget(target: string | number): number {
  if (typeof target === "number") {
    if (!Number.isFinite(target) || target <= 0) {
      throw new RatioFinalizationPlanError("invalid_target_ratio");
    }
    return target;
  }
  if (typeof target !== "string" || target.trim() === "") {
    throw new RatioFinalizationPlanError("invalid_target_ratio");
  }
  const parsed = parseRatio(target);
  // parseRatio falls back to 1 when malformed — catch obvious errors.
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new RatioFinalizationPlanError("invalid_target_ratio");
  }
  // Reject strings that don't contain a colon and aren't numeric (parseRatio would silently return 1)
  if (!target.includes(":")) {
    const numeric = Number(target);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new RatioFinalizationPlanError("invalid_target_ratio");
    }
    return numeric;
  }
  return parsed;
}

export function planPosterRatioFinalization(input: PlanInput): RatioFinalizationPlan {
  const { sourceWidth, sourceHeight, policy } = input;
  if (
    !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)
    || sourceWidth <= 0 || sourceHeight <= 0
  ) {
    throw new RatioFinalizationPlanError("invalid_source_dimensions");
  }
  if (policy !== "pad" && policy !== "crop") {
    throw new RatioFinalizationPlanError("invalid_policy");
  }
  const target = resolveTarget(input.targetAspectRatio);
  const source = sourceWidth / sourceHeight;
  const ratioError = Math.abs(source - target) / target;

  if (ratioError <= POSTER_RATIO_TOLERANCE) {
    return {
      operation: "none",
      sourceRect: { x: 0, y: 0, width: sourceWidth, height: sourceHeight },
      outputWidth: sourceWidth,
      outputHeight: sourceHeight,
      padding: null,
      targetAspectRatio: target,
      algorithmVersion: RATIO_FINALIZATION_ALGORITHM_VERSION,
    };
  }

  if (policy === "crop") {
    // Retain maximum native area: keep the long axis, trim the other.
    let cropW: number;
    let cropH: number;
    if (source > target) {
      cropH = sourceHeight;
      cropW = Math.round(sourceHeight * target);
    } else {
      cropW = sourceWidth;
      cropH = Math.round(sourceWidth / target);
    }
    const cropX = Math.round((sourceWidth - cropW) / 2);
    const cropY = Math.round((sourceHeight - cropH) / 2);
    return {
      operation: "crop",
      sourceRect: { x: cropX, y: cropY, width: cropW, height: cropH },
      outputWidth: cropW,
      outputHeight: cropH,
      padding: null,
      targetAspectRatio: target,
      algorithmVersion: RATIO_FINALIZATION_ALGORITHM_VERSION,
    };
  }

  // Pad: extend the short axis symmetrically. Never upscale, never distort.
  let outW: number;
  let outH: number;
  if (source > target) {
    outW = sourceWidth;
    outH = Math.round(sourceWidth / target);
  } else {
    outH = sourceHeight;
    outW = Math.round(sourceHeight * target);
  }
  const padLeft = Math.round((outW - sourceWidth) / 2);
  const padTop = Math.round((outH - sourceHeight) / 2);
  const padRight = outW - sourceWidth - padLeft;
  const padBottom = outH - sourceHeight - padTop;

  return {
    operation: "pad",
    sourceRect: { x: 0, y: 0, width: sourceWidth, height: sourceHeight },
    outputWidth: outW,
    outputHeight: outH,
    padding: { top: padTop, right: padRight, bottom: padBottom, left: padLeft },
    targetAspectRatio: target,
    algorithmVersion: RATIO_FINALIZATION_ALGORITHM_VERSION,
  };
}

/** Validate that (w/h) matches target within tolerance. */
export function ratioMatchesTarget(width: number, height: number, target: number): boolean {
  if (!(width > 0) || !(height > 0) || !(target > 0)) return false;
  return Math.abs(width / height - target) / target <= POSTER_RATIO_TOLERANCE;
}
