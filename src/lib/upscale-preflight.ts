/**
 * Upscale preflight — decides, from the ACTUAL pixels of the source we are
 * about to send (i.e. the corrected poster master, not the pre-correction
 * image), whether a given upscaler can run.
 *
 * Rules:
 *   - No silent downscaling and no silent engine substitution in this flow.
 *     A manual selection either runs as chosen or is blocked with a reason.
 *   - Auto routes: Normal if it fits → verified Large if it fits →
 *     explicitly UNAVAILABLE. Auto never falls back to Clarity.
 *
 * A Deno mirror lives at `supabase/functions/_shared/upscale-preflight.ts`.
 */

import {
  UPSCALERS,
  acceptsInputPixels,
  inputPixelEnvelope,
  type UpscalerEntry,
  type UpscalerId,
} from "@/lib/upscalers";

/** Hard-cap on the longer side of any upscale output (px). */
export const MAX_OUTPUT_LONG_EDGE = 12_288;

export type PreflightCode =
  | "ok"
  | "unknown_source_dimensions"
  | "invalid_scale"
  | "upscaler_disabled"
  | "input_too_large"
  | "output_too_large"
  | "no_eligible_upscaler";

export interface UpscalePreflightInput {
  /** Actual width of the bytes we will send (corrected master). */
  sourceWidth: number | null | undefined;
  sourceHeight: number | null | undefined;
  /** Scale factor we intend to request (may be decimal). */
  scale: number;
  /** Engine to check. Omit to run Auto selection. */
  upscalerId?: UpscalerId | null;
  maxOutputLongEdge?: number;
}

export interface UpscalePreflightResult {
  ok: boolean;
  code: PreflightCode;
  /** Engine that may run (null when blocked). */
  upscalerId: UpscalerId | null;
  /** Plain-language reason, safe to show in the dialog. */
  reason: string | null;
  inputPixels: number | null;
  inputMegapixels: number | null;
  /** Envelope applied to the checked engine (null = no pixel-count block). */
  envelopePixels: number | null;
  outputWidth: number | null;
  outputHeight: number | null;
  outputLongEdge: number | null;
  /** True when Auto picked the engine rather than the caller. */
  autoSelected: boolean;
}

function mp(px: number): number {
  return Math.round((px / 1_000_000) * 100) / 100;
}

function outputFor(w: number, h: number, scale: number) {
  const outputWidth = Math.round(w * scale);
  const outputHeight = Math.round(h * scale);
  return {
    outputWidth,
    outputHeight,
    outputLongEdge: Math.max(outputWidth, outputHeight),
  };
}

/**
 * Auto engine selection from actual input pixels.
 * Normal → verified Large → unavailable. Never Clarity.
 */
export function selectAutoUpscaler(inputPixels: number): {
  upscalerId: UpscalerId | null;
  reason: string | null;
} {
  const normal = UPSCALERS.realesrgan_normal;
  if (acceptsInputPixels(normal, inputPixels)) {
    return { upscalerId: "realesrgan_normal", reason: null };
  }
  const large = UPSCALERS.realesrgan_large;
  if (acceptsInputPixels(large, inputPixels)) {
    return { upscalerId: "realesrgan_large", reason: null };
  }
  const largeEnvelope = inputPixelEnvelope(large);
  return {
    upscalerId: null,
    reason: large.enabled
      ? `No upscaler is available for a ${mp(inputPixels)} MP source. The largest verified input is ${
          largeEnvelope ? `${mp(largeEnvelope)} MP` : "not established yet"
        }.`
      : `No upscaler is available for a ${mp(
          inputPixels,
        )} MP source. Real-ESRGAN Large is not verified yet, and the Normal engine tops out at ${mp(
          inputPixelEnvelope(normal) ?? 0,
        )} MP.`,
  };
}

function blockedFor(
  entry: UpscalerEntry,
  inputPixels: number,
): { code: PreflightCode; reason: string } | null {
  if (!entry.enabled) {
    return {
      code: "upscaler_disabled",
      reason: `${entry.label} is not available yet — it stays disabled until it has been verified on a real run.`,
    };
  }
  const envelope = inputPixelEnvelope(entry);
  if (envelope !== null && inputPixels > envelope) {
    return {
      code: "input_too_large",
      reason: `${entry.label} accepts up to ${mp(envelope)} MP of input; this source is ${mp(
        inputPixels,
      )} MP. Use a smaller source or a different upscaler.`,
    };
  }
  return null;
}

export function preflightUpscale(
  input: UpscalePreflightInput,
): UpscalePreflightResult {
  const { sourceWidth, sourceHeight, scale, upscalerId } = input;
  const maxLong = input.maxOutputLongEdge ?? MAX_OUTPUT_LONG_EDGE;

  const base: UpscalePreflightResult = {
    ok: false,
    code: "ok",
    upscalerId: upscalerId ?? null,
    reason: null,
    inputPixels: null,
    inputMegapixels: null,
    envelopePixels: null,
    outputWidth: null,
    outputHeight: null,
    outputLongEdge: null,
    autoSelected: !upscalerId,
  };

  if (
    !sourceWidth ||
    !sourceHeight ||
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight)
  ) {
    return {
      ...base,
      code: "unknown_source_dimensions",
      reason:
        "Source dimensions are unknown, so this upscale can't be checked against the engine limits.",
    };
  }
  if (!Number.isFinite(scale) || scale <= 1) {
    return {
      ...base,
      code: "invalid_scale",
      reason: "Upscale scale must be greater than 1.",
    };
  }

  const inputPixels = sourceWidth * sourceHeight;
  const out = outputFor(sourceWidth, sourceHeight, scale);

  // Resolve engine (manual or Auto).
  let resolvedId: UpscalerId | null = upscalerId ?? null;
  let autoSelected = false;
  if (!resolvedId) {
    autoSelected = true;
    const auto = selectAutoUpscaler(inputPixels);
    if (!auto.upscalerId) {
      return {
        ...base,
        ...out,
        code: "no_eligible_upscaler",
        inputPixels,
        inputMegapixels: mp(inputPixels),
        reason: auto.reason,
        autoSelected: true,
      };
    }
    resolvedId = auto.upscalerId;
  }

  const entry = UPSCALERS[resolvedId];
  const envelopePixels = inputPixelEnvelope(entry);
  const common = {
    ...base,
    ...out,
    upscalerId: resolvedId,
    inputPixels,
    inputMegapixels: mp(inputPixels),
    envelopePixels,
    autoSelected,
  };

  const blocked = blockedFor(entry, inputPixels);
  if (blocked) return { ...common, ok: false, ...blocked };

  if (out.outputLongEdge > maxLong) {
    return {
      ...common,
      ok: false,
      code: "output_too_large",
      reason: `The result would be ${out.outputLongEdge.toLocaleString()} px on the long edge, past the ${maxLong.toLocaleString()} px safety limit.`,
    };
  }

  return { ...common, ok: true, code: "ok", reason: null };
}
