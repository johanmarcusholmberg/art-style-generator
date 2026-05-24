/**
 * Centralized print/poster format configuration.
 *
 * Single source of truth for poster/print sizing across the entire app:
 * generator UI, prompt compiler, providers, preview, poster composer,
 * export pipeline, gallery metadata, and mockups.
 *
 * Add new formats by appending to PRINT_FORMATS — every consumer reads
 * from here, so additions propagate automatically.
 */

export interface PrintFormat {
  /** Unique identifier (also referred to as `posterFormatId` externally) */
  id: string;
  /** Human-readable label, e.g. "50 × 70 cm" */
  label: string;
  /** Width in cm */
  widthCm: number;
  /** Height in cm */
  heightCm: number;
  /** Aspect ratio string, e.g. "5:7" — used by prompt compiler / providers */
  aspectRatio: string;
  /** Aspect ratio as decimal (width / height) — convenience */
  aspectRatioDecimal: number;
  /**
   * Short prompt hint describing the desired composition format. Injected
   * into every provider's compiled prompt so models compose for the right
   * canvas regardless of which provider runs.
   */
  promptHint: string;
  /**
   * Recommended generation pixel target. Providers should pick the closest
   * supported size. (Foundation pass: stored but not yet enforced per-adapter.)
   */
  recommendedGenerationWidth: number;
  recommendedGenerationHeight: number;
  /** Preferred pixel width at full print quality (300 PPI) */
  preferredPixelWidth: number;
  /** Preferred pixel height at full print quality (300 PPI) */
  preferredPixelHeight: number;
  /** Fallback pixel width (150 PPI equivalent) */
  fallbackPixelWidth: number;
  /** Fallback pixel height (150 PPI equivalent) */
  fallbackPixelHeight: number;
  /** Whether upscaling is allowed to reach target */
  allowUpscale: boolean;
  /** Export type category */
  exportType: "poster" | "photo" | "canvas" | "custom";
}

/**
 * Registry of all supported poster/print formats.
 *
 * Order matters: index 0 is the default and many existing call sites
 * reference `PRINT_FORMATS[0]` — keep `print_50x70` first.
 */
export const PRINT_FORMATS: PrintFormat[] = [
  {
    id: "print_50x70",
    label: "50 × 70 cm",
    widthCm: 50,
    heightCm: 70,
    aspectRatio: "5:7",
    aspectRatioDecimal: 50 / 70,
    promptHint: "vertical 5:7 poster format suitable for 50 × 70 cm print",
    recommendedGenerationWidth: 1600,
    recommendedGenerationHeight: 2240,
    preferredPixelWidth: 5906,
    preferredPixelHeight: 8268,
    fallbackPixelWidth: 2953,
    fallbackPixelHeight: 4134,
    allowUpscale: true,
    exportType: "poster",
  },
  {
    id: "print_30x40",
    label: "30 × 40 cm",
    widthCm: 30,
    heightCm: 40,
    aspectRatio: "3:4",
    aspectRatioDecimal: 30 / 40,
    promptHint: "vertical 3:4 poster format suitable for 30 × 40 cm print",
    recommendedGenerationWidth: 1536,
    recommendedGenerationHeight: 2048,
    preferredPixelWidth: 3543,
    preferredPixelHeight: 4724,
    fallbackPixelWidth: 1772,
    fallbackPixelHeight: 2362,
    allowUpscale: true,
    exportType: "poster",
  },
  {
    id: "print_50x50",
    label: "50 × 50 cm",
    widthCm: 50,
    heightCm: 50,
    aspectRatio: "1:1",
    aspectRatioDecimal: 1,
    promptHint: "square 1:1 poster format suitable for 50 × 50 cm print",
    recommendedGenerationWidth: 2048,
    recommendedGenerationHeight: 2048,
    preferredPixelWidth: 5906,
    preferredPixelHeight: 5906,
    fallbackPixelWidth: 2953,
    fallbackPixelHeight: 2953,
    allowUpscale: true,
    exportType: "poster",
  },
  {
    id: "print_a2",
    label: "A2",
    widthCm: 42,
    heightCm: 59.4,
    aspectRatio: "ISO-A",
    aspectRatioDecimal: 420 / 594,
    promptHint: "vertical ISO A-series poster format suitable for A2 print",
    recommendedGenerationWidth: 1448,
    recommendedGenerationHeight: 2048,
    preferredPixelWidth: 4961,
    preferredPixelHeight: 7016,
    fallbackPixelWidth: 2480,
    fallbackPixelHeight: 3508,
    allowUpscale: true,
    exportType: "poster",
  },
  {
    id: "print_a3",
    label: "A3",
    widthCm: 29.7,
    heightCm: 42,
    aspectRatio: "ISO-A",
    aspectRatioDecimal: 297 / 420,
    promptHint: "vertical ISO A-series poster format suitable for A3 print",
    recommendedGenerationWidth: 1448,
    recommendedGenerationHeight: 2048,
    preferredPixelWidth: 3508,
    preferredPixelHeight: 4961,
    fallbackPixelWidth: 1754,
    fallbackPixelHeight: 2480,
    allowUpscale: true,
    exportType: "poster",
  },
  {
    id: "print_a4",
    label: "A4",
    widthCm: 21,
    heightCm: 29.7,
    aspectRatio: "ISO-A",
    aspectRatioDecimal: 210 / 297,
    promptHint: "vertical ISO A-series poster format suitable for A4 print",
    recommendedGenerationWidth: 1448,
    recommendedGenerationHeight: 2048,
    preferredPixelWidth: 2480,
    preferredPixelHeight: 3508,
    fallbackPixelWidth: 1240,
    fallbackPixelHeight: 1754,
    allowUpscale: true,
    exportType: "poster",
  },
];

