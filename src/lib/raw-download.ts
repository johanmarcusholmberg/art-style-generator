/**
 * Raw / "Original" download helper.
 *
 * Every download path in the app routes through here so the static 3 mm
 * bleed (or whatever {@link DEFAULT_BLEED_MM} is) is **always** applied,
 * even when no print format is associated with the image.
 *
 * Behaviour:
 *   - With a known `printFormatId`: delegates to {@link preparePrintExport},
 *     which renders to the format's trim pixels and adds bleed via
 *     edge-stretch.
 *   - Without a print format: loads the source image, treats its natural
 *     pixel dimensions as the trim canvas, uses the supplied `dpi`
 *     (defaulting to {@link DEFAULT_EXPORT_DPI}) to compute the bleed in
 *     pixels, then renders trim + bleed via {@link renderWithBleed}.
 *
 * Source images are **never** delivered untouched.
 */
import {
  DEFAULT_BLEED_MM,
  DEFAULT_EXPORT_DPI,
  DEFAULT_SAFE_MM,
  computeBleedPixels,
  renderWithBleed,
} from "@/lib/bleed-config";
import {
  assertCanvasWithinLimits,
  loadImageForExport,
  preparePrintExport,
  type PrintExportResult,
} from "@/lib/print-export";
import {
  type ExportFormat,
  buildExportFilename,
  encodeCanvasToBlob,
  getStoredExportFormat,
} from "@/lib/export-formats";

export interface DownloadWithBleedOptions {
  /** File name presented to the user. */
  filename: string;
  /** Known print format id — when set, uses format trim dimensions. */
  printFormatId?: string | null;
  /** Effective DPI for the source image. Defaults to {@link DEFAULT_EXPORT_DPI}. */
  dpi?: number;
  /** Override default bleed in mm. */
  bleedMm?: number;
  /** Override default safe-area inset in mm. */
  safeMm?: number;
  /**
   * Output format. Defaults to the user's persisted choice
   * (PNG until changed).
   */
  exportFormat?: ExportFormat;
}

export interface RawBleedResult {
  blob: Blob;
  trimWidth: number;
  trimHeight: number;
  exportWidth: number;
  exportHeight: number;
  bleedMm: number;
  safeMm: number;
  bleedPx: number;
  dpi: number;
  /** The format the blob was encoded in. */
  format: ExportFormat;
}

/**
 * Render any image URL into a bleed-extended blob without downloading it.
 * Used by the download helpers and exposed for tests.
 */
export async function renderRawWithBleed(
  imageUrl: string,
  opts: Omit<DownloadWithBleedOptions, "filename"> = {},
): Promise<RawBleedResult> {
  if (!imageUrl) throw new Error("No image URL provided");

  const format: ExportFormat = opts.exportFormat ?? getStoredExportFormat();

  // Print-format path delegates fully so the existing pipeline (tiers,
  // ratio normalization, upscale awareness) keeps applying.
  if (opts.printFormatId) {
    const result: PrintExportResult = await preparePrintExport({
      imageUrl,
      printFormatId: opts.printFormatId,
      exportFormat: format,
      bleedMm: opts.bleedMm,
      safeMm: opts.safeMm,
    });
    return {
      blob: result.blob,
      trimWidth: result.trimWidth,
      trimHeight: result.trimHeight,
      exportWidth: result.exportWidth,
      exportHeight: result.exportHeight,
      bleedMm: result.bleedMm,
      safeMm: result.safeMm,
      bleedPx: result.bleedPx,
      dpi: result.dpi,
      format,
    };
  }

  // No-format path — treat the source pixels as the trim canvas.
  const img = await loadImageForExport(imageUrl);
  const trimW = img.naturalWidth;
  const trimH = img.naturalHeight;
  if (trimW < 16 || trimH < 16) {
    throw new Error(`Source image is too small to export (${trimW}×${trimH} px).`);
  }

  const dpi = opts.dpi && opts.dpi > 0 ? opts.dpi : DEFAULT_EXPORT_DPI;
  const bleed = computeBleedPixels({
    trimWidthPx: trimW,
    trimHeightPx: trimH,
    dpi,
    bleedMm: opts.bleedMm ?? DEFAULT_BLEED_MM,
    safeMm: opts.safeMm ?? DEFAULT_SAFE_MM,
  });

  assertCanvasWithinLimits(bleed.exportWidth, bleed.exportHeight);
  const canvas = document.createElement("canvas");
  canvas.width = bleed.exportWidth;
  canvas.height = bleed.exportHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable in this browser");

  renderWithBleed({
    source: img,
    sourceWidth: trimW,
    sourceHeight: trimH,
    trimWidth: trimW,
    trimHeight: trimH,
    bleedPx: bleed.bleedPx,
    ctx,
  });

  const blob = await encodeCanvasToBlob(canvas, format);

  return {
    blob,
    trimWidth: trimW,
    trimHeight: trimH,
    exportWidth: bleed.exportWidth,
    exportHeight: bleed.exportHeight,
    bleedMm: bleed.bleedMm,
    safeMm: bleed.safeMm,
    bleedPx: bleed.bleedPx,
    dpi: bleed.dpi,
    format,
  };
}

/**
 * Append a bleed suffix to a filename, e.g. "art.png" → "art_bleed3mm.png".
 * Kept for backwards compatibility — new callers should prefer
 * {@link buildExportFilename} from `export-formats.ts`.
 */
export function withBleedSuffix(filename: string, bleedMm: number = DEFAULT_BLEED_MM): string {
  const m = filename.match(/^(.*?)(\.[a-zA-Z0-9]+)?$/);
  const base = m?.[1] ?? filename;
  const ext = m?.[2] ?? "";
  return `${base}_bleed${bleedMm}mm${ext}`;
}

/**
 * Render the image into a bleed-extended blob and trigger a browser
 * download. Returns the bleed metadata so callers can surface it.
 */
export async function downloadWithBleed(
  imageUrl: string,
  opts: DownloadWithBleedOptions,
): Promise<RawBleedResult> {
  const result = await renderRawWithBleed(imageUrl, opts);
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement("a");
  a.href = url;
  // Use the format-aware filename builder so the extension matches the
  // encoded blob (and the _bleed{N}mm suffix is preserved).
  a.download = buildExportFilename(opts.filename, result.format, result.bleedMm);
  a.click();
  URL.revokeObjectURL(url);
  return result;
}


