/**
 * SDXL size presets (exact 5:7, 50×70 only) + the ONE shared size resolver.
 *
 * Two opinionated generation sizes for SDXL when the user has explicitly
 * selected SDXL *and* the 50×70 poster format:
 *
 *   - `small` 1200 × 1680 (2.02 MP) — stays inside the Normal Real-ESRGAN
 *     input envelope, so the standard upscale route always works.
 *   - `large` 1440 × 2016 (2.90 MP) — higher-detail source; needs an
 *     upscaler that accepts larger inputs.
 *
 * Both are exact 5:7 (`w * 7 === h * 5`) and multiples of 8, and both fit
 * inside the existing 2048-per-axis SDXL clamp (deliberately unchanged).
 *
 * A Deno mirror lives at `supabase/functions/_shared/sdxl-size-presets.ts`.
 * A parity test keeps the two files in sync.
 */

export type SdxlSizePreset = "small" | "large";

export interface SdxlSizePresetEntry {
  id: SdxlSizePreset;
  width: number;
  height: number;
  label: string;
  description: string;
  megapixels: number;
}

export const SDXL_SIZE_PRESET_FORMAT_ID = "print_50x70";

export const SDXL_SIZE_PRESETS: Record<SdxlSizePreset, SdxlSizePresetEntry> = {
  small: {
    id: "small",
    width: 1200,
    height: 1680,
    label: "Small — Normal upscale",
    description: "Optimized for Normal Real-ESRGAN.",
    megapixels: (1200 * 1680) / 1_000_000,
  },
  large: {
    id: "large",
    width: 1440,
    height: 2016,
    label: "Large — High detail",
    description:
      "Higher-detail source. Requires an upscaler that supports larger images.",
    megapixels: (1440 * 2016) / 1_000_000,
  },
};

export const DEFAULT_SDXL_SIZE_PRESET: SdxlSizePreset = "small";

export function isSdxlSizePreset(v: unknown): v is SdxlSizePreset {
  return v === "small" || v === "large";
}

/** Exactness rule asserted in tests: 5:7 and multiples of 8. */
export function isExactFiveBySeven(width: number, height: number): boolean {
  return width * 7 === height * 5 && width % 8 === 0 && height % 8 === 0;
}

// ── The one shared resolver ──────────────────────────────────────────────

export type SdxlSizeSource =
  | "sdxl_preset_small"
  | "sdxl_preset_large"
  | "override"
  | string;

export interface ResolveSdxlSizeInput {
  /** Preset the user picked (may be stale — `presetAllowed` gates it). */
  preset?: SdxlSizePreset | null;
  /**
   * Explicit eligibility flag. TRUE only when the user explicitly selected
   * SDXL (`providerPreference === "sdxl"`). Never inferred in here, so a
   * hidden/stale Large state can't leak into an Auto or non-SDXL run.
   */
  presetAllowed?: boolean;
  posterFormatId?: string | null;
  requestedWidth?: number | null;
  requestedHeight?: number | null;
  /** Target format ratio (w/h) used to recompute exactness for overrides. */
  targetRatio?: number | null;
  /** Result of the runtime's existing sizing resolver (last-resort). */
  fallback: { width: number; height: number; source: string; exact: boolean };
}

export interface ResolvedSdxlSize {
  width: number;
  height: number;
  sizeSource: SdxlSizeSource;
  preset: SdxlSizePreset | null;
  exact: boolean;
  adjusted: boolean;
}

const RATIO_TOLERANCE = 0.005;

function overrideIsValid(w?: number | null, h?: number | null): boolean {
  return (
    typeof w === "number" &&
    typeof h === "number" &&
    Number.isFinite(w) &&
    Number.isFinite(h) &&
    w >= 256 &&
    w <= 2048 &&
    h >= 256 &&
    h <= 2048 &&
    w % 8 === 0 &&
    h % 8 === 0
  );
}

/**
 * Precedence (single implementation, mirrored for Deno):
 *   1. valid preset (allowed + 50×70 + exact 5:7 geometry)
 *   2. explicit requestedWidth/requestedHeight (existing clamp rules)
 *   3. the runtime's existing resolver result
 */
export function resolveSdxlRequestSize(
  input: ResolveSdxlSizeInput,
): ResolvedSdxlSize {
  const {
    preset,
    presetAllowed,
    posterFormatId,
    requestedWidth,
    requestedHeight,
    targetRatio,
    fallback,
  } = input;

  // 1 — preset
  if (
    presetAllowed === true &&
    isSdxlSizePreset(preset) &&
    posterFormatId === SDXL_SIZE_PRESET_FORMAT_ID
  ) {
    const entry = SDXL_SIZE_PRESETS[preset];
    if (isExactFiveBySeven(entry.width, entry.height)) {
      return {
        width: entry.width,
        height: entry.height,
        sizeSource:
          preset === "large" ? "sdxl_preset_large" : "sdxl_preset_small",
        preset,
        exact: true,
        adjusted: false,
      };
    }
  }

  // 2 — explicit override. Exactness is RECOMPUTED from what we actually
  // send, never inherited from the discarded fallback result.
  if (overrideIsValid(requestedWidth, requestedHeight)) {
    const w = requestedWidth as number;
    const h = requestedHeight as number;
    const exact =
      typeof targetRatio === "number" && targetRatio > 0
        ? Math.abs(w / h - targetRatio) / targetRatio <= RATIO_TOLERANCE
        : false;
    return {
      width: w,
      height: h,
      sizeSource: "override",
      preset: null,
      exact,
      adjusted: !exact,
    };
  }

  // 3 — existing resolver
  return {
    width: fallback.width,
    height: fallback.height,
    sizeSource: fallback.source,
    preset: null,
    exact: fallback.exact,
    adjusted: !fallback.exact,
  };
}

/**
 * True when a preset selector should be shown / honoured at all.
 * Explicit SDXL + the 50×70 format. Anything else keeps today's sizing.
 */
export function sdxlPresetApplies(
  providerPreference: string | null | undefined,
  posterFormatId: string | null | undefined,
): boolean {
  return (
    providerPreference === "sdxl" &&
    posterFormatId === SDXL_SIZE_PRESET_FORMAT_ID
  );
}
