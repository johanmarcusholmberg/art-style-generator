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

export interface PrintExportResult {
  /** The final high-res blob ready for download / upload */
  blob: Blob;
  /** Final width */
  width: number;
  /** Final height */
  height: number;
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
  /** Preferred ratio correction method */
  ratioMethod?: "crop" | "pad" | "auto";
  /** Padding fill colour (CSS colour string) */
  padColor?: string;
  /** Output MIME type */
  mimeType?: string;
  /** JPEG/WebP quality 0-1 */
  quality?: number;
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
  const norm = normalizeRatio(
    srcW,
    srcH,
    format.aspectRatio,
    opts.ratioMethod ?? "auto",
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

  // 3. Render to canvas
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d")!;

  // Fill with pad colour first (visible if padding is used)
  ctx.fillStyle = opts.padColor ?? "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);

  if (norm.method === "crop") {
    // Draw cropped region scaled to full canvas
    ctx.drawImage(
      img,
      norm.cropX, norm.cropY, norm.cropWidth, norm.cropHeight,
      0, 0, targetW, targetH,
    );
  } else if (norm.method === "pad") {
    // Draw source centred within padded canvas
    const drawX = Math.round(norm.padLeft * (targetW / norm.outputWidth));
    const drawY = Math.round(norm.padTop * (targetH / norm.outputHeight));
    const drawW = Math.round(srcW * (targetW / norm.outputWidth));
    const drawH = Math.round(srcH * (targetH / norm.outputHeight));
    ctx.drawImage(img, 0, 0, srcW, srcH, drawX, drawY, drawW, drawH);
  } else {
    // No ratio correction needed — just scale
    ctx.drawImage(img, 0, 0, srcW, srcH, 0, 0, targetW, targetH);
  }

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
    width: targetW,
    height: targetH,
    tier,
    upscaleApplied,
    upscaleFactor: Math.round(upscaleFactor * 100) / 100,
    normalization: norm,
    printFormatId: opts.printFormatId,
  };
}

/**
 * Trigger a browser download of a print export blob.
 */
export function downloadPrintExport(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
