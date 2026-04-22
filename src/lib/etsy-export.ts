/**
 * Etsy export pipeline.
 *
 * Takes a master image URL and produces a ZIP bundle containing every size
 * defined by an `ExportTemplate`. Each output file is rendered at the
 * exact pixel dimensions for its physical size + DPI.
 *
 * Composition rules:
 *   - never crop the artwork (default fit=contain)
 *   - optional uniform white border that *expands* the canvas, never crops
 *   - resize is image-based (canvas drawImage), not a DOM screenshot
 *
 * The pipeline is deliberately master-aware: the caller is expected to
 * resolve `getExportSourceAssetForImage(image)` from `image-assets.ts`
 * before invoking this module.
 */
import JSZip from "jszip";
import {
  buildExportFileName,
  flattenTemplateSizes,
  ratioFolderName,
  type ExportSize,
  type ExportTemplate,
} from "@/lib/export-templates";

/* ------------------------------------------------------------------ */
/* Image loading                                                      */
/* ------------------------------------------------------------------ */

function loadImage(src: string, timeoutMs = 60000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const t = setTimeout(() => {
      img.src = "";
      reject(new Error("Source image load timed out — please try again"));
    }, timeoutMs);
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => {
      clearTimeout(t);
      reject(new Error("Failed to load source image — it may be unavailable"));
    };
    img.src = src;
  });
}

/* ------------------------------------------------------------------ */
/* Render one size                                                    */
/* ------------------------------------------------------------------ */

export interface RenderSizeOptions {
  /** Add a uniform white border around the artwork (expands canvas). */
  withBorder?: boolean;
  /** Border width as a fraction of the *short* side (e.g. 0.04 = 4%). */
  borderRatio?: number;
  /** Background colour shown when fitting / bordering. */
  backgroundColor?: string;
  /** JPEG quality 0..1 */
  quality?: number;
  /** Output mime type — JPEG keeps the ZIP small */
  mimeType?: string;
}

/**
 * Render a single ExportSize to a Blob.
 *
 * Strategy:
 *   1. Compute target pixel canvas (size.pixelWidth × size.pixelHeight).
 *   2. Fit the source image *inside* that canvas (contain), preserving aspect.
 *   3. If `withBorder`, shrink the artwork further so a uniform white margin
 *      surrounds it.
 *   4. Encode as JPEG (default) for predictable Etsy-friendly file sizes.
 */
export async function renderSizeToBlob(
  source: HTMLImageElement,
  size: ExportSize,
  opts: RenderSizeOptions = {},
): Promise<Blob> {
  const {
    withBorder = false,
    borderRatio = 0.04,
    backgroundColor = "#ffffff",
    quality = 0.92,
    mimeType = "image/jpeg",
  } = opts;

  const targetW = size.pixelWidth;
  const targetH = size.pixelHeight;

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable in this browser");

  // Background (visible behind any letterbox / border)
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, targetW, targetH);

  // Compute usable area (shrunk if we draw a border)
  const margin = withBorder
    ? Math.round(Math.min(targetW, targetH) * borderRatio)
    : 0;
  const innerW = targetW - margin * 2;
  const innerH = targetH - margin * 2;

  // Contain-fit: scale source so it fits inside the inner area without crop
  const srcW = source.naturalWidth;
  const srcH = source.naturalHeight;
  const scale = Math.min(innerW / srcW, innerH / srcH);
  const drawW = Math.round(srcW * scale);
  const drawH = Math.round(srcH * scale);
  const drawX = margin + Math.round((innerW - drawW) / 2);
  const drawY = margin + Math.round((innerH - drawH) / 2);

  // Slightly better resampling on large downscales
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, srcW, srcH, drawX, drawY, drawW, drawH);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))),
      mimeType,
      quality,
    );
  });
}

/* ------------------------------------------------------------------ */
/* Bundle export                                                      */
/* ------------------------------------------------------------------ */

export interface EtsyExportOptions {
  /** URL of the master asset (resolve via getExportSourceAssetForImage) */
  masterUrl: string;
  /** Template to render */
  template: ExportTemplate;
  /** Add a uniform white border to every file in the bundle */
  withBorder?: boolean;
  /** Optional progress callback (0..1) */
  onProgress?: (done: number, total: number, current?: ExportSize) => void;
  /** Render options shared across sizes */
  render?: Omit<RenderSizeOptions, "withBorder">;
}

export interface EtsyExportResult {
  blob: Blob;
  fileName: string;
  /** Sizes successfully rendered */
  rendered: ExportSize[];
  /** Sizes that failed to render */
  failed: { size: ExportSize; error: string }[];
  /** Total uncompressed bytes (for diagnostics) */
  approxBytes: number;
}

function safeFileSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Run the full export pipeline and return a ZIP blob ready for download.
 */
