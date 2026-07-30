/**
 * Web image delivery (Turn 3A).
 *
 * Presentation-only helper that maps a canonical persisted image to an
 * optimized Supabase Storage *render* URL for web display.
 *
 * Hard rules:
 *   - The canonical master remains the permanent source of truth. Nothing in
 *     this module writes, replaces, or persists anything.
 *   - Transformed URLs are NEVER valid for print, export, download, upscale,
 *     Matching Collection anchors, or regeneration lineage. Use
 *     `getCanonicalMasterUrl()` for those.
 *   - Local previews (blob:/data:) and un-persisted external provider URLs are
 *     passed through untouched — never sent to the transformation endpoint.
 *   - No cropping, padding, ratio correction, or orientation change. Poster
 *     format correction stays with the canonical finalization workflow.
 */

export type ImageDisplayPurpose = "thumbnail" | "preview" | "master";

export type ImageDisplaySourceKind =
  | "canonical_master"
  | "persisted_source"
  | "local_preview"
  | "external_source";

export interface ImageDisplayResult {
  url: string;
  purpose: ImageDisplayPurpose;
  sourceKind: ImageDisplaySourceKind;
  /** True only when the returned URL is a Supabase render-transformed URL. */
  transformed: boolean;
  /** True when the requested optimization could not be applied. */
  fallbackUsed: boolean;
  /** Development diagnostics: why a transformation was skipped. */
  reason?: string;
}

export interface DisplayPreset {
  maxLongEdge: number;
  quality: number;
}

export const DISPLAY_PRESETS: Record<"thumbnail" | "preview", DisplayPreset> = {
  thumbnail: { maxLongEdge: 500, quality: 80 },
  preview: { maxLongEdge: 1600, quality: 82 },
};

/**
 * Minimal shape needed to resolve canonical truth. Deliberately loose so
 * gallery rows, durable job items, and collection members can all satisfy it.
 */
export interface DisplayImageLike {
  /** Corrected/master public URL (post ratio-finalization), when known. */
  masterUrl?: string | null;
  /** Persisted original public URL. */
  publicUrl?: string | null;
  /** Any other URL the UI already holds (may be local or external). */
  url?: string | null;

  master_storage_path?: string | null;
  storage_path?: string | null;

  /** Ratio finalization status from the durable pipeline. */
  ratio_enforcement_status?: string | null;

  /** Canonical dimensions — used for long-edge orientation. */
  master_width?: number | null;
  master_height?: number | null;
  actual_width_px?: number | null;
  actual_height_px?: number | null;

  /** Linked gallery identity — required for corrected-master readiness. */
  gallery_image_id?: string | null;
  id?: string | null;
}

/* ------------------------------------------------------------------ */
/* URL classification                                                  */
/* ------------------------------------------------------------------ */

const OBJECT_PUBLIC = "/storage/v1/object/public/";
const RENDER_PUBLIC = "/storage/v1/render/image/public/";

export function isLocalPreviewUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return (
    url.startsWith("blob:") ||
    url.startsWith("data:") ||
    url.startsWith("objecturl:")
  );
}

/** True when the URL is a Supabase Storage public object URL we may transform. */
export function isTransformableStorageUrl(url: string | null | undefined): boolean {
  if (!url || isLocalPreviewUrl(url)) return false;
  return url.includes(OBJECT_PUBLIC) || url.includes(RENDER_PUBLIC);
}

/* ------------------------------------------------------------------ */
/* Canonical selection                                                 */
/* ------------------------------------------------------------------ */

