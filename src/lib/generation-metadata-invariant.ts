/**
 * Metadata completeness invariant for generated images.
 *
 * A generation is only "complete" when the row we persist carries
 * trustworthy metadata:
 *
 *   - actual pixel dimensions measured FROM THE IMAGE BYTES
 *   - a print format id for print-ready generations
 *   - a canonical aspect ratio derived from that print format
 *
 * The server enforces this before it marks a `generation_job_item`
 * completed. A Deno mirror lives at
 * `supabase/functions/_shared/generation-metadata-invariant.ts`.
 */
import { getPrintFormat, DEFAULT_PRINT_FORMAT_ID } from "@/lib/print-formats";
import { isValidPixelDimension } from "@/lib/image-byte-dimensions";

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

/** Generation modes that require a persisted print format. */
export function isPrintReadyGeneration(generationMode?: string | null): boolean {
  if (!generationMode) return false;
  return generationMode === "print-ready" || generationMode === "print_ready";
}

/**
 * Canonical aspect ratio for a persisted row. Print format wins over any
 * provider- or client-supplied token so the stored ratio can never drift
 * from the selected poster format.
 */
export function canonicalAspectRatio(
  printFormatId?: string | null,
  fallback?: string | null,
): string | null {
  if (printFormatId) {
    const fmt = getPrintFormat(printFormatId);
    if (fmt) return fmt.aspectRatio;
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

/** List every invariant defect in a candidate row (empty = complete). */
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

/** Throw `MetadataIncompleteError` when the candidate violates the invariant. */
export function assertMetadataComplete(c: MetadataCandidate): void {
  const defects = findMetadataDefects(c);
  if (defects.length > 0) throw new MetadataIncompleteError(defects);
}

export { DEFAULT_PRINT_FORMAT_ID };

/** Target aspect-ratio decimal for a print format, or null when unknown. */
export function printFormatRatioDecimal(
  printFormatId?: string | null,
): number | null {
  if (!printFormatId) return null;
  return getPrintFormat(printFormatId)?.aspectRatioDecimal ?? null;
}
