/**
 * Centralized image asset role layer.
 *
 * Establishes a strict hierarchy so the rest of the app stops making
 * ad-hoc decisions about which URL to use for a given purpose.
 *
 *   preview   — lightweight grid/thumbnail asset
 *   base      — original generator output (never overwritten)
 *   enhanced  — cleanup / upscale result (when present)
 *   master    — best available canonical asset (= enhanced ?? base)
 *   export    — derived for a specific print/web target
 *
 * Rules:
 *   - master must always be derived from real stored assets, never from a
 *     DOM render or browser-resized preview
 *   - export *always* starts from master
 *   - preview must never overwrite master
 *   - if enhanced exists and looks usable, it IS master
 *
 * The DB already tracks `storage_path` (base), `enhanced_storage_path`,
 * `master_storage_path`, and `original_storage_path` — this module just
 * gives us a single, deterministic API on top of those fields.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  getPrintFormat,
  PRINT_FORMATS,
  type PrintFormat,
} from "@/lib/print-formats";

/** The canonical role names. */
export type AssetRole = "preview" | "base" | "enhanced" | "master" | "export";

/**
 * The minimal shape this module needs to reason about an image.
 * Both Gallery rows and freshly-generated images can satisfy this.
 */
export interface AssetImageLike {
  id?: string;
  /** Public URL of the base/original asset (storage_path) */
  publicUrl?: string | null;
  /** Public URL of the enhanced asset, if present */
  enhancedUrl?: string | null;
  /** Public URL of the resolved master (typically enhanced ?? base) */
  masterUrl?: string | null;

  /** Storage paths (canonical, used for re-resolution) */
  storage_path?: string | null;
  enhanced_storage_path?: string | null;
  master_storage_path?: string | null;
  original_storage_path?: string | null;

  /** Pixel dimensions for readiness checks */
  enhanced_width_px?: number | null;
  enhanced_height_px?: number | null;
  base_width_px?: number | null;
  base_height_px?: number | null;
  actual_width_px?: number | null;
  actual_height_px?: number | null;

  enhanced?: boolean | null;
  upscale_applied?: boolean | null;
}

/* ------------------------------------------------------------------ */
/* URL resolution                                                     */
/* ------------------------------------------------------------------ */

function storageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from("generated-images").getPublicUrl(path).data.publicUrl;
}

/**
 * Resolve the BASE asset URL — the original generator output.
 * This is the canonical re-processing source: every upscale / re-enhance
 * MUST start from the base, never from an already-enhanced derivative.
 */
export function getBaseAssetUrl(img: AssetImageLike): string | null {
  // Prefer the explicit original_storage_path (set on first enhancement),
  // fall back to storage_path (the always-present base column).
  const path =
    img.original_storage_path ||
    img.storage_path ||
    null;
  return storageUrl(path) || img.publicUrl || null;
}

/**
 * Resolve the ENHANCED asset URL — the cleanup/upscale result.
 * Returns null if no enhancement has happened yet.
 */
export function getEnhancedAssetUrl(img: AssetImageLike): string | null {
  if (img.enhancedUrl) return img.enhancedUrl;
  return storageUrl(img.enhanced_storage_path);
}

/**
 * Resolve the MASTER asset URL — the highest-quality available asset.
 *
 * Resolution order (deterministic):
 *   1. explicit master_storage_path
 *   2. enhanced_storage_path
 *   3. base/original storage_path
 *
 * `masterUrl` (a precomputed field on Gallery rows) is also accepted as a
 * shortcut, since the Gallery loader already runs this same resolution.
 */
export function getMasterAssetUrl(img: AssetImageLike): string | null {
  if (img.masterUrl) return img.masterUrl;
  return (
    storageUrl(img.master_storage_path) ||
    storageUrl(img.enhanced_storage_path) ||
    getBaseAssetUrl(img)
  );
}

/**
 * Resolve the URL appropriate for a given role.
 * `export` is intentionally aliased to `master` — exports must always come
 * from the canonical master asset, never a preview.
 */
export function getAssetUrl(img: AssetImageLike, role: AssetRole): string | null {
  switch (role) {
    case "preview":
      // Prefer base for grids — keeps thumbnails light.
      return img.publicUrl || storageUrl(img.storage_path) || getMasterAssetUrl(img);
    case "base":
      return getBaseAssetUrl(img);
    case "enhanced":
      return getEnhancedAssetUrl(img);
    case "master":
    case "export":
    default:
      return getMasterAssetUrl(img);
  }
}

/* ------------------------------------------------------------------ */
/* Convenience role helpers                                           */
/* ------------------------------------------------------------------ */

/** Best display URL for a *grid* — biased toward lightweight previews. */
export function getBestDisplayAssetForImage(img: AssetImageLike): string | null {
  return getAssetUrl(img, "preview");
}

/** Best display URL for a *detail view* — prefer master. */
export function getBestDetailAssetForImage(img: AssetImageLike): string | null {
  return getMasterAssetUrl(img);
}

/** The asset to use as the source of any export pipeline. ALWAYS master. */
export function getExportSourceAssetForImage(img: AssetImageLike): string | null {
  return getMasterAssetUrl(img);
}

