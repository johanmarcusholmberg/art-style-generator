/**
 * Image metadata utilities (Part C of architecture upgrade).
 *
 * - `loadImageDimensions(url)` reads the natural pixel size of an image.
 * - `classifyPrintReadiness(w, h, printFormatId?)` returns a coarse status
 *   that downstream UI (badges, lightbox) uses to summarize whether a
 *   master asset is appropriate for the selected print format.
 *
 * IMPORTANT: this module never claims that canvas scaling creates true
 * print detail. It only classifies the master's effective PPI against the
 * target format. Print export is treated as a layout/export step from the
 * best available master.
 */
import { getPrintReadinessStatus, type PrintReadinessStatus } from "@/lib/print-readiness";

export async function loadImageDimensions(
  imageUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load image dimensions"));
    img.src = imageUrl;
  });
}

export type { PrintReadinessStatus };

/**
 * Classify an image's print readiness for the given format.
 * Returns `"unknown"` when dimensions are missing.
 */
export function classifyPrintReadiness(
  width?: number | null,
  height?: number | null,
  printFormatId?: string | null,
): PrintReadinessStatus {
  if (!width || !height) return "unknown";
  // Reuse the canonical readiness assessment so badges and lightbox agree.
  return getPrintReadinessStatus(
    {
      actual_width_px: width,
      actual_height_px: height,
    } as { actual_width_px?: number | null; actual_height_px?: number | null },
    printFormatId ?? null,
  );
}
