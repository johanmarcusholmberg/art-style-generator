/**
 * Turn 4A — canonical asset lifecycle model.
 *
 * This maps ONTO the existing schema; it introduces no database enum.
 *
 *   temporary             → in-memory blob:/data:/provider URL, no row yet
 *   original              → generated_image_assets(asset_type='original',
 *                           version_index=0) / generated_images.storage_path
 *   ratio_corrected_master→ generation_job_items.ratio_enforcement_status
 *                           = 'completed' + generated_images.master_storage_path
 *   upscaled_master       → generated_image_assets(asset_type='upscale')
 *   canonical_master      → the asset currently authoritative for print,
 *                           export, PPI and derivation
 *   format_derivative     → generated_images row with source_image_id +
 *                           target_format + crop metadata
 *   display_derivative    → render/image URL, never stored
 *   archived              → generated_images.admin_status='archived'
 *   deleted               → deleted_at set (soft) + confirmed object cleanup
 */

export type AssetLifecycleRole =
  | "temporary"
  | "original"
  | "ratio_corrected_master"
  | "upscaled_master"
  | "canonical_master"
  | "format_derivative"
  | "display_derivative"
  | "archived"
  | "deleted";

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Normalized view of one asset. Callers adapt their own rows
 * (generated_images, generated_image_assets, generation_job_items) into this.
 */
export interface AssetRecord {
  id: string;
  /** Owning gallery image (`generated_images.id`) — the lineage root. */
  rootImageId: string | null;
  /** Direct source asset (`source_asset_id` / `source_image_id`). */
  parentAssetId: string | null;
  role: AssetLifecycleRole;

  bucket: string | null;
  /** Bucket-relative object path (never a URL). */
  path: string | null;
  /** Any URL the row carries — validated, never trusted as identity. */
  url?: string | null;

  width: number | null;
  height: number | null;

  /** True when this row is the currently selected canonical master. */
  isCanonical?: boolean;
  archivedAt?: string | null;
  deletedAt?: string | null;

  generationJobId?: string | null;
  generationJobItemId?: string | null;

  sourceFormat?: string | null;
  targetFormat?: string | null;
  cropBox?: CropBox | null;
  /** Source pixel dimensions the crop box was computed against. */
  sourceWidth?: number | null;
  sourceHeight?: number | null;

  /** Ratio finalization / upscale completion status where relevant. */
  transformationStatus?:
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "not_required"
    | null;

  /** Verified existence of the storage object, when known. */
  storageObjectExists?: boolean | null;

  createdAt?: string | null;
}

/** A whole lineage graph for one gallery image. */
export interface AssetGraph {
  rootImageId: string;
  assets: AssetRecord[];
  /** Collection memberships referencing the root image. */
  collectionMemberships?: { collectionId: string; membershipId: string }[];
  /** Matching-collection anchor references to the root image. */
  anchorReferences?: { collectionId: string }[];
}

export function isLiveAsset(a: AssetRecord): boolean {
  return !a.deletedAt;
}

export function isUsableAsset(a: AssetRecord): boolean {
  return isLiveAsset(a) && !a.archivedAt;
}

export function hasValidDimensions(a: Pick<AssetRecord, "width" | "height">): boolean {
  return (
    typeof a.width === "number" &&
    typeof a.height === "number" &&
    Number.isFinite(a.width) &&
    Number.isFinite(a.height) &&
    a.width > 0 &&
    a.height > 0
  );
}
