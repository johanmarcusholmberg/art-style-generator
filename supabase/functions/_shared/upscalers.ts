/**
 * Deno mirror of `src/lib/upscalers.ts`. Keep in lockstep — the parity test
 * in `src/lib/upscalers.test.ts` asserts the registry values match.
 */

export type UpscalerId = "realesrgan_normal" | "realesrgan_large" | "clarity";
export type UpscalerFamily = "realesrgan" | "clarity";

export interface UpscalerEntry {
  id: UpscalerId;
  family: UpscalerFamily;
  label: string;
  enabled: boolean;
  maxInputPixels: number | null;
  verifiedInputPixels: number | null;
  synchronous: boolean;
  supportsDecimalScale: boolean;
}

export const REALESRGAN_NORMAL_MAX_INPUT_PIXELS = 2_000_000;

export const UPSCALERS: Record<UpscalerId, UpscalerEntry> = {
  realesrgan_normal: {
    id: "realesrgan_normal",
    family: "realesrgan",
    label: "Real-ESRGAN (Normal)",
    enabled: true,
    maxInputPixels: REALESRGAN_NORMAL_MAX_INPUT_PIXELS,
    verifiedInputPixels: REALESRGAN_NORMAL_MAX_INPUT_PIXELS,
    synchronous: true,
    supportsDecimalScale: true,
  },
  realesrgan_large: {
    // DISABLED until the live A100 check passes (2× at 1440×2016, inside the
    // synchronous budget, with decimal/dynamic scale support).
    id: "realesrgan_large",
    family: "realesrgan",
    label: "Real-ESRGAN (Large / A100)",
    enabled: false,
    maxInputPixels: null,
    verifiedInputPixels: null,
    synchronous: true,
    supportsDecimalScale: true,
  },
  clarity: {
    id: "clarity",
    family: "clarity",
    label: "Clarity Upscaler (tiled)",
    enabled: true,
    maxInputPixels: null,
    verifiedInputPixels: null,
    synchronous: false,
    supportsDecimalScale: true,
  },
};

export function inputPixelEnvelope(entry: UpscalerEntry): number | null {
  if (entry.maxInputPixels !== null) return entry.maxInputPixels;
  if (entry.family === "clarity") return null;
  return entry.verifiedInputPixels;
}

export function acceptsInputPixels(
  entry: UpscalerEntry,
  inputPixels: number,
): boolean {
  if (!entry.enabled) return false;
  const envelope = inputPixelEnvelope(entry);
  if (envelope === null) return true;
  return inputPixels <= envelope;
}