function positive(n: number | null | undefined): boolean {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function canonicalDims(img: DisplayImageLike): { w: number; h: number } | null {
  if (positive(img.master_width) && positive(img.master_height)) {
    return { w: img.master_width!, h: img.master_height! };
  }
  if (positive(img.actual_width_px) && positive(img.actual_height_px)) {
    return { w: img.actual_width_px!, h: img.actual_height_px! };
  }
  return null;
}

/** Corrected canonical master is only usable with complete evidence. */
function hasCorrectedMasterEvidence(img: DisplayImageLike): boolean {
  if (img.ratio_enforcement_status !== "completed") return false;
  if (!img.master_storage_path && !img.masterUrl) return false;
  if (!canonicalDims(img)) return false;
  if (!img.gallery_image_id && !img.id) return false;
  return true;
}

export interface CanonicalSelection {
  url: string | null;
  sourceKind: ImageDisplaySourceKind;
}

/**
 * Select the canonical source for display, following Turn 2 truth rules.
 *
 *   A. corrected canonical master  (ratio finalization = completed + evidence)
 *   B. persisted original source   (not_required / pending, persisted path)
 *   C. temporary local preview     (blob/data — never transformed)
 *   D. external provider URL       (never transformed before persistence)
 */
export function selectCanonicalDisplaySource(
  img: DisplayImageLike,
): CanonicalSelection {
  if (hasCorrectedMasterEvidence(img)) {
    const url = img.masterUrl ?? img.publicUrl ?? img.url ?? null;
    if (url && !isLocalPreviewUrl(url)) {
      return { url, sourceKind: "canonical_master" };
    }
  }

  const persisted =
    (img.storage_path || img.master_storage_path
      ? img.publicUrl ?? img.masterUrl ?? null
      : null) ?? null;
  if (persisted && isTransformableStorageUrl(persisted)) {
    return { url: persisted, sourceKind: "persisted_source" };
  }

  const any = img.masterUrl ?? img.publicUrl ?? img.url ?? null;
  if (!any) return { url: null, sourceKind: "external_source" };
  if (isLocalPreviewUrl(any)) return { url: any, sourceKind: "local_preview" };
  if (isTransformableStorageUrl(any)) {
    return { url: any, sourceKind: "persisted_source" };
  }
  return { url: any, sourceKind: "external_source" };
}

/**
 * The canonical, full-resolution master URL. This is the ONLY value that may
 * be used for print, export, download, upscale, anchors, and regeneration.
 */
export function getCanonicalMasterUrl(img: DisplayImageLike): string | null {
  return img.masterUrl ?? img.publicUrl ?? img.url ?? null;
}

/* ------------------------------------------------------------------ */
/* Transformation URL builder                                          */
/* ------------------------------------------------------------------ */

/**
 * Build a deterministic Supabase render URL. Same source + same preset always
 * produces the same string — safe for browser caching and React rerenders.
 */
export function buildTransformedUrl(
  publicUrl: string,
  preset: DisplayPreset,
  dims?: { w: number; h: number } | null,
): string | null {
  if (!isTransformableStorageUrl(publicUrl)) return null;

  let base = publicUrl;
  // Normalize an already-rendered URL back to its object form, then re-render.
  if (base.includes(RENDER_PUBLIC)) {
    base = base.split("?")[0]!.replace(RENDER_PUBLIC, OBJECT_PUBLIC);
  }
  const [path, existingQuery] = base.split("?");
  const rendered = path!.replace(OBJECT_PUBLIC, RENDER_PUBLIC);

  const params = new URLSearchParams();
  if (dims && positive(dims.w) && positive(dims.h)) {
    // Constrain the LONG edge only; the other edge follows the aspect ratio.
    if (dims.w >= dims.h) params.set("width", String(preset.maxLongEdge));
    else params.set("height", String(preset.maxLongEdge));
  } else {
    // Unknown orientation: contain within a square box — still never crops.
    params.set("width", String(preset.maxLongEdge));
    params.set("height", String(preset.maxLongEdge));
  }
  params.set("resize", "contain");
  params.set("quality", String(preset.quality));

  // Preserve any pre-existing version marker on the canonical path.
  if (existingQuery) {
    const prev = new URLSearchParams(existingQuery);
    const v = prev.get("v") ?? prev.get("version");
    if (v) params.set("v", v);
  }

  return `${rendered}?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Resolve the URL to display for a given purpose.
 * Never throws; always returns a usable URL when any source exists.
 */
export function getImageDisplayUrl(
  img: DisplayImageLike,
  purpose: ImageDisplayPurpose,
): ImageDisplayResult {
  const { url, sourceKind } = selectCanonicalDisplaySource(img);

  if (!url) {
    return {
      url: "",
      purpose,
      sourceKind,
      transformed: false,
      fallbackUsed: true,
      reason: "no_source",
    };
  }

  if (purpose === "master") {
    return {
      url: getCanonicalMasterUrl(img) ?? url,
      purpose,
      sourceKind,
      transformed: false,
      fallbackUsed: false,
    };
  }

  if (sourceKind === "local_preview") {
    return {
      url,
      purpose,
      sourceKind,
      transformed: false,
      fallbackUsed: false,
      reason: "local_preview_not_transformed",
    };
  }

  if (sourceKind === "external_source") {
    return {
      url,
      purpose,
      sourceKind,
      transformed: false,
      fallbackUsed: true,
      reason: "external_source_not_persisted",
    };
  }

  const transformedUrl = buildTransformedUrl(
    url,
    DISPLAY_PRESETS[purpose],
    canonicalDims(img),
  );

  if (!transformedUrl) {
    return {
      url,
      purpose,
      sourceKind,
      transformed: false,
      fallbackUsed: true,
      reason: "not_transformable",
    };
  }

  return { url: transformedUrl, purpose, sourceKind, transformed: true, fallbackUsed: false };
}

/** Convenience: thumbnail URL string with canonical fallback. */
export function getThumbnailUrl(img: DisplayImageLike): string {
  return getImageDisplayUrl(img, "thumbnail").url;
}

/** Convenience: preview URL string with canonical fallback. */
export function getPreviewUrl(img: DisplayImageLike): string {
  return getImageDisplayUrl(img, "preview").url;
}

/**
 * Fallback for an <img onError> handler: given the transformed URL that
 * failed, return the canonical URL to retry with, or null if already
 * canonical (prevents infinite retry loops).
 */
export function getDisplayFallbackUrl(
  img: DisplayImageLike,
  failedUrl: string,
): string | null {
  if (!failedUrl.includes(RENDER_PUBLIC)) return null;
  const canonical = selectCanonicalDisplaySource(img).url;
  if (!canonical || canonical === failedUrl) return null;
  return canonical;
}

/** Wrap a plain URL string into the display pipeline (no metadata available). */
export function displayUrlFromString(
  url: string | null | undefined,
  purpose: ImageDisplayPurpose,
): ImageDisplayResult {
  return getImageDisplayUrl({ url: url ?? null, publicUrl: url ?? null }, purpose);
}
