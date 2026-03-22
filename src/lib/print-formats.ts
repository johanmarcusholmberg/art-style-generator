/**
 * Centralized print format configuration.
 * Each format defines physical dimensions, aspect ratio, and pixel targets.
 * Extensible — add new formats by appending to PRINT_FORMATS.
 */

export interface PrintFormat {
  /** Unique identifier */
  id: string;
  /** Human-readable label */
  label: string;
  /** Width in cm */
  widthCm: number;
  /** Height in cm */
  heightCm: number;
  /** Aspect ratio string, e.g. "5:7" */
  aspectRatio: string;
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

/** Registry of all supported print formats */
export const PRINT_FORMATS: PrintFormat[] = [
  {
    id: "print_50x70",
    label: "50 × 70 cm",
    widthCm: 50,
    heightCm: 70,
    aspectRatio: "5:7",
    preferredPixelWidth: 5906,
    preferredPixelHeight: 8268,
    fallbackPixelWidth: 2953,
    fallbackPixelHeight: 4134,
    allowUpscale: true,
    exportType: "poster",
  },
];

/** Look up a print format by id */
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
