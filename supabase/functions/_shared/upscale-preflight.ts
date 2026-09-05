/**
 * Deno mirror of `src/lib/upscale-preflight.ts` (server-side guard so an
 * edge function never calls a provider with an out-of-envelope input).
 */

import {
  UPSCALERS,
  acceptsInputPixels,
  inputPixelEnvelope,
  type UpscalerId,
} from "./upscalers.ts";

export const MAX_OUTPUT_LONG_EDGE = 12_288;

export type PreflightCode =
  | "ok"
  | "unknown_source_dimensions"
  | "invalid_scale"
  | "upscaler_disabled"
  | "input_too_large"
  | "output_too_large"
  | "no_eligible_upscaler";

export interface UpscalePreflightResult {
  ok: boolean;
  code: PreflightCode;
  upscalerId: UpscalerId | null;
  reason: string | null;
  inputPixels: number | null;
  envelopePixels: number | null;
  outputLongEdge: number | null;
}

function mp(px: number): number {
  return Math.round((px / 1_000_000) * 100) / 100;
}

export function selectAutoUpscaler(inputPixels: number): UpscalerId | null {
  if (acceptsInputPixels(UPSCALERS.realesrgan_normal, inputPixels)) {
    return "realesrgan_normal";
  }
  if (acceptsInputPixels(UPSCALERS.realesrgan_large, inputPixels)) {
    return "realesrgan_large";
  }
  return null;
}

export function preflightUpscale(input: {
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  scale: number;
  upscalerId?: UpscalerId | null;
  maxOutputLongEdge?: number;
}): UpscalePreflightResult {
  const maxLong = input.maxOutputLongEdge ?? MAX_OUTPUT_LONG_EDGE;
  const w = input.sourceWidth;
  const h = input.sourceHeight;

  if (!w || !h || !Number.isFinite(w) || !Number.isFinite(h)) {
    return {
      ok: false,
      code: "unknown_source_dimensions",
      upscalerId: input.upscalerId ?? null,
      reason: "Source dimensions are unknown — cannot preflight the upscale.",
      inputPixels: null,
      envelopePixels: null,
      outputLongEdge: null,
    };
  }
  if (!Number.isFinite(input.scale) || input.scale <= 1) {
    return {
      ok: false,
      code: "invalid_scale",
      upscalerId: input.upscalerId ?? null,
      reason: "Upscale scale must be greater than 1.",
      inputPixels: w * h,
      envelopePixels: null,
      outputLongEdge: null,
    };
  }

  const inputPixels = w * h;
  const outputLongEdge = Math.round(Math.max(w, h) * input.scale);

  let id = input.upscalerId ?? null;
  if (!id) {
    id = selectAutoUpscaler(inputPixels);
    if (!id) {
      return {
        ok: false,
        code: "no_eligible_upscaler",
        upscalerId: null,
        reason: `No upscaler is available for a ${mp(inputPixels)} MP source.`,
        inputPixels,
        envelopePixels: null,
        outputLongEdge,
      };
    }
  }

  const entry = UPSCALERS[id];
  const envelopePixels = inputPixelEnvelope(entry);

  if (!entry.enabled) {
    return {
      ok: false,
      code: "upscaler_disabled",
      upscalerId: id,
      reason: `${entry.label} is disabled until it has been verified.`,
      inputPixels,
      envelopePixels,
      outputLongEdge,
    };
  }
  if (envelopePixels !== null && inputPixels > envelopePixels) {
    return {
      ok: false,
      code: "input_too_large",
      upscalerId: id,
      reason: `${entry.label} accepts up to ${mp(envelopePixels)} MP; source is ${mp(inputPixels)} MP.`,
      inputPixels,
      envelopePixels,
      outputLongEdge,
    };
  }
  if (outputLongEdge > maxLong) {
    return {
      ok: false,
      code: "output_too_large",
      upscalerId: id,
      reason: `Output long edge ${outputLongEdge}px exceeds the ${maxLong}px safety cap.`,
      inputPixels,
      envelopePixels,
      outputLongEdge,
    };
  }

  return {
    ok: true,
    code: "ok",
    upscalerId: id,
    reason: null,
    inputPixels,
    envelopePixels,
    outputLongEdge,
  };
}
