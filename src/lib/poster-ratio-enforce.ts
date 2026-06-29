/**
 * Poster-ratio enforcement.
 *
 * Root cause: providers (Gemini in particular) frequently return an image
 * whose aspect ratio drifts away from the selected poster format — e.g.
 * a 50×70 (5:7) request comes back as 1094×1606 (~2:3). We must NOT save
 * that as the master, because the asset shape is wrong and downstream
 * PPI / print / upscale logic compounds the drift.
 *
 * This module:
 *   1. Provides a pure planner (`planPosterRatioCorrection`) that decides
 *      whether a source w/h matches the poster format's target ratio, and
 *      if not, computes the minimum pad needed to reach it. Per project
 *      memory we never crop artwork for print/framing — we pad with a
 *      neutral background.
 *   2. Provides a browser-only executor (`enforcePosterRatio`) that
 *      loads the provider's image, applies the plan via canvas, uploads
 *      the corrected PNG to the same `generated-images` bucket, and
 *      returns the new URL + dimensions.
 *
 * The pure planner is the only piece that needs unit tests; the executor
 * is a thin DOM/Supabase wrapper.
 */

import { supabase } from "@/integrations/supabase/client";
import { getPrintFormat } from "@/lib/print-formats";

/** Aspect-ratio tolerance — anything inside this band is considered exact. */
export const POSTER_RATIO_TOLERANCE = 0.005;

export interface PosterRatioPlan {
  /** "none" when the source already matches within tolerance. */
  method: "none" | "pad" | "crop";
  sourceWidth: number;
  sourceHeight: number;
  /** Final canvas dimensions after the plan is applied. */
  outputWidth: number;
  outputHeight: number;
  /** Padding offsets (top/left). When method != "pad" both are 0. */
  padLeft: number;
  padTop: number;
  /** Crop offsets (top/left). When method != "crop" both are 0. */
  cropLeft: number;
  cropTop: number;
  /** Target ratio (width / height) requested by the poster format. */
  targetRatio: number;
  /** Source ratio prior to correction. */
  sourceRatio: number;
  /** Ratio error magnitude relative to target ( |s-t| / t ). */
  ratioError: number;
}

export type RatioCorrectionMode = "pad" | "crop";

/**
 * Decide how to correct an image so its aspect ratio matches the poster
 * format's target. Default mode is "pad" (preserves the entire image, adds
 * neutral background to the short axis). Mode "crop" centre-crops the
 * long axis to reach the exact ratio — used when the provider was asked
 * for exact pixel dims and any drift is small + safe to trim.
 */
export function planPosterRatioCorrection(
  sourceWidth: number,
  sourceHeight: number,
  formatId: string,
  mode: RatioCorrectionMode = "pad",
): PosterRatioPlan | null {
  const fmt = getPrintFormat(formatId);
  if (!fmt) return null;
  if (sourceWidth <= 0 || sourceHeight <= 0) return null;

  const target = fmt.aspectRatioDecimal;
  const source = sourceWidth / sourceHeight;
  const ratioError = Math.abs(source - target) / target;

  if (ratioError <= POSTER_RATIO_TOLERANCE) {
    return {
      method: "none",
      sourceWidth,
      sourceHeight,
      outputWidth: sourceWidth,
      outputHeight: sourceHeight,
      padLeft: 0,
      padTop: 0,
      cropLeft: 0,
      cropTop: 0,
      targetRatio: target,
      sourceRatio: source,
      ratioError,
    };
  }

  if (mode === "crop") {
    let outputWidth: number;
    let outputHeight: number;
    if (source > target) {
      // Image is wider than target → crop horizontally to match.
      outputHeight = sourceHeight;
      outputWidth = Math.round(sourceHeight * target);
    } else {
      // Image is taller than target → crop vertically to match.
      outputWidth = sourceWidth;
      outputHeight = Math.round(sourceWidth / target);
    }
    const cropLeft = Math.round((sourceWidth - outputWidth) / 2);
    const cropTop = Math.round((sourceHeight - outputHeight) / 2);
    return {
      method: "crop",
      sourceWidth,
      sourceHeight,
      outputWidth,
      outputHeight,
      padLeft: 0,
      padTop: 0,
      cropLeft,
      cropTop,
      targetRatio: target,
      sourceRatio: source,
      ratioError,
    };
  }

  let outputWidth: number;
  let outputHeight: number;
  if (source > target) {
    // Image is wider than target → add vertical padding to extend height.
    outputWidth = sourceWidth;
    outputHeight = Math.round(sourceWidth / target);
  } else {
    // Image is taller (or narrower) than target → add horizontal padding.
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
    padLeft,
    padTop,
    cropLeft: 0,
    cropTop: 0,
    targetRatio: target,
    sourceRatio: source,
    ratioError,
  };
}

