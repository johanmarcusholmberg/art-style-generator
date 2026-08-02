/**
 * Turn 4A integration — the single shared asset-graph loader.
 *
 * `buildAssetGraph` is pure (fully unit-testable); `loadAssetGraph` is the
 * only place that reads the live persisted rows. Nothing else may assemble a
 * deletion graph — component state is never trusted as lineage truth.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AssetGraph, AssetRecord } from "./model";

export const DEFAULT_BUCKET = "generated-images";

export interface RawRootRow {
  id: string;
  storage_path: string | null;
  master_storage_path: string | null;
  enhanced_storage_path: string | null;
  original_storage_path: string | null;
  master_width: number | null;
  master_height: number | null;
  actual_width_px: number | null;
  actual_height_px: number | null;
  admin_status: string | null;
  deleted_at: string | null;
  created_at?: string | null;
  generation_job_id?: string | null;
  generation_job_item_id?: string | null;
}

export interface RawAssetRow {
  id: string;
  generated_image_id: string;
  asset_type: string;
  version_index: number;
  source_asset_id: string | null;
  storage_bucket: string | null;
  storage_path: string;
  width_px: number | null;
  height_px: number | null;
  deleted_at: string | null;
  created_at?: string | null;
}

export interface RawGraphData {
  root: RawRootRow;
  assets: RawAssetRow[];
  memberships: { id: string; collection_id: string }[];
  anchorCollectionIds: string[];
  jobItemIds?: string[];
}

function roleFor(assetType: string): AssetRecord["role"] {
  return assetType === "upscale" ? "upscaled_master" : "original";
}

/**
 * Map persisted rows onto the Turn 4A lineage model.
 *
 * Canonical selection mirrors what the product actually reads: the root's
 * `master_storage_path` (falling back to `storage_path`). Whichever live
 * version row owns that object is the canonical master; when no version row
 * owns it, the root record itself carries canonical identity.
 */
export function buildAssetGraph(raw: RawGraphData): AssetGraph {
  const { root } = raw;
  const canonicalPath = root.master_storage_path || root.storage_path || null;

  const rootRecord: AssetRecord = {
    id: root.id,
    rootImageId: root.id,
    parentAssetId: null,
    role: "original",
    bucket: DEFAULT_BUCKET,
    path: canonicalPath,
    width: root.master_width ?? root.actual_width_px ?? null,
    height: root.master_height ?? root.actual_height_px ?? null,
    isCanonical: false,
    archivedAt: root.admin_status === "archived" ? (root.created_at ?? "archived") : null,
    deletedAt: root.deleted_at ?? null,
    generationJobId: root.generation_job_id ?? null,
    generationJobItemId: root.generation_job_item_id ?? null,
    createdAt: root.created_at ?? null,
  };

  const assetRecords: AssetRecord[] = raw.assets.map((a) => ({
    id: a.id,
    rootImageId: root.id,
    // Top-level version rows hang off the root so a root delete can never be
    // silently downgraded to a leaf delete.
    parentAssetId: a.source_asset_id ?? root.id,
    role: roleFor(a.asset_type),
    bucket: a.storage_bucket || DEFAULT_BUCKET,
    path: a.storage_path,
    width: a.width_px,
    height: a.height_px,
    isCanonical: false,
    archivedAt: null,
    deletedAt: a.deleted_at,
    createdAt: a.created_at ?? null,
  }));

  const canonicalAsset =
    canonicalPath == null
      ? null
      : (assetRecords.find((a) => !a.deletedAt && a.path === canonicalPath) ?? null);

  if (canonicalAsset) canonicalAsset.isCanonical = true;
  else rootRecord.isCanonical = true;

  return {
    rootImageId: root.id,
    assets: [rootRecord, ...assetRecords],
    collectionMemberships: raw.memberships.map((m) => ({
      collectionId: m.collection_id,
      membershipId: m.id,
    })),
    anchorReferences: raw.anchorCollectionIds.map((collectionId) => ({ collectionId })),
  };
}

/** Count live rows (versions + root pointers) referencing each storage path. */
export function storageReferenceCounts(raw: RawGraphData): Record<string, number> {
  const counts: Record<string, number> = {};
  const bump = (p: string | null | undefined) => {
    if (!p) return;
    counts[p] = (counts[p] ?? 0) + 1;
  };
  if (!raw.root.deleted_at) {
    for (const p of [
      raw.root.storage_path,
      raw.root.master_storage_path,
      raw.root.enhanced_storage_path,
      raw.root.original_storage_path,
    ]) bump(p);
  }
  for (const a of raw.assets) if (!a.deleted_at) bump(a.storage_path);
  return counts;
}

/** Load everything the planner needs, straight from persisted truth. */
export async function loadRawGraphData(rootImageId: string): Promise<RawGraphData> {
  const [rootRes, assetsRes, memberRes, anchorRes] = await Promise.all([
    supabase.from("generated_images").select("*").eq("id", rootImageId).maybeSingle(),
    supabase
      .from("generated_image_assets")
      .select("*")
      .eq("generated_image_id", rootImageId)
      .order("version_index", { ascending: true }),
    supabase.from("collection_images").select("id, collection_id").eq("image_id", rootImageId),
    supabase.from("collections").select("id").eq("anchor_image_id", rootImageId),
  ]);

  if (rootRes.error) throw rootRes.error;
  if (!rootRes.data) throw new Error("Gallery image not found.");

  return {
    root: rootRes.data as unknown as RawRootRow,
    assets: (assetsRes.data ?? []) as unknown as RawAssetRow[],
    memberships: (memberRes.data ?? []) as { id: string; collection_id: string }[],
    anchorCollectionIds: ((anchorRes.data ?? []) as { id: string }[]).map((c) => c.id),
  };
}

export async function loadAssetGraph(rootImageId: string): Promise<AssetGraph> {
  return buildAssetGraph(await loadRawGraphData(rootImageId));
}
