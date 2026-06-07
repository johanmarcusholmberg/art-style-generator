/**
 * Print-export pipeline.
 *
 * Takes a preview/generated image and produces a high-resolution
 * print-ready asset via client-side canvas operations:
 *   1. Load source image
 *   2. Normalize aspect ratio (crop or pad)
 *   3. Scale to target print pixel dimensions
 *   4. Return as Blob + metadata
 *
 * This keeps gallery/preview images lightweight while offering
 * on-demand high-res export.
 */

import { normalizeRatio, type RatioNormalizationResult } from "@/lib/ratio-normalization";
import { type PrintFormat, getPrintFormat } from "@/lib/print-formats";
import {
  DEFAULT_BLEED_MM,
  DEFAULT_SAFE_MM,
  computeBleedPixels,
  renderWithBleed,
} from "@/lib/bleed-config";

export interface PrintExportResult {
  /** The final high-res blob ready for download / upload (includes bleed). */
  blob: Blob;
  /** Final exported width in pixels (trim + 2 × bleed). */
  width: number;
  /** Final exported height in pixels (trim + 2 × bleed). */
  height: number;
  /** Trim width in pixels (customer-visible). */
  trimWidth: number;
  /** Trim height in pixels (customer-visible). */
  trimHeight: number;
  /** Exported canvas width in pixels (== width). */
  exportWidth: number;
  /** Exported canvas height in pixels (== height). */
  exportHeight: number;
  /** Bleed in millimetres applied to each side. */
  bleedMm: number;
  /** Safe-area inset in millimetres from the trim edge. */
  safeMm: number;
  /** Bleed in pixels at the export DPI. */
  bleedPx: number;
  /** Effective DPI of the trim canvas. */
  dpi: number;
  /** Which quality tier was achieved */
  tier: "preferred" | "fallback" | "source";
  /** Whether upscaling was applied */
  upscaleApplied: boolean;
  /** Upscale factor (1 = no upscale) */
  upscaleFactor: number;
  /** Ratio normalization details */
  normalization: RatioNormalizationResult;
  /** The print format used */
  printFormatId: string;
}

/**
 * Load an image (data-URL or remote URL) into an HTMLImageElement.
 * Includes a timeout to avoid hanging on missing/broken assets.
 */
function loadImage(src: string, timeoutMs = 30000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => {
      img.src = "";
      reject(new Error("Image load timed out — the source may be unavailable"));
    }, timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Failed to load source image — it may have been deleted or is inaccessible"));
    };
    img.src = src;
  });
}


export { loadImage as loadImageForExport };

/**
 * Determine which quality tier an image can reach for a given print format.
 */
function determineTier(
  sourceWidth: number,
  sourceHeight: number,
  format: PrintFormat,
): "preferred" | "fallback" | "source" {
  // After normalization + upscale, can we hit preferred?
  // We allow up to 4× upscale for preferred, 2× for fallback
  const maxUpscale = format.allowUpscale ? 4 : 1;
  const effectiveMax = sourceWidth * maxUpscale;

  if (effectiveMax >= format.preferredPixelWidth) return "preferred";

  const fallbackUpscale = format.allowUpscale ? 2 : 1;
  const effectiveFallback = sourceWidth * fallbackUpscale;
  if (effectiveFallback >= format.fallbackPixelWidth) return "fallback";

  return "source";
}

export interface PrintExportOptions {
  /** The source image (data URL or public URL) */
  imageUrl: string;
  /** Print format id, e.g. "print_50x70" */
  printFormatId: string;
  /** Force a specific tier instead of auto-detecting */
  forceTier?: "preferred" | "fallback";
  /**
   * Ratio correction method.
   * Always defaults to "pad" to preserve artwork integrity.
   * "crop" is available but should only be used explicitly by the caller.
   */
  ratioMethod?: "crop" | "pad";
  /** Padding fill colour (CSS colour string) */
  padColor?: string;
  /** Output MIME type */
  mimeType?: string;
  /** JPEG/WebP quality 0-1 */
  quality?: number;
  /** Override the default bleed (mm). Defaults to {@link DEFAULT_BLEED_MM}. */
  bleedMm?: number;
  /** Override the safe-area inset (mm). Defaults to {@link DEFAULT_SAFE_MM}. */
  safeMm?: number;
}

/**
 * Phase 5 — Browser canvas safety guards.
 *
 * Browsers cap HTMLCanvasElement size and total pixel area. Exceeding those
 * limits silently produces a blank/black canvas or crashes the tab. We
 * pre-validate before allocating any pixels and surface a clear error.
 *
 * TODO(server-export): migrate large exports (>~200 MP) to a server-side
 * renderer (sharp/imagemagick in an edge function) so users aren't bound
 * by browser canvas limits or device memory.
 */
export const MAX_CANVAS_DIMENSION = 16384; // conservative cross-browser cap
export const MAX_CANVAS_PIXELS = 200_000_000; // ~200 MP — RGBA needs ~800 MB
export function assertCanvasWithinLimits(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid export dimensions (${width}×${height}).`);
  }
  if (width > MAX_CANVAS_DIMENSION || height > MAX_CANVAS_DIMENSION) {
    throw new Error(
      `Export size ${width}×${height}px exceeds the browser's maximum canvas dimension ` +
        `(${MAX_CANVAS_DIMENSION}px). Try a smaller print format or lower DPI.`,
    );
  }
  if (width * height > MAX_CANVAS_PIXELS) {
    throw new Error(
      `Export is too large for browser rendering (${Math.round((width * height) / 1_000_000)} MP). ` +
        `The current limit is ${MAX_CANVAS_PIXELS / 1_000_000} MP. ` +
        `Use a smaller print format or wait for the upcoming server-side export.`,
    );
  }
}