export async function buildEtsyExportBundle(
  opts: EtsyExportOptions,
): Promise<EtsyExportResult> {
  if (!opts.masterUrl) throw new Error("No master asset available for export");

  const source = await loadImage(opts.masterUrl);
  const zip = new JSZip();
  const allSizes = flattenTemplateSizes(opts.template);
  const total = allSizes.length;
  const rendered: ExportSize[] = [];
  const failed: { size: ExportSize; error: string }[] = [];
  let bytes = 0;
  let done = 0;

  for (const group of opts.template.ratios) {
    const folder = zip.folder(ratioFolderName(group));
    if (!folder) continue;
    for (const size of group.sizes) {
      try {
        opts.onProgress?.(done, total, size);
        const blob = await renderSizeToBlob(source, size, {
          ...opts.render,
          withBorder: !!opts.withBorder,
        });
        const ext = (opts.render?.mimeType ?? "image/jpeg").split("/")[1] ?? "jpg";
        const fileName = buildExportFileName(size, {
          ext: ext === "jpeg" ? "jpg" : ext,
          withBorder: opts.withBorder,
        });
        folder.file(fileName, blob);
        rendered.push(size);
        bytes += blob.size;
      } catch (err) {
        failed.push({
          size,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        done += 1;
        opts.onProgress?.(done, total, size);
      }
    }
  }

  // Lightweight README so buyers know what they got
  zip.file(
    "README.txt",
    [
      `${opts.template.label}`,
      "",
      opts.template.description,
      "",
      `All files are ${opts.template.defaultDpi} DPI, ready for high-quality printing.`,
      opts.withBorder
        ? "Each file includes a uniform white border for framing."
        : "Files are full-bleed within their target pixel dimensions.",
      "",
      "Included sizes:",
      ...opts.template.ratios.flatMap((g) => [
        `  ${g.label}:`,
        ...g.sizes.map(
          (s) => `    - ${s.label}  (${s.pixelWidth} × ${s.pixelHeight} px)`,
        ),
      ]),
    ].join("\n"),
  );

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const fileName = `${safeFileSegment(opts.template.id)}_${
    opts.withBorder ? "bordered_" : ""
  }${Date.now()}.zip`;

  return { blob, fileName, rendered, failed, approxBytes: bytes };
}

/** Trigger a browser download for an export bundle. */
export function downloadExportBundle(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Readiness assessment                                               */
/* ------------------------------------------------------------------ */

export interface TemplateReadiness {
  /** True when the master meets every size in the template at full DPI */
  meetsAll: boolean;
  /** Sizes the master cannot meet at the template's DPI */
  underResolved: ExportSize[];
  /** Largest size the bundle requires */
  largest: ExportSize;
  /** Worst-case PPI achievable with the current master */
  worstCasePpi: number | null;
  /** Short summary suitable for display */
  summary: string;
  /** Recommendation if not fully ready */
  recommendation: string | null;
}

/**
 * Assess whether a master image (in pixels) is sufficient for an entire
 * Etsy template. Pure / synchronous — no DOM work.
 */
export function assessTemplateReadiness(
  template: ExportTemplate,
  masterWidth: number | null | undefined,
  masterHeight: number | null | undefined,
): TemplateReadiness {
  const sizes = flattenTemplateSizes(template);
  const largest = sizes.reduce((a, b) =>
    a.pixelWidth * a.pixelHeight > b.pixelWidth * b.pixelHeight ? a : b,
  );

  if (!masterWidth || !masterHeight) {
    return {
      meetsAll: false,
      underResolved: sizes,
      largest,
      worstCasePpi: null,
      summary: "Master dimensions unknown — readiness can't be evaluated.",
      recommendation: "Re-open the image to refresh metadata.",
    };
  }

  const masterShort = Math.min(masterWidth, masterHeight);
  const underResolved = sizes.filter(
    (s) => masterWidth < s.pixelWidth || masterHeight < s.pixelHeight,
  );
  const meetsAll = underResolved.length === 0;

  // Worst-case PPI = master short side mapped onto the largest physical short side.
  // We use inches via the size's own dpi to keep it simple.
  const largestShortPx = Math.min(largest.pixelWidth, largest.pixelHeight);
  const ratio = masterShort / largestShortPx;
  const worstCasePpi = Math.round(template.defaultDpi * ratio);

  let summary: string;
  let recommendation: string | null = null;

  if (meetsAll) {
    summary = `Ready to export — master meets all ${sizes.length} sizes at ${template.defaultDpi} DPI.`;
  } else if (worstCasePpi >= 150) {
    summary = `Will export at ~${worstCasePpi} PPI for the largest size (${largest.label}).`;
    recommendation = template.preferPrintRecipe
      ? "Recommended: run a Print enhancement first for full 300 DPI quality."
      : "Recommended: run an enhancement first for sharper print output.";
  } else {
    summary = `Master is too small for the largest size (${largest.label}) — ~${worstCasePpi} PPI.`;
    recommendation = "Recommended: run a Print enhancement before exporting.";
  }

  return {
    meetsAll,
    underResolved,
    largest,
    worstCasePpi,
    summary,
    recommendation,
  };
}