/** Default print format id — used as fallback when none is specified */
export const DEFAULT_PRINT_FORMAT_ID = PRINT_FORMATS[0].id; // 50 × 70

/** Look up a print format by id (returns undefined for unknown ids). */
export function getPrintFormat(id: string): PrintFormat | undefined {
  return PRINT_FORMATS.find((f) => f.id === id);
}

/** Look up a print format that matches given cm dimensions */
export function getPrintFormatByDimensions(
  widthCm: number,
  heightCm: number,
): PrintFormat | undefined {
  return PRINT_FORMATS.find(
    (f) =>
      (f.widthCm === widthCm && f.heightCm === heightCm) ||
      (f.widthCm === heightCm && f.heightCm === widthCm),
  );
}

/**
 * Coerce an arbitrary input into a known print format id.
 * Falls back to the default id when input is missing/unknown.
 */
export function normalizePrintFormatId(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_PRINT_FORMAT_ID;
  return PRINT_FORMATS.some((f) => f.id === value) ? value : DEFAULT_PRINT_FORMAT_ID;
}

/** Aspect ratio (string) for a format id, with default fallback. */
export function getPosterAspectRatio(formatId: string): string {
  return (getPrintFormat(formatId) ?? PRINT_FORMATS[0]).aspectRatio;
}

/** Aspect ratio decimal for a format id, with default fallback. */
export function getPosterAspectRatioDecimal(formatId: string): number {
  return (getPrintFormat(formatId) ?? PRINT_FORMATS[0]).aspectRatioDecimal;
}

/** Recommended generation pixel size for a format id. */
export function getRecommendedGenerationSize(
  formatId: string,
): { width: number; height: number } {
  const f = getPrintFormat(formatId) ?? PRINT_FORMATS[0];
  return { width: f.recommendedGenerationWidth, height: f.recommendedGenerationHeight };
}

/**
 * Print export pixel size for a format at the requested DPI.
 * Convenience: 300 returns preferred, 150 returns fallback. Other DPI values
 * are computed from the cm dimensions.
 */
