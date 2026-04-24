/**
 * Asset selection — canonical entry point for "which URL do I use here?".
 *
 * This module is intentionally a thin, well-named API surface on top of
 * `image-assets.ts` so the rest of the app has ONE obvious place to import
 * from when it needs to make an asset-role decision.
 *
 * Strict rules (enforced by these helpers):
 *   - Gallery grids   → preview → enhanced → base
 *   - Detail views    → enhanced (master) → base
 *   - Exports         → MUST start from enhanced master, never from preview
 *   - Re-processing   → MUST start from base, never from an upscaled derivative
 *
 * If you find yourself reaching past these helpers and picking a URL by
 * hand, you're almost certainly about to introduce a regression — add the
 * decision here instead.
 */
import {
  getAssetUrl,
  getBaseAssetUrl,
  getEnhancedAssetUrl,
  getMasterAssetUrl,
  getBestDisplayAssetForImage,
  getBestDetailAssetForImage,
  getExportSourceAssetForImage,
  getReprocessSourceAssetForImage,
  type AssetImageLike,
  type AssetRole,
} from "@/lib/image-assets";

export type { AssetImageLike, AssetRole };

/** Grid / thumbnail. Lightest available asset. */
export const selectGalleryAsset = getBestDisplayAssetForImage;

/** Detail view (lightbox / generator preview). Prefers enhanced master. */
export const selectDetailAsset = getBestDetailAssetForImage;

/** Source for any export pipeline. ALWAYS the enhanced master if present. */
export const selectExportSourceAsset = getExportSourceAssetForImage;

/** Source for re-processing (re-enhance, re-upscale). ALWAYS the base. */
export const selectReprocessSourceAsset = getReprocessSourceAssetForImage;

/** Generic role-based selector — escape hatch for less common cases. */
export const selectAssetForRole = getAssetUrl;

/** Direct base / enhanced / master — only when the role is unambiguous. */
export const selectBaseAsset = getBaseAssetUrl;
export const selectEnhancedAsset = getEnhancedAssetUrl;
export const selectMasterAsset = getMasterAssetUrl;

/* ------------------------------------------------------------------ */
/* Status helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Compact lifecycle status used by the status-badges component.
 * Mirrors the user-facing labels: base / enhanced / print-ready / exported.
 */
export type AssetLifecycleStatus = {
  hasBase: boolean;
  hasEnhanced: boolean;
  hasExport: boolean;
};

export function getAssetLifecycleStatus(
  img: AssetImageLike & {
    enhanced_storage_path?: string | null;
    export_storage_path?: string | null;
    export_ready?: boolean | null;
  },
): AssetLifecycleStatus {
  return {
    hasBase: !!getBaseAssetUrl(img),
    hasEnhanced: !!(img.enhanced_storage_path || img.enhancedUrl),
    hasExport: !!(img.export_storage_path && img.export_ready),
  };
}

/**
 * Human-friendly explanation of which asset an export will use.
 * Surface this to the user before triggering the print export.
 */
export type ExportSourceDescription = {
  /** "enhanced" if we're using the upscaled master, otherwise "base". */
  source: "enhanced" | "base" | "missing";
  label: string;
  recommendation: string | null;
};

export function describeExportSource(
  img: AssetImageLike & { enhanced_storage_path?: string | null },
): ExportSourceDescription {
  if (img.enhanced_storage_path || img.enhancedUrl) {
    return {
      source: "enhanced",
      label: "Using enhanced master",
      recommendation: null,
    };
  }
  if (getBaseAssetUrl(img)) {
    return {
      source: "base",
      label: "Using base image — upscale recommended",
      recommendation: "Run \"Enhance for print\" to upgrade quality before exporting.",
    };
  }
  return {
    source: "missing",
    label: "No source asset available",
    recommendation: "Re-generate the image to restore its base asset.",
  };
}
