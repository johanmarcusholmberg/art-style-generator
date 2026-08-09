/**
 * Deno mirror of `src/lib/generation-metadata-invariant.ts`.
 * Keep in sync — parity is asserted by
 * `src/lib/generation-metadata-invariant.test.ts`.
 */
import { isValidPixelDimension } from "./image-dimensions.ts";

export type MetadataDefectCode =
  | "missing_dimensions"
  | "missing_print_format"
  | "missing_aspect_ratio";

export class MetadataIncompleteError extends Error {
  readonly defects: MetadataDefectCode[];
  constructor(defects: MetadataDefectCode[]) {
    super(`metadata_incomplete: ${defects.join(", ")}`);
    this.name = "MetadataIncompleteError";
    this.defects = defects;
  }
}

// Mirrors the aspectRatio field of src/lib/print-formats.ts.
const FORMAT_ASPECT_RATIOS: Record<string, string> = {
  print_50x70: "5:7",
  print_70x50: "7:5",
  print_70x100: "7:10",
  print_30x40: "3:4",
  print_50x50: "1:1",
  print_a2: "ISO-A",
  print_a3: "ISO-A",
  print_a4: "ISO-A",
};

export function isPrintReadyGeneration(generationMode?: string | null): boolean {
  if (!generationMode) return false;
  return generationMode === "print-ready" || generationMode === "print_ready";
}

export function canonicalAspectRatio(
  printFormatId?: string | null,
  fallback?: string | null,
): string | null {
  if (printFormatId && FORMAT_ASPECT_RATIOS[printFormatId]) {
    return FORMAT_ASPECT_RATIOS[printFormatId];
  }
  return fallback ?? null;
}

export interface MetadataCandidate {
  widthPx?: number | null;
  heightPx?: number | null;
  printFormatId?: string | null;
  aspectRatio?: string | null;
  generationMode?: string | null;
}

export function findMetadataDefects(c: MetadataCandidate): MetadataDefectCode[] {
  const defects: MetadataDefectCode[] = [];
  if (!isValidPixelDimension(c.widthPx) || !isValidPixelDimension(c.heightPx)) {
    defects.push("missing_dimensions");
  }
  if (isPrintReadyGeneration(c.generationMode) && !c.printFormatId) {
    defects.push("missing_print_format");
  }
  if (!c.aspectRatio) defects.push("missing_aspect_ratio");
  return defects;
}

export function isMetadataComplete(c: MetadataCandidate): boolean {
  return findMetadataDefects(c).length === 0;
}

export function assertMetadataComplete(c: MetadataCandidate): void {
  const defects = findMetadataDefects(c);
  if (defects.length > 0) throw new MetadataIncompleteError(defects);
}

// Decimal (w/h) ratio per format — mirrors print-formats.ts.
const FORMAT_RATIO_DECIMALS: Record<string, number> = {
  print_50x70: 50 / 70,
  print_70x50: 70 / 50,
  print_70x100: 70 / 100,
  print_30x40: 30 / 40,
  print_50x50: 1,
  print_a2: 420 / 594,
  print_a3: 297 / 420,
  print_a4: 210 / 297,
};

/** Target aspect-ratio decimal for a print format, or null when unknown. */
export function printFormatRatioDecimal(
  printFormatId?: string | null,
): number | null {
  if (!printFormatId) return null;
  return FORMAT_RATIO_DECIMALS[printFormatId] ?? null;
}
