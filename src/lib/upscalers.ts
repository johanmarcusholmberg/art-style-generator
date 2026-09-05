/**
 * Upscaler capability registry — one place that knows what each upscale
 * engine can actually accept, and the ONLY place input-pixel limits live.
 *
 * Deliberately separate from `src/lib/upscale-modes.ts`: modes describe the
 * *user-facing flows* (Recommended 300 PPI, Advanced manual …); upscalers
 * describe the *engines* and their hard/verified limits.
 *
 * A Deno mirror lives at `supabase/functions/_shared/upscalers.ts`.
 */

export type UpscalerId = "realesrgan_normal" | "realesrgan_large" | "clarity";
export type UpscalerFamily = "realesrgan" | "clarity";

export interface UpscalerEntry {
  id: UpscalerId;
  family: UpscalerFamily;
  label: string;
  description: string;
  /** Globally enabled. `false` always blocks — manual and Auto alike. */
  enabled: boolean;
  /**
   * Hard maximum input pixels the engine is known to accept.
   * `null` = no pixel-count block from this registry (the engine's own
   * safety checks still apply — e.g. Clarity tiles its input).
   */
  maxInputPixels: number | null;
  /**
   * Largest input size we have *actually observed* succeeding on this
   * engine. When `maxInputPixels` is null, this is used as the conservative
   * operational eligibility envelope for BOTH Auto and manual selection.
   * `null` = nothing verified yet.
   */
  verifiedInputPixels: number | null;
  /** Runs inside a single synchronous edge-function request. */
  synchronous: boolean;
  /** Accepts a decimal / dynamic scale factor (needed by the 300 PPI flow). */
  supportsDecimalScale: boolean;
  estimatedTime: string;
}

/**
 * Real-ESRGAN "Normal" ceiling. Replicate's default Real-ESRGAN worker
 * rejects inputs over ~2.1 MP (observed GPU error at 2_096_704 px); we
 * keep a margin so we block before the round-trip.
 *
 * This constant is the single source of truth — the old
 * `MAX_REALESRGAN_INPUT_PIXELS` in `generated-image-assets.ts` was removed
 * in favour of it.
 */
export const REALESRGAN_NORMAL_MAX_INPUT_PIXELS = 2_000_000;

export const UPSCALERS: Record<UpscalerId, UpscalerEntry> = {
  realesrgan_normal: {
    id: "realesrgan_normal",
    family: "realesrgan",
    label: "Real-ESRGAN (Normal)",
    description: "Standard Real-ESRGAN worker. Fast, reliable, ~2 MP input ceiling.",
    enabled: true,
    maxInputPixels: REALESRGAN_NORMAL_MAX_INPUT_PIXELS,
    verifiedInputPixels: REALESRGAN_NORMAL_MAX_INPUT_PIXELS,
    synchronous: true,
    supportsDecimalScale: true,
    estimatedTime: "~20–60s",
  },
  realesrgan_large: {
    id: "realesrgan_large",
    family: "realesrgan",
    label: "Real-ESRGAN (Large / A100)",
    description:
      "Real-ESRGAN pinned to a larger-GPU deployment for higher-resolution sources.",
    // DISABLED until the live A100 check passes. The check must prove, on a
    // pinned model version: (1) 1440×2016 @2× succeeds, (2) it returns
    // inside the synchronous edge-function budget, and (3) it accepts the
    // decimal/dynamic scale the 300 PPI flow needs (~4.11× for 50×70).
    // Only then flip `enabled` to true and set `verifiedInputPixels`.
    enabled: false,
    maxInputPixels: null,
    verifiedInputPixels: null,
    synchronous: true,
    supportsDecimalScale: true,
    estimatedTime: "~40–90s",
  },
  clarity: {
    id: "clarity",
    family: "clarity",
    label: "Clarity Upscaler (tiled)",
    description:
      "Tiled SDXL refinement. Slower and creative; runs on the async job route.",
    enabled: true,
    // Clarity tiles its input, so this registry imposes no pixel-count
    // block. The engine's own existing safety checks still apply.
    maxInputPixels: null,
    verifiedInputPixels: null,
    synchronous: false,
    supportsDecimalScale: true,
    estimatedTime: "~1–3 min",
  },
};

export const UPSCALER_IDS: UpscalerId[] = [
  "realesrgan_normal",
  "realesrgan_large",
  "clarity",
];

export function getUpscaler(id: UpscalerId): UpscalerEntry {
  return UPSCALERS[id];
}

/**
 * The operational input-pixel envelope for an engine:
 *   - a hard `maxInputPixels` when known;
 *   - otherwise the conservative `verifiedInputPixels` (applies to manual
 *     selection AND Auto — nothing above a verified input is allowed until
 *     a larger input has actually been verified);
 *   - `null` when the engine imposes no pixel-count block at all (Clarity).
 */
export function inputPixelEnvelope(entry: UpscalerEntry): number | null {
  if (entry.maxInputPixels !== null) return entry.maxInputPixels;
  if (entry.family === "clarity") return null;
  return entry.verifiedInputPixels;
}

/** True when the engine can accept a source of this pixel count. */
export function acceptsInputPixels(
  entry: UpscalerEntry,
  inputPixels: number,
): boolean {
  if (!entry.enabled) return false;
  const envelope = inputPixelEnvelope(entry);
  if (envelope === null) return true;
  return inputPixels <= envelope;
}
