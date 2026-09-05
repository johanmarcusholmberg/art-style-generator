/**
 * Deno mirror of `src/lib/sdxl-size-presets.ts`.
 *
 * Keep in lockstep with the client file — the parity test in
 * `src/lib/sdxl-size-presets.test.ts` asserts the preset dimensions and
 * the resolver's precedence behave identically in both runtimes.
 */

export type SdxlSizePreset = "small" | "large";

export const SDXL_SIZE_PRESET_FORMAT_ID = "print_50x70";

export const SDXL_SIZE_PRESETS: Record<
  SdxlSizePreset,
  { id: SdxlSizePreset; width: number; height: number }
> = {
  small: { id: "small", width: 1200, height: 1680 },
  large: { id: "large", width: 1440, height: 2016 },
};

export const DEFAULT_SDXL_SIZE_PRESET: SdxlSizePreset = "small";

export function isSdxlSizePreset(v: unknown): v is SdxlSizePreset {
  return v === "small" || v === "large";
}

export function isExactFiveBySeven(width: number, height: number): boolean {
  return width * 7 === height * 5 && width % 8 === 0 && height % 8 === 0;
}

export interface ResolveSdxlSizeInput {
  preset?: SdxlSizePreset | null;
  presetAllowed?: boolean;
  posterFormatId?: string | null;
  requestedWidth?: number | null;
  requestedHeight?: number | null;
  targetRatio?: number | null;
  fallback: { width: number; height: number; source: string; exact: boolean };
}

export interface ResolvedSdxlSize {
  width: number;
  height: number;
  sizeSource: string;
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
    w >= 256 && w <= 2048 &&
    h >= 256 && h <= 2048 &&
    w % 8 === 0 && h % 8 === 0
  );
}

export function resolveSdxlRequestSize(
  input: ResolveSdxlSizeInput,
): ResolvedSdxlSize {
  const {
    preset, presetAllowed, posterFormatId,
    requestedWidth, requestedHeight, targetRatio, fallback,
  } = input;

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

  if (overrideIsValid(requestedWidth, requestedHeight)) {
    const w = requestedWidth as number;
    const h = requestedHeight as number;
    const exact =
      typeof targetRatio === "number" && targetRatio > 0
        ? Math.abs(w / h - targetRatio) / targetRatio <= RATIO_TOLERANCE
        : false;
    return {
      width: w, height: h, sizeSource: "override",
      preset: null, exact, adjusted: !exact,
    };
  }

  return {
    width: fallback.width,
    height: fallback.height,
    sizeSource: fallback.source,
    preset: null,
    exact: fallback.exact,
    adjusted: !fallback.exact,
  };
}

export function sdxlPresetApplies(
  providerPreference: string | null | undefined,
  posterFormatId: string | null | undefined,
): boolean {
  return (
    providerPreference === "sdxl" &&
    posterFormatId === SDXL_SIZE_PRESET_FORMAT_ID
  );
}