/**
 * Run the full print-export pipeline.
 */
export async function preparePrintExport(
  opts: PrintExportOptions,
): Promise<PrintExportResult> {
  const format = getPrintFormat(opts.printFormatId);
  if (!format) throw new Error(`Unknown print format: ${opts.printFormatId}`);

  if (!opts.imageUrl) throw new Error("No source image provided for print export");

  const img = await loadImage(opts.imageUrl);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;

  if (srcW < 64 || srcH < 64) {
    throw new Error(`Source image is too small (${srcW}×${srcH} px). Minimum 64×64 required.`);
  }

  // 1. Normalize ratio
  // Always use padding — never crop artwork
  const norm = normalizeRatio(
    srcW,
    srcH,
    format.aspectRatio,
    opts.ratioMethod ?? "pad",
  );

  // 2. Determine target tier
  const tier = opts.forceTier ?? determineTier(norm.outputWidth, norm.outputHeight, format);

  let targetW: number;
  let targetH: number;

  if (tier === "preferred") {
    targetW = format.preferredPixelWidth;
    targetH = format.preferredPixelHeight;
  } else if (tier === "fallback") {
    targetW = format.fallbackPixelWidth;
    targetH = format.fallbackPixelHeight;
  } else {
    // Source tier — just use normalized dimensions (no upscale)
    targetW = norm.outputWidth;
    targetH = norm.outputHeight;
  }

  const upscaleFactor = targetW / norm.outputWidth;
  const upscaleApplied = upscaleFactor > 1.01;

  // 3a. Render trim image to an intermediate canvas at exact trim size.
  assertCanvasWithinLimits(targetW, targetH);
  const trimCanvas = document.createElement("canvas");
  trimCanvas.width = targetW;
  trimCanvas.height = targetH;
  const trimCtx = trimCanvas.getContext("2d");
  if (!trimCtx) {
    throw new Error("Could not allocate canvas for export — your browser may be low on memory.");
  }
  trimCtx.fillStyle = opts.padColor ?? "#ffffff";
  trimCtx.fillRect(0, 0, targetW, targetH);
  trimCtx.imageSmoothingEnabled = true;
  trimCtx.imageSmoothingQuality = "high";

  if (norm.method === "crop") {
    trimCtx.drawImage(
      img,
      norm.cropX, norm.cropY, norm.cropWidth, norm.cropHeight,
      0, 0, targetW, targetH,
    );
  } else if (norm.method === "pad") {
    const drawX = Math.round(norm.padLeft * (targetW / norm.outputWidth));
    const drawY = Math.round(norm.padTop * (targetH / norm.outputHeight));
    const drawW = Math.round(srcW * (targetW / norm.outputWidth));
    const drawH = Math.round(srcH * (targetH / norm.outputHeight));
    trimCtx.drawImage(img, 0, 0, srcW, srcH, drawX, drawY, drawW, drawH);
  } else {
    trimCtx.drawImage(img, 0, 0, srcW, srcH, 0, 0, targetW, targetH);
  }

  // 3b. Compute trim DPI from the format's physical size, then derive bleed.
  const CM_TO_INCHES = 1 / 2.54;
  const trimDpi = Math.round(targetW / (format.widthCm * CM_TO_INCHES));
  const bleed = computeBleedPixels({
    trimWidthPx: targetW,
    trimHeightPx: targetH,
    dpi: trimDpi,
    bleedMm: opts.bleedMm ?? DEFAULT_BLEED_MM,
    safeMm: opts.safeMm ?? DEFAULT_SAFE_MM,
  });

  // 3c. Allocate the final export canvas at trim + 2 × bleed and render
  //     via edge-stretch. Validate the inflated size first.
  assertCanvasWithinLimits(bleed.exportWidth, bleed.exportHeight);
  const canvas = document.createElement("canvas");
  canvas.width = bleed.exportWidth;
  canvas.height = bleed.exportHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not allocate canvas for export — your browser may be low on memory.");
  }
  renderWithBleed({
    source: trimCanvas,
    sourceWidth: targetW,
    sourceHeight: targetH,
    trimWidth: targetW,
    trimHeight: targetH,
    bleedPx: bleed.bleedPx,
    ctx,
  });

  // 4. Export blob
  const mime = opts.mimeType ?? "image/png";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))),
      mime,
      opts.quality ?? 1.0,
    );
  });

  return {
    blob,
    width: bleed.exportWidth,
    height: bleed.exportHeight,
    trimWidth: targetW,
    trimHeight: targetH,
    exportWidth: bleed.exportWidth,
    exportHeight: bleed.exportHeight,
    bleedMm: bleed.bleedMm,
    safeMm: bleed.safeMm,
    bleedPx: bleed.bleedPx,
    dpi: trimDpi,
    tier,
    upscaleApplied,
    upscaleFactor: Math.round(upscaleFactor * 100) / 100,
    normalization: norm,
    printFormatId: opts.printFormatId,
  };
}

/**
 * Trigger a browser download of a print export blob. Idempotently ensures the
 * standardized bleed suffix (`_bleed3mm`) is present so every customer-facing
 * file advertises its baked-in bleed.
 */
export function downloadPrintExport(blob: Blob, filename: string) {
  const suffix = `_bleed${DEFAULT_BLEED_MM}mm`;
  const finalName = filename.includes(suffix)
    ? filename
    : filename.replace(/(\.[a-zA-Z0-9]+)$|$/, (m) => `${suffix}${m}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = finalName;
  a.click();
  URL.revokeObjectURL(url);
}
