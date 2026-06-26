/**
 * Versioned image assets — source of truth for an image's original file
 * plus any number of upscaled variants.
 *
 * Backed by the `generated_image_assets` table:
 *   - `original`  (version_index = 0) — never deletable from the UI
 *   - `upscale`   (version_index >= 1) — soft-deletable via `deleted_at`
 *
 * The asset table is additive on top of the legacy fields on
 * `generated_images` (storage_path, enhanced_storage_path, etc.).
 * Existing fields stay untouched; new UI should rely on the asset list.
 */
import { supabase } from "@/integrations/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────
export type AssetType = "original" | "upscale";

export interface ImageAssetRow {
  id: string;
  generated_image_id: string;
  asset_type: AssetType;
  version_index: number;
  source_asset_id: string | null;
  storage_bucket: string;
  storage_path: string;
  width_px: number | null;
  height_px: number | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  upscale_method: string | null;
  scale_factor: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ImageAsset extends ImageAssetRow {
  /** Resolved public URL for the asset's storage object. */
  publicUrl: string;
}

// 12 K long-edge hard safety cap for any upscale we initiate.
export const MAX_LONG_EDGE_PX = 12_000;

// Replicate's Real-ESRGAN worker rejects inputs over ~2.1MP (the exact
// number from the GPU error is 2_096_704). We keep a small safety margin so
// the frontend blocks before the round-trip.
export const MAX_REALESRGAN_INPUT_PIXELS = 2_000_000;

// ── Pure helpers (no I/O, easy to unit test) ───────────────────────────

/** Sort assets ascending by version_index. */
export function sortAssetsByVersion<T extends { version_index: number }>(assets: T[]): T[] {
  return [...assets].sort((a, b) => a.version_index - b.version_index);
}

/** Filter out soft-deleted assets. */
export function activeAssets<T extends { deleted_at: string | null }>(assets: T[]): T[] {
  return assets.filter((a) => !a.deleted_at);
}

/** Latest upscale (highest version_index > 0) or null. */
export function latestUpscale<T extends ImageAssetRow>(assets: T[]): T | null {
  const upscales = activeAssets(assets).filter((a) => a.asset_type === "upscale");
  if (upscales.length === 0) return null;
  return sortAssetsByVersion(upscales)[upscales.length - 1];
}

/** Original (version 0) or null. */
export function originalAsset<T extends ImageAssetRow>(assets: T[]): T | null {
  return activeAssets(assets).find((a) => a.asset_type === "original" && a.version_index === 0) ?? null;
}

/**
 * Default version to show in the lightbox.
 * Latest upscale if present, otherwise original.
 */
export function defaultSelectedAsset<T extends ImageAssetRow>(assets: T[]): T | null {
  return latestUpscale(assets) ?? originalAsset(assets) ?? activeAssets(assets)[0] ?? null;
}

/** Next version index for a new upscale (max + 1; original is 0). */
export function nextVersionIndex<T extends { version_index: number; deleted_at: string | null }>(
  assets: T[],
): number {
  // Include soft-deleted rows when computing — keeps indices monotonic so
  // we don't collide if a deleted row is later restored manually.
  if (assets.length === 0) return 1;
  return Math.max(...assets.map((a) => a.version_index)) + 1;
}

/**
 * "Best available" = largest pixel area among active assets.
 * Falls back to latest upscale, then original, when dimensions are unknown.
 */
export function bestAvailableAsset<T extends ImageAssetRow>(assets: T[]): T | null {
  const active = activeAssets(assets);
  if (active.length === 0) return null;
  const measured = active.filter((a) => a.width_px && a.height_px);
  if (measured.length > 0) {
    return measured.reduce((best, cur) =>
      (cur.width_px! * cur.height_px!) > (best.width_px! * best.height_px!) ? cur : best,
    );
  }
  return latestUpscale(active) ?? originalAsset(active) ?? active[0];
}

/**
 * Friendly version label: "Original" or "Upscale N".
 */
export function versionLabel(asset: Pick<ImageAssetRow, "asset_type" | "version_index">): string {
  if (asset.asset_type === "original") return "Original";
  return `Upscale ${asset.version_index}`;
}

/**
 * Human-friendly source label for the "Upscale again" button.
 * Examples:
 *   "Source: Original · 1024×1024"
 *   "Source: Upscale 1 · 4096×4096"
 *   "Source: Original · dimensions unknown"
 */
export function formatSourceLabel(asset: ImageAssetRow): string {
  const base = versionLabel(asset);
  const dims = asset.width_px && asset.height_px
    ? `${asset.width_px}×${asset.height_px}`
    : "dimensions unknown";
  return `Source: ${base} · ${dims}`;
}

export interface UpscaleEstimate {
  /** Estimated output long edge in px, or null if source dims unknown. */
  estimatedLongEdge: number | null;
  /** Estimated output (width, height) or null. */
  estimatedWidth: number | null;
  estimatedHeight: number | null;
  /** True if estimated output would exceed the 12 K cap. */
  exceedsCap: boolean;
  /** True if we couldn't compute (no dims). */
  unknown: boolean;
  /** A short human warning string suitable for inline display, or null. */
  warning: string | null;
}

/**
 * Estimate output dimensions for an upscale.
 * Returns `exceedsCap=true` when the long edge would clear MAX_LONG_EDGE_PX.
 */
export function estimateUpscaleOutput(
  source: { width_px: number | null; height_px: number | null },
  scaleFactor: number,
  opts: { method?: "realesrgan" | "supir" | "tile" } = {},
): UpscaleEstimate {
  if (!source.width_px || !source.height_px) {
    return {
      estimatedLongEdge: null,
      estimatedWidth: null,
      estimatedHeight: null,
      exceedsCap: false,
      unknown: true,
      warning:
        "Source dimensions are unknown — we can't confirm this stays within the 12K safety limit.",
    };
  }
  const w = Math.round(source.width_px * scaleFactor);
  const h = Math.round(source.height_px * scaleFactor);
  const longEdge = Math.max(w, h);
  const exceedsCap = longEdge > MAX_LONG_EDGE_PX;

  // Input-pixel cap (Replicate Real-ESRGAN GPU limit). Only applies to the
  // non-tiled HD path; tiled SDXL chunks the input so it isn't limited the
  // same way.
  const inputPixels = source.width_px * source.height_px;
  const exceedsInputCap =
    opts.method === "realesrgan" && inputPixels > MAX_REALESRGAN_INPUT_PIXELS;

  const blocked = exceedsCap || exceedsInputCap;
  let warning: string | null = null;
  if (exceedsCap) {
    warning = `This upscale would exceed the ${MAX_LONG_EDGE_PX.toLocaleString()}px long-edge limit. Choose a smaller source, a lower upscale mode, or export from the best available version.`;
  } else if (exceedsInputCap) {
    const mp = (inputPixels / 1_000_000).toFixed(1);
    warning = `Selected source is ${mp}MP — too large for HD 4× (limit ~2MP). Pick a smaller version (e.g. Original), or use Tile 4× from this version.`;
  }
  return {
    estimatedLongEdge: longEdge,
    estimatedWidth: w,
    estimatedHeight: h,
    exceedsCap: blocked,
    unknown: false,
    warning,
  };
}

// ── Print readiness per version (50×70 cm default) ─────────────────────

const CM_PER_INCH = 2.54;

export interface VersionPrintReadiness {
  /** Effective PPI at the requested print size, or null if unknown. */
  ppi: number | null;
  /** True when PPI >= 280 (treat as 300). */
  printReady: boolean;
  /** Plain-English message ready to render. */
  message: string;
}

/**
 * Compute per-version print readiness against a print format (default 50×70 cm).
 */
export function getVersionPrintReadiness(
  asset: Pick<ImageAssetRow, "width_px" | "height_px">,
  opts: { widthCm?: number; heightCm?: number; label?: string } = {},
): VersionPrintReadiness {
  const widthCm = opts.widthCm ?? 50;
  const heightCm = opts.heightCm ?? 70;
  const label = opts.label ?? `${widthCm}×${heightCm} cm`;

  if (!asset.width_px || !asset.height_px) {
    return {
      ppi: null,
      printReady: false,
      message: `${label}: dimensions unknown — cannot estimate PPI yet.`,
    };
  }

  const wInch = widthCm / CM_PER_INCH;
  const hInch = heightCm / CM_PER_INCH;
  const ppi = Math.round(Math.min(asset.width_px / wInch, asset.height_px / hInch));

  if (ppi >= 280) {
    return { ppi, printReady: true, message: `${label}: ${ppi} PPI — print ready.` };
  }
  return {
    ppi,
    printReady: false,
    message: `${label}: ${ppi} PPI — below 300 PPI, another upscale may help.`,
  };
}

// ── Delete rules ────────────────────────────────────────────────────────

/** Original (version 0) can never be deleted. Upscales can. */
export function canDeleteAsset(asset: Pick<ImageAssetRow, "asset_type" | "version_index">): boolean {
  return !(asset.asset_type === "original" || asset.version_index === 0);
}

/**
 * After deleting `deletedId`, pick the next selected version:
 *   - latest remaining upscale, else original.
 */
export function pickNextSelectionAfterDelete<T extends ImageAssetRow>(
  assets: T[],
  deletedId: string,
): T | null {
  const remaining = assets.filter((a) => a.id !== deletedId && !a.deleted_at);
  return latestUpscale(remaining) ?? originalAsset(remaining) ?? remaining[0] ?? null;
}

// ── Supabase I/O ────────────────────────────────────────────────────────

function publicUrlFor(bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

function hydrate(rows: ImageAssetRow[]): ImageAsset[] {
  return sortAssetsByVersion(rows).map((r) => ({
    ...r,
    publicUrl: publicUrlFor(r.storage_bucket, r.storage_path),
  }));
}

/**
 * Fetch all NON-DELETED asset versions for a given generated image,
 * sorted by version_index ascending and pre-resolved with public URLs.
 */
export async function fetchImageAssets(generatedImageId: string): Promise<ImageAsset[]> {
  const { data, error } = await (supabase as any)
    .from("generated_image_assets")
    .select("*")
    .eq("generated_image_id", generatedImageId)
    .is("deleted_at", null)
    .order("version_index", { ascending: true });

  if (error) throw error;
  return hydrate((data ?? []) as ImageAssetRow[]);
}

/**
 * Bulk upscale-count fetch for the gallery grid badges.
 * Returns a Map<generated_image_id, upscaleCount> (non-deleted upscales only).
 */
export async function fetchUpscaleCounts(
  generatedImageIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (generatedImageIds.length === 0) return out;
  const { data, error } = await (supabase as any)
    .from("generated_image_assets")
    .select("generated_image_id, asset_type, deleted_at")
    .in("generated_image_id", generatedImageIds)
    .eq("asset_type", "upscale")
    .is("deleted_at", null);
  if (error) {
    console.warn("[fetchUpscaleCounts] failed:", error);
    return out;
  }
  for (const row of (data ?? []) as Array<{ generated_image_id: string }>) {
    out.set(row.generated_image_id, (out.get(row.generated_image_id) ?? 0) + 1);
  }
  return out;
}

/**
 * Lazy safety: if a generated_image has NO original asset row yet
 * (legacy data the backfill missed), create one from its storage_path.
 * Returns the created asset, or null if there's nothing to ensure.
 */
export async function ensureOriginalAssetForImage(img: {
  id: string;
  storage_path?: string | null;
  original_storage_path?: string | null;
  actual_width_px?: number | null;
  actual_height_px?: number | null;
  base_width_px?: number | null;
  base_height_px?: number | null;
}): Promise<ImageAsset | null> {
  const storagePath = img.original_storage_path || img.storage_path;
  if (!storagePath) return null;

  const existing = await fetchImageAssets(img.id);
  const hasOriginal = existing.some(
    (a) => a.asset_type === "original" && a.version_index === 0,
  );
  if (hasOriginal) {
    return existing.find((a) => a.asset_type === "original") ?? null;
  }

  const insertRow = {
    generated_image_id: img.id,
    asset_type: "original" as const,
    version_index: 0,
    source_asset_id: null,
    storage_bucket: "generated-images",
    storage_path: storagePath,
    width_px: img.base_width_px ?? img.actual_width_px ?? null,
    height_px: img.base_height_px ?? img.actual_height_px ?? null,
    mime_type: "image/png",
  };
  const { data, error } = await (supabase as any)
    .from("generated_image_assets")
    .insert(insertRow)
    .select("*")
    .single();
  if (error) throw error;
  return {
    ...(data as ImageAssetRow),
    publicUrl: publicUrlFor("generated-images", storagePath),
  };
}



/**
 * Probe an image URL in the browser and return its natural dimensions, or
 * null if it can't be decoded. Uses an off-DOM <img> element so it works
 * for any URL the browser can fetch (CORS rules permitting).
 */
export async function probeImageDimensions(
  url: string,
): Promise<{ width: number; height: number } | null> {
  if (typeof window === "undefined" || typeof Image === "undefined") return null;
  return await new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w > 0 && h > 0) resolve({ width: w, height: h });
      else resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Persist measured dimensions back onto an asset row when they were missing
 * (e.g. legacy upscales saved before the provider reported width/height).
 */
export async function updateAssetDimensions(
  assetId: string,
  width: number,
  height: number,
): Promise<void> {
  const { error } = await (supabase as any)
    .from("generated_image_assets")
    .update({ width_px: width, height_px: height })
    .eq("id", assetId);
  if (error) throw error;
}


// ── Upload helpers ──────────────────────────────────────────────────────

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/png";
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function fetchAsBlob(url: string): Promise<Blob> {
  if (url.startsWith("data:")) return dataUrlToBlob(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch upscale source (${res.status})`);
  return await res.blob();
}

export interface SaveUpscaleAssetInput {
  generatedImageId: string;
  sourceAssetId: string | null;
  /** A data URL, remote URL, or storage public URL holding the upscaled output. */
  imageUrl: string;
  width?: number | null;
  height?: number | null;
  method?: string | null;
  scaleFactor?: number | null;
  mimeType?: string;
}

/**
 * Persist an upscaled image as a new asset version.
 *
 *   1. Fetch/decode the source URL into a Blob (handles both data URLs and
 *      remote provider URLs — Replicate output, signed URLs, etc.).
 *   2. Upload to `generated-images` bucket under a stable namespace:
 *        upscales/{generated_image_id}/v{N}-{timestamp}.png
 *   3. Insert a `generated_image_assets` row at the next free version_index.
 */
export async function saveUpscaleAsset(
  input: SaveUpscaleAssetInput,
): Promise<ImageAsset> {
  // Compute version index including any soft-deleted rows for monotonicity.
  const { data: allRows } = await (supabase as any)
    .from("generated_image_assets")
    .select("version_index, deleted_at")
    .eq("generated_image_id", input.generatedImageId);
  const rows = (allRows ?? []) as Array<{
    version_index: number;
    deleted_at: string | null;
  }>;
  const versionIdx = nextVersionIndex(rows);


  const blob = await fetchAsBlob(input.imageUrl);
  const mime = input.mimeType || blob.type || "image/png";
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
  const path = `upscales/${input.generatedImageId}/v${versionIdx}-${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("generated-images")
    .upload(path, blob, { contentType: mime });
  if (uploadErr) throw uploadErr;

  const insertRow = {
    generated_image_id: input.generatedImageId,
    asset_type: "upscale" as const,
    version_index: versionIdx,
    source_asset_id: input.sourceAssetId,
    storage_bucket: "generated-images",
    storage_path: path,
    width_px: input.width ?? null,
    height_px: input.height ?? null,
    mime_type: mime,
    file_size_bytes: blob.size ?? null,
    upscale_method: input.method ?? null,
    scale_factor: input.scaleFactor ?? null,
  };
  const { data, error } = await (supabase as any)
    .from("generated_image_assets")
    .insert(insertRow)
    .select("*")
    .single();
  if (error) {
    // Best-effort orphan cleanup
    await supabase.storage.from("generated-images").remove([path]).catch(() => {});
    throw error;
  }
  return {
    ...(data as ImageAssetRow),
    publicUrl: publicUrlFor("generated-images", path),
  };
}

/**
 * Soft-delete an upscale asset. Originals are protected — attempting to
 * delete one throws synchronously before any DB call.
 */
export async function deleteUpscaleAsset(asset: ImageAssetRow): Promise<void> {
  if (!canDeleteAsset(asset)) {
    throw new Error("Original version cannot be deleted.");
  }
  const { error } = await (supabase as any)
    .from("generated_image_assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", asset.id);
  if (error) throw error;
}