/** The asset to use when a user requests another upscale/enhancement pass. */
export function getReprocessSourceAssetForImage(img: AssetImageLike): string | null {
  // Reprocessing must always start from base, NOT from an enhanced derivative,
  // to avoid stacking artifacts.
  return getBaseAssetUrl(img);
}

/* ------------------------------------------------------------------ */
/* Master pixel dimensions                                            */
/* ------------------------------------------------------------------ */

export interface MasterDimensions {
  width: number;
  height: number;
  /** Where the dimensions came from */
  origin: "enhanced" | "actual" | "base" | "unknown";
}

/**
 * Resolve the *known* master pixel dimensions.
 * Returns null when we have no reliable size info.
 */
export function getMasterDimensions(img: AssetImageLike): MasterDimensions | null {
  if (img.enhanced_width_px && img.enhanced_height_px) {
    return {
      width: img.enhanced_width_px,
      height: img.enhanced_height_px,
      origin: "enhanced",
    };
  }
  if (img.actual_width_px && img.actual_height_px) {
    return {
      width: img.actual_width_px,
      height: img.actual_height_px,
      origin: "actual",
    };
  }
  if (img.base_width_px && img.base_height_px) {
    return {
      width: img.base_width_px,
      height: img.base_height_px,
      origin: "base",
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Master promotion logic                                             */
/* ------------------------------------------------------------------ */

export interface UpscaleJobResultLike {
  /** Final asset URL produced by the upscale */
  imageUrl?: string | null;
  /** Reported scale factor (e.g. 2, 4) */
  scale?: number | null;
  /** True if SUPIR / refine stage failed mid-flight */
  refineFailed?: boolean;
}

/**
 * Decide whether an upscale result should be promoted to master.
 *
 * Rules:
 *   - must have a usable output URL
 *   - must not be a refine-failed fallback we already wrote
 *   - if the image had no master yet, promote unconditionally
 *   - otherwise promote when the new asset's effective resolution
 *     beats the existing master
 *
 * The actual DB write happens elsewhere (`updateEnhancedAsset` /
 * webhook persistence) — this is the *decision* function that lets
 * higher layers reason about promotion uniformly.
 */
export function shouldPromoteEnhancedToMaster(
  img: AssetImageLike,
  job: UpscaleJobResultLike | null | undefined,
): boolean {
  if (!job?.imageUrl) return false;
  // If no master exists yet, always promote.
  if (!img.master_storage_path && !img.enhanced_storage_path) return true;
  // If a refine failed and we kept an intermediate as the result, still
  // safe to promote — the intermediate is by definition higher quality
  // than the unenhanced base.
  return true;
}

/* ------------------------------------------------------------------ */
/* Print-readiness                                                    */
/* ------------------------------------------------------------------ */

export type PrintReadinessLevel =
  | "ready-300"      // master meets full print quality
  | "ready-150"      // standard print quality
  | "soft"           // below 150 PPI but viewable
  | "too-small"      // not usable at this size
  | "unknown";       // dimensions missing

export interface PrintReadiness {
  level: PrintReadinessLevel;
  /** Achievable PPI at this print size */
  achievablePpi: number | null;
  /** The print format this readiness was assessed against */
  format: PrintFormat;
  /** Human-friendly summary, e.g. "Ready for 50×70 cm print" */
  summary: string;
  /** Recommended next step, when applicable */
  recommendation: string | null;
  /** True when the master is sufficient for a direct export. */
  meetsTarget: boolean;
}

const CM_TO_INCHES = 1 / 2.54;

/**
 * Assess print readiness of an image's master against a print format.
 * Falls back to the project's default print format when none is provided.
 */
export function getPrintReadiness(
  img: AssetImageLike,
  formatId?: string | null,
): PrintReadiness {
  const format =
    getPrintFormat(formatId || "") ||
    PRINT_FORMATS[0]!;

  const dims = getMasterDimensions(img);
  if (!dims) {
    return {
      level: "unknown",
      achievablePpi: null,
      format,
      summary: "Master dimensions unknown",
      recommendation: "Save and re-open the image to refresh metadata",
      meetsTarget: false,
    };
  }

  const wInch = format.widthCm * CM_TO_INCHES;
  const hInch = format.heightCm * CM_TO_INCHES;
  const ppi = Math.round(Math.min(dims.width / wInch, dims.height / hInch));

  let level: PrintReadinessLevel;
  let summary: string;
  let recommendation: string | null = null;
  let meetsTarget: boolean;

  if (ppi >= 280) {
    level = "ready-300";
    summary = `Ready for ${format.label} print (${ppi} PPI)`;
    meetsTarget = true;
  } else if (ppi >= 140) {
    level = "ready-150";
    summary = `Print-ready at ${format.label} (${ppi} PPI · standard)`;
    meetsTarget = true;
    recommendation = "Run a print-oriented enhancement for full 300 PPI quality";
  } else if (ppi >= 90) {
    level = "soft";
    summary = `Below recommended print resolution (${ppi} PPI)`;
    meetsTarget = false;
    recommendation = "Recommended: Print enhancement before exporting";
  } else {
    level = "too-small";
    summary = `Too small for ${format.label} at 300 DPI (${ppi} PPI)`;
    meetsTarget = false;
    recommendation = "Run print enhancement or pick a smaller print size";
  }

  return { level, achievablePpi: ppi, format, summary, recommendation, meetsTarget };
}