export function getPrintExportSize(
  formatId: string,
  dpi: number = 300,
): { width: number; height: number } {
  const f = getPrintFormat(formatId) ?? PRINT_FORMATS[0];
  if (dpi === 300) return { width: f.preferredPixelWidth, height: f.preferredPixelHeight };
  if (dpi === 150) return { width: f.fallbackPixelWidth, height: f.fallbackPixelHeight };
  const CM_TO_INCHES = 1 / 2.54;
  return {
    width: Math.round(f.widthCm * CM_TO_INCHES * dpi),
    height: Math.round(f.heightCm * CM_TO_INCHES * dpi),
  };
}

/** Prompt hint string for a format id (default fallback if unknown). */
export function getPosterPromptHint(formatId: string): string {
  return (getPrintFormat(formatId) ?? PRINT_FORMATS[0]).promptHint;
}

/**
 * Whether actual pixel dimensions match the target aspect ratio within
 * `tolerance` (default 0.5 %). Used for runtime validation/diagnostics.
 */
export function isAspectRatioMatch(
  width: number,
  height: number,
  targetAspectDecimal: number,
  tolerance = 0.005,
): boolean {
  if (!width || !height || !targetAspectDecimal) return false;
  const actual = width / height;
  return Math.abs(actual - targetAspectDecimal) / targetAspectDecimal <= tolerance;
}

/**
 * Build a human-readable description of an export result tier.
 * Centralises the tier + upscale messaging used by Gallery and ImageGenerator.
 */
export function formatExportDescription(
  tier: "preferred" | "fallback" | "source",
  upscaleApplied: boolean,
  upscaleFactor: number,
  width: number,
  height: number,
): { tierLabel: string; upscaleNote: string; summary: string } {
  const tierLabel =
    tier === "preferred"
      ? "300 PPI — Full print quality"
      : tier === "fallback"
      ? "150 PPI — Standard print quality"
      : "Source resolution — print quality not measured";
  const upscaleNote = upscaleApplied
    ? ` · Enhanced ${upscaleFactor}×`
    : " · Native resolution";
  return {
    tierLabel,
    upscaleNote,
    summary: `${width} × ${height} px · ${tierLabel}${upscaleNote}`,
  };
}

/**
 * Determine target pixel dimensions for a print format given a quality target.
 * Returns preferred (300 PPI) or fallback (150 PPI) dimensions.
 */
export function getTargetPixels(
  format: PrintFormat,
  quality: "preferred" | "fallback",
): { width: number; height: number } {
  if (quality === "preferred") {
    return { width: format.preferredPixelWidth, height: format.preferredPixelHeight };
  }
  return { width: format.fallbackPixelWidth, height: format.fallbackPixelHeight };
}

/**
 * Assess whether actual pixel dimensions meet a print format's requirements.
 */
export function assessExportReadiness(
  actualWidth: number,
  actualHeight: number,
  format: PrintFormat,
): {
  meetsPreferred: boolean;
  meetsFallback: boolean;
  exportReady: boolean;
  achievablePpi: number;
  description: string;
} {
  const CM_TO_INCHES = 1 / 2.54;
  const widthInches = format.widthCm * CM_TO_INCHES;
  const heightInches = format.heightCm * CM_TO_INCHES;

  const ppiW = actualWidth / widthInches;
  const ppiH = actualHeight / heightInches;
  const achievablePpi = Math.round(Math.min(ppiW, ppiH));

  const meetsPreferred =
    actualWidth >= format.preferredPixelWidth && actualHeight >= format.preferredPixelHeight;
  const meetsFallback =
    actualWidth >= format.fallbackPixelWidth && actualHeight >= format.fallbackPixelHeight;

  let description: string;
  if (meetsPreferred) {
    description = `Print ready at ${format.label} (${achievablePpi} PPI)`;
  } else if (meetsFallback) {
    description = `Suitable for ${format.label} at ${achievablePpi} PPI (standard quality)`;
  } else {
    const maxWidthCm = Math.round((actualWidth / 150) / CM_TO_INCHES);
    const maxHeightCm = Math.round((actualHeight / 150) / CM_TO_INCHES);
    description = `Best for print up to ${maxWidthCm} × ${maxHeightCm} cm at 150 PPI`;
  }

  return {
    meetsPreferred,
    meetsFallback,
    exportReady: meetsFallback,
    achievablePpi,
    description,
  };
}