export interface PosterRatioEnforcementResult {
  url: string;
  width: number;
  height: number;
  corrected: boolean;
  plan: PosterRatioPlan;
}

/** Browser-only: load an image URL into an HTMLImageElement (CORS safe). */
async function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image for ratio enforcement: ${String(e)}`));
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      type,
    );
  });
}

/**
 * Enforce the poster format ratio on a freshly generated image. When the
 * provider returned an off-ratio asset, this corrects it to the exact
 * ratio (padded by default; cropped when `mode: "crop"` is passed) and
 * uploads the corrected PNG. Returns the original URL untouched when the
 * image already matches within tolerance.
 */
export async function enforcePosterRatio(input: {
  imageUrl: string;
  formatId: string;
  /** Background color used for padding (defaults to white). Ignored when mode="crop". */
  background?: string;
  /** "pad" (default) preserves the entire image; "crop" trims the long axis. */
  mode?: RatioCorrectionMode;
}): Promise<PosterRatioEnforcementResult | null> {
  const fmt = getPrintFormat(input.formatId);
  if (!fmt) return null;

  const img = await loadImageElement(input.imageUrl);
  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;

  const mode: RatioCorrectionMode = input.mode ?? "pad";
  const plan = planPosterRatioCorrection(sourceWidth, sourceHeight, input.formatId, mode);
  if (!plan) return null;

  if (plan.method === "none") {
    return {
      url: input.imageUrl,
      width: sourceWidth,
      height: sourceHeight,
      corrected: false,
      plan,
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = plan.outputWidth;
  canvas.height = plan.outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  if (plan.method === "pad") {
    ctx.fillStyle = input.background ?? "#FFFFFF";
    ctx.fillRect(0, 0, plan.outputWidth, plan.outputHeight);
    ctx.drawImage(img, plan.padLeft, plan.padTop, sourceWidth, sourceHeight);
  } else {
    // crop: draw the cropped region into a canvas of the target size.
    ctx.drawImage(
      img,
      plan.cropLeft,
      plan.cropTop,
      plan.outputWidth,
      plan.outputHeight,
      0,
      0,
      plan.outputWidth,
      plan.outputHeight,
    );
  }

  const blob = await canvasToBlob(canvas, "image/png");
  const filename = `normalized-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const { error } = await supabase.storage
    .from("generated-images")
    .upload(filename, blob, { contentType: "image/png" });
  if (error) throw error;
  const { data: urlData } = supabase.storage
    .from("generated-images")
    .getPublicUrl(filename);

  console.log(
    `[poster-ratio-enforce] formatId=${input.formatId} source=${sourceWidth}x${sourceHeight} ` +
      `target=${plan.outputWidth}x${plan.outputHeight} method=${plan.method} ` +
      `ratioError=${plan.ratioError.toFixed(4)}`,
  );

  return {
    url: urlData.publicUrl,
    width: plan.outputWidth,
    height: plan.outputHeight,
    corrected: true,
    plan,
  };
}
