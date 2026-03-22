/**
 * Print resolution calculation utility.
 * Converts print dimensions (cm) + PPI targets into pixel dimensions.
 */

export type QualityTarget = "web" | "print-150" | "print-300";

export interface PrintResolution {
  /** Target PPI */
  ppi: number;
  /** Target width in pixels */
  widthPx: number;
  /** Target height in pixels */
  heightPx: number;
  /** Print width in cm */
  printWidthCm: number;
  /** Print height in cm */
  printHeightCm: number;
  /** Human-readable label */
  label: string;
  /** Quality target key */
  qualityTarget: QualityTarget;
}

const CM_TO_INCHES = 1 / 2.54;

/** PPI values for each quality target */
export const QUALITY_PPI: Record<QualityTarget, number> = {
  web: 72,
  "print-150": 150,
  "print-300": 300,
};

export const QUALITY_LABELS: Record<QualityTarget, string> = {
  web: "Web (72 PPI)",
  "print-150": "Print Standard (150 PPI)",
  "print-300": "Print Premium (300 PPI)",
};

/**
 * Parse a dimension string like "50 × 70 cm" into { widthCm, heightCm }.
 */
export function parsePrintDimensions(dimensions: string): { widthCm: number; heightCm: number } | null {
  const match = dimensions.match(/(\d+)\s*[×x]\s*(\d+)/i);
  if (!match) return null;
  return { widthCm: parseInt(match[1], 10), heightCm: parseInt(match[2], 10) };
}

/**
 * Calculate the required pixel dimensions for a given print size and PPI target.
 */
export function calculateResolution(
  widthCm: number,
  heightCm: number,
  qualityTarget: QualityTarget,
): PrintResolution {
  const ppi = QUALITY_PPI[qualityTarget];
  const widthPx = Math.round(widthCm * CM_TO_INCHES * ppi);
  const heightPx = Math.round(heightCm * CM_TO_INCHES * ppi);

  return {
    ppi,
    widthPx,
    heightPx,
    printWidthCm: widthCm,
    printHeightCm: heightCm,
    label: `${widthCm} × ${heightCm} cm at ${ppi} PPI`,
    qualityTarget,
  };
}

/**
 * Given print dimensions string and quality target, calculate full resolution info.
 */
export function getResolutionForPrintSize(
  dimensions: string,
  qualityTarget: QualityTarget,
): PrintResolution | null {
  const parsed = parsePrintDimensions(dimensions);
  if (!parsed) return null;
  return calculateResolution(parsed.widthCm, parsed.heightCm, qualityTarget);
}

/**
 * Determine the best achievable print quality given actual pixel dimensions.
 * Returns the highest PPI tier the image can support at the given print size.
 */
export function assessPrintQuality(
  actualWidthPx: number,
  actualHeightPx: number,
  printWidthCm: number,
  printHeightCm: number,
): { achievablePpi: number; tier: QualityTarget; isPrintReady: boolean; description: string } {
  const widthInches = printWidthCm * CM_TO_INCHES;
  const heightInches = printHeightCm * CM_TO_INCHES;

  // Use the limiting dimension
  const ppiWidth = actualWidthPx / widthInches;
  const ppiHeight = actualHeightPx / heightInches;
  const achievablePpi = Math.round(Math.min(ppiWidth, ppiHeight));

  let tier: QualityTarget;
  let isPrintReady: boolean;
  let description: string;

  if (achievablePpi >= 280) {
    tier = "print-300";
    isPrintReady = true;
    description = `Print ready at ${printWidthCm} × ${printHeightCm} cm (${achievablePpi} PPI)`;
  } else if (achievablePpi >= 140) {
    tier = "print-150";
    isPrintReady = true;
    description = `Suitable for ${printWidthCm} × ${printHeightCm} cm at ${achievablePpi} PPI`;
  } else {
    tier = "web";
    isPrintReady = false;
    // Calculate what size it CAN support at 150 PPI
    const maxWidthCm = Math.round((actualWidthPx / 150) / CM_TO_INCHES);
    const maxHeightCm = Math.round((actualHeightPx / 150) / CM_TO_INCHES);
    description = `Best for screen use or print up to ${maxWidthCm} × ${maxHeightCm} cm`;
  }

  return { achievablePpi, tier, isPrintReady, description };
}

/**
 * Format pixel dimensions for display.
 */
export function formatResolution(widthPx: number, heightPx: number): string {
  return `${widthPx} × ${heightPx} px`;
}

/**
 * Get a short summary of required resolution for UI display.
 */
export function getResolutionSummary(dimensions: string, qualityTarget: QualityTarget): string {
  const res = getResolutionForPrintSize(dimensions, qualityTarget);
  if (!res) return "";
  return `${res.widthPx} × ${res.heightPx} px required`;
}
