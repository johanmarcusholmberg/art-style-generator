/**
 * Shared generation size options for 50×70 posters.
 *
 * ONE definition of the sizes a user may pick in the generator, keyed by
 * (provider, poster format). Both SDXL and OpenAI (gpt-image-2) expose the
 * exact same two 5:7 sizes:
 *
 *   - `small` 1200 × 1680
 *   - `large` 1440 × 2016  (recommended — the verified Large print-upscale
 *     route is verified for this input size)
 *
 * The dimensions come from `SDXL_SIZE_PRESETS` so there is a single source
 * of truth for the pixel values. Both are exact 5:7, multiples of 8 (SDXL)
 * AND multiples of 16 (required by gpt-image-2).
 *
 * There is deliberately NO "maximum" / 1600×2240 option: the generator must
 * never render a size the user cannot pick.
 */

import { SDXL_SIZE_PRESETS, type SdxlSizePreset } from "@/lib/sdxl-size-presets";

export type PosterSizeOptionId = SdxlSizePreset; // "small" | "large"
export type PosterSizeProvider = "sdxl" | "openai" | "gemini" | "auto";

export const POSTER_SIZE_OPTION_FORMAT_ID = "print_50x70";

export interface PosterSizeOption {
  id: PosterSizeOptionId;
  width: number;
  height: number;
  label: string;
  /** "1200×1680" */
  dimensionsLabel: string;
  /** "1200x1680" — the wire format OpenAI expects. */
  wireSize: string;
  recommended: boolean;
}

function optionFrom(id: PosterSizeOptionId, recommended: boolean): PosterSizeOption {
  const p = SDXL_SIZE_PRESETS[id];
  return {
    id,
    width: p.width,
    height: p.height,
    label: p.label,
    dimensionsLabel: `${p.width}×${p.height}`,
    wireSize: `${p.width}x${p.height}`,
    recommended,
  };
}

/** OpenAI 50×70: exactly two options, Large recommended. */
export const OPENAI_POSTER_SIZE_OPTIONS: PosterSizeOption[] = [
  optionFrom("small", false),
  optionFrom("large", true),
];

/** SDXL 50×70: unchanged behaviour — same two sizes, Small default. */
export const SDXL_POSTER_SIZE_OPTIONS: PosterSizeOption[] = [
  optionFrom("small", false),
  optionFrom("large", false),
];

const DEFAULTS: Record<string, PosterSizeOptionId> = {
  openai: "large",
  sdxl: "small",
};

export function posterSizeOptionsApply(
  provider: string | null | undefined,
  formatId: string | null | undefined,
): boolean {
  return (
    (provider === "openai" || provider === "sdxl") &&
    formatId === POSTER_SIZE_OPTION_FORMAT_ID
  );
}

export function getPosterSizeOptions(
  provider: string | null | undefined,
  formatId: string | null | undefined,
): PosterSizeOption[] {
  if (!posterSizeOptionsApply(provider, formatId)) return [];
  return provider === "openai" ? OPENAI_POSTER_SIZE_OPTIONS : SDXL_POSTER_SIZE_OPTIONS;
}

export function defaultPosterSizeOption(
  provider: string | null | undefined,
): PosterSizeOptionId {
  return DEFAULTS[provider ?? ""] ?? "small";
}

export function isPosterSizeOptionId(v: unknown): v is PosterSizeOptionId {
  return v === "small" || v === "large";
}

/**
 * Wire size ("WxH") for the OpenAI generation route. Only the two allowed
 * sizes can ever be produced — no substitution, no 1600x2240.
 */
export function openaiPosterWireSize(id: PosterSizeOptionId): string {
  return optionFrom(id, false).wireSize;
}

export const OPENAI_ALLOWED_POSTER_WIRE_SIZES: string[] =
  OPENAI_POSTER_SIZE_OPTIONS.map((o) => o.wireSize);

export function isAllowedOpenAIPosterWireSize(size: string): boolean {
  return OPENAI_ALLOWED_POSTER_WIRE_SIZES.includes(size);
}
