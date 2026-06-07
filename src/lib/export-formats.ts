/**
 * Export-format module — the single source of truth for multi-format
 * poster export (PNG / JPEG / PDF).
 *
 * Every customer-facing export flow (DownloadButton, Gallery, Style Compare,
 * Blend, Etsy export, Poster Composer, Image Generator) routes its final
 * encoding through this module so the rest of the pipeline — bleed,
 * safe-area, sizing, print-readiness — stays untouched.
 *
 *      Master Image
 *        → Bleed Generation
 *          → Safe Area Rules
 *            → Format Sizing
 *              → Final Rendering   (canvas, identical for every format)
 *                → Format Encoder  (this module)
 *
 * Only the final encoding step differs between formats.
 */
import { DEFAULT_BLEED_MM } from "@/lib/bleed-config";

export type ExportFormat = "png" | "jpeg" | "pdf";

export const DEFAULT_EXPORT_FORMAT: ExportFormat = "png";
export const EXPORT_FORMATS: readonly ExportFormat[] = ["png", "jpeg", "pdf"];

export interface ExportFormatMeta {
  format: ExportFormat;
  /** Human label for selectors. */
  label: string;
  /** Short description for selectors / tooltips. */
  description: string;
  /** File extension (no dot). */
  extension: "png" | "jpg" | "pdf";
  /** Output MIME type for the final blob. */
  mimeType: string;
  /** Encoder quality for raster formats (0..1). 1.0 = lossless / max. */
  quality: number;
}

export const EXPORT_FORMAT_META: Record<ExportFormat, ExportFormatMeta> = {
  png: {
    format: "png",
    label: "PNG",
    description: "Lossless raster — best for archive masters.",
    extension: "png",
    mimeType: "image/png",
    quality: 1.0,
  },
  jpeg: {
    format: "jpeg",
    label: "JPEG",
    description: "Compressed raster at 95% quality — smaller files.",
    extension: "jpg",
    mimeType: "image/jpeg",
    quality: 0.95,
  },
  pdf: {
    format: "pdf",
    label: "PDF",
    description: "Single-page print-ready PDF sized to the export canvas.",
    extension: "pdf",
    mimeType: "application/pdf",
    quality: 0.95,
  },
};

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

const LS_KEY = "lovable.exportFormat.v1";

export function isExportFormat(v: unknown): v is ExportFormat {
  return v === "png" || v === "jpeg" || v === "pdf";
}

export function getStoredExportFormat(): ExportFormat {
  if (typeof window === "undefined") return DEFAULT_EXPORT_FORMAT;
  try {
    const v = window.localStorage.getItem(LS_KEY);
    if (isExportFormat(v)) return v;
  } catch {
    /* localStorage unavailable — fall back to default */
  }
  return DEFAULT_EXPORT_FORMAT;
}

export function setStoredExportFormat(f: ExportFormat): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, f);
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function getExportFormatMeta(f: ExportFormat): ExportFormatMeta {
  return EXPORT_FORMAT_META[f];
}

/* ------------------------------------------------------------------ */
/* Filename construction                                              */
/* ------------------------------------------------------------------ */

/**
 * Build the customer-facing filename for an export.
 *
 *   - Strips any existing extension on the base name.
 *   - Idempotently appends the `_bleed{N}mm` suffix.
 *   - Appends the extension matching the selected format.
 *
 * Examples:
 *   buildExportFilename("malaga-rooftop_50x70", "png")   → "malaga-rooftop_50x70_bleed3mm.png"
 *   buildExportFilename("malaga-rooftop_50x70.png", "jpeg") → "malaga-rooftop_50x70_bleed3mm.jpg"
 *   buildExportFilename("art_bleed3mm.png", "pdf")       → "art_bleed3mm.pdf"
 */
export function buildExportFilename(
  baseName: string,
  format: ExportFormat = DEFAULT_EXPORT_FORMAT,
  bleedMm: number = DEFAULT_BLEED_MM,
): string {
  const meta = EXPORT_FORMAT_META[format];
  const stripped = baseName.replace(/\.[a-zA-Z0-9]+$/, "");
  const suffix = `_bleed${bleedMm}mm`;
  const withSuffix = stripped.endsWith(suffix) || stripped.includes(`${suffix}_`)
    ? stripped
    : `${stripped}${suffix}`;
  return `${withSuffix}.${meta.extension}`;
}

/* ------------------------------------------------------------------ */
/* Canvas → Blob encoder                                              */
/* ------------------------------------------------------------------ */

/**
 * Encode a fully-rendered canvas (already includes bleed) into the chosen
 * export format. The PDF encoder produces a single-page document whose
 * page dimensions exactly match the canvas pixels — no scaling, no
 * margins, no headers/footers/metadata overlays.
 */
export async function encodeCanvasToBlob(
  canvas: HTMLCanvasElement,
  format: ExportFormat = DEFAULT_EXPORT_FORMAT,
): Promise<Blob> {
  const meta = EXPORT_FORMAT_META[format];

  if (format === "pdf") {
    // Dynamic import so jsPDF only ships when the user actually picks PDF.
    const { jsPDF } = await import("jspdf");
    // Embed a JPEG so the file stays a sensible size for poster-class
    // pixel counts; the image still has bleed baked in.
    const dataUrl = canvas.toDataURL("image/jpeg", meta.quality);
    const doc = new jsPDF({
      unit: "px",
      // Page size in pixels = canvas size, so 1 PDF user-unit = 1 image pixel.
      format: [canvas.width, canvas.height],
      hotfixes: ["px_scaling"],
      compress: true,
    });
    doc.addImage(
      dataUrl,
      "JPEG",
      0,
      0,
      canvas.width,
      canvas.height,
      undefined,
      "FAST",
    );
    const ab = doc.output("arraybuffer");
    return new Blob([ab], { type: meta.mimeType });
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`Canvas encode failed (${format})`))),
      meta.mimeType,
      meta.quality,
    );
  });
}
