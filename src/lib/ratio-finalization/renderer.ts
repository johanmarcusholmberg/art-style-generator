/**
 * renderPosterRatioFinalization — canonical Canvas renderer.
 *
 * Browser-only. Applies a plan produced by `planPosterRatioFinalization`
 * to a decoded image and returns a PNG Blob at the planned output dims.
 *
 * Never sharpens, upscales, or alters color. Ratio math is NOT re-derived
 * inside the renderer — the plan is authoritative.
 */

import type { RatioFinalizationPlan } from "./planner";

export type RendererImageSource =
  | HTMLImageElement
  | ImageBitmap
  | HTMLCanvasElement
  | OffscreenCanvas;

export interface RenderPosterRatioFinalizationInput {
  source: RendererImageSource;
  plan: RatioFinalizationPlan;
  /** Background used for padding regions (defaults to white). Ignored for crop / none. */
  backgroundStyle?: string;
}

export interface RenderPosterRatioFinalizationResult {
  blob: Blob;
  width: number;
  height: number;
  mimeType: "image/png";
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas_to_blob_failed"))),
      type,
    );
  });
}

export async function renderPosterRatioFinalization(
  input: RenderPosterRatioFinalizationInput,
): Promise<RenderPosterRatioFinalizationResult> {
  const { source, plan } = input;
  if (plan.operation === "none") {
    throw new Error("renderer_should_not_be_called_for_operation_none");
  }

  const canvas = document.createElement("canvas");
  canvas.width = plan.outputWidth;
  canvas.height = plan.outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_2d_context_unavailable");

  if (plan.operation === "pad") {
    ctx.fillStyle = input.backgroundStyle ?? "#FFFFFF";
    ctx.fillRect(0, 0, plan.outputWidth, plan.outputHeight);
    const pad = plan.padding!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx.drawImage(source as any, pad.left, pad.top, plan.sourceRect.width, plan.sourceRect.height);
  } else {
    // crop
    ctx.drawImage(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      source as any,
      plan.sourceRect.x, plan.sourceRect.y,
      plan.sourceRect.width, plan.sourceRect.height,
      0, 0,
      plan.outputWidth, plan.outputHeight,
    );
  }

  const blob = await canvasToBlob(canvas, "image/png");

  // Release backing memory before returning.
  canvas.width = 0;
  canvas.height = 0;

  return { blob, width: plan.outputWidth, height: plan.outputHeight, mimeType: "image/png" };
}
