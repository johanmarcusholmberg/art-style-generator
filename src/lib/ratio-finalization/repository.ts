/**
 * Canonical persisted-asset loader for a durable generation item.
 *
 * Reads DB truth (never local Canvas state) so the UI can adopt exactly
 * what the server has committed: the storage path, dimensions, and the
 * poster-format finalization state. Used to reconcile the generator's
 * on-screen preview after a completion or a queue outcome.
 */
import { supabase } from "@/integrations/supabase/client";

export interface DurableCanonicalAsset {
  itemId: string;
  itemStatus: string;
  ratioStatus: string | null;
  ratioLeaseExpiresAt: string | null;
  ratioError: string | null;
  finalizationOperation: string | null;
  storagePath: string | null;
  imageUrl: string | null;
  enforcedImageUrl: string | null;
  rawImageUrl: string | null;
  galleryImageId: string | null;
  masterStoragePath: string | null;
  masterWidth: number | null;
  masterHeight: number | null;
}

export async function loadDurableCanonicalAsset(
  itemId: string,
): Promise<DurableCanonicalAsset | null> {
  const { data: item, error } = await supabase
    .from("generation_job_items")
    .select(
      "id,status,ratio_enforcement_status,ratio_finalization_lease_expires_at,ratio_finalization_error,finalization_operation,storage_path,image_url,enforced_image_url,raw_image_url,gallery_image_id",
    )
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!item) return null;

  const row = item as unknown as {
    id: string;
    status: string;
    ratio_enforcement_status: string | null;
    ratio_finalization_lease_expires_at: string | null;
    ratio_finalization_error: string | null;
    finalization_operation: string | null;
    storage_path: string | null;
    image_url: string | null;
    enforced_image_url: string | null;
    raw_image_url: string | null;
    gallery_image_id: string | null;
  };

  let masterStoragePath: string | null = null;
  let masterWidth: number | null = null;
  let masterHeight: number | null = null;
  if (row.gallery_image_id) {
    const { data: gi } = await supabase
      .from("generated_images")
      .select("master_storage_path,storage_path,master_width,master_height,actual_width_px,actual_height_px")
      .eq("id", row.gallery_image_id)
      .maybeSingle();
    if (gi) {
      const g = gi as unknown as {
        master_storage_path: string | null; storage_path: string | null;
        master_width: number | null; master_height: number | null;
        actual_width_px: number | null; actual_height_px: number | null;
      };
      masterStoragePath = g.master_storage_path ?? g.storage_path ?? null;
      masterWidth = g.master_width ?? g.actual_width_px ?? null;
      masterHeight = g.master_height ?? g.actual_height_px ?? null;
    }
  }

  return {
    itemId: row.id,
    itemStatus: row.status,
    ratioStatus: row.ratio_enforcement_status,
    ratioLeaseExpiresAt: row.ratio_finalization_lease_expires_at,
    ratioError: row.ratio_finalization_error,
    finalizationOperation: row.finalization_operation,
    storagePath: row.storage_path,
    imageUrl: row.image_url,
    enforcedImageUrl: row.enforced_image_url,
    rawImageUrl: row.raw_image_url,
    galleryImageId: row.gallery_image_id,
    masterStoragePath,
    masterWidth,
    masterHeight,
  };
}
