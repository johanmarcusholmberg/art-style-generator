/**
 * Self-healing metadata repair for legacy / partially-persisted images.
 *
 * Newly generated images get complete metadata server-side (see
 * `supabase/functions/_shared/persist-generation-result.ts`). Rows created
 * before that invariant existed can still be missing actual pixel
 * dimensions or a canonical aspect ratio. Instead of teaching every UI
 * surface to tolerate nulls, we measure once from the real master and
 * write the truth back.
 */
import { supabase } from "@/integrations/supabase/client";
import { loadImageDimensions } from "@/lib/image-metadata";
import { canonicalAspectRatio } from "@/lib/generation-metadata-invariant";

export interface RepairableImage {
  id: string;
  actual_width_px?: number | null;
  actual_height_px?: number | null;
  print_format_id?: string | null;
  aspect_ratio?: string | null;
}

export interface MetadataRepairResult {
  repaired: boolean;
  width: number | null;
  height: number | null;
  aspectRatio: string | null;
  reason?: "already_complete" | "no_source" | "measure_failed";
}

/** Pure: does this row need a repair pass? */
export function needsMetadataRepair(img: RepairableImage): boolean {
  return !img.actual_width_px || !img.actual_height_px;
}

/** Pure: the canonical aspect ratio a row should carry. */
export function repairedAspectRatio(img: RepairableImage): string | null {
  return canonicalAspectRatio(img.print_format_id, img.aspect_ratio ?? null);
}

/**
 * Measure the master and persist dimensions + canonical ratio. Safe to call
 * repeatedly: a complete row short-circuits without any network work.
 */
export async function repairImageMetadata(
  img: RepairableImage,
  masterUrl: string | null | undefined,
): Promise<MetadataRepairResult> {
  const ratio = repairedAspectRatio(img);
  if (!needsMetadataRepair(img)) {
    return {
      repaired: false,
      width: img.actual_width_px ?? null,
      height: img.actual_height_px ?? null,
      aspectRatio: ratio,
      reason: "already_complete",
    };
  }
  if (!masterUrl) {
    return { repaired: false, width: null, height: null, aspectRatio: ratio, reason: "no_source" };
  }

  let dims: { width: number; height: number };
  try {
    dims = await loadImageDimensions(masterUrl);
  } catch {
    return {
      repaired: false,
      width: null,
      height: null,
      aspectRatio: ratio,
      reason: "measure_failed",
    };
  }
  if (!dims.width || !dims.height) {
    return {
      repaired: false,
      width: null,
      height: null,
      aspectRatio: ratio,
      reason: "measure_failed",
    };
  }

  const patch: Record<string, unknown> = {
    actual_width_px: dims.width,
    actual_height_px: dims.height,
    master_width: dims.width,
    master_height: dims.height,
  };
  if (ratio) patch.aspect_ratio = ratio;

  await (supabase as any).from("generated_images").update(patch).eq("id", img.id);

  // Keep the versioned original asset aligned with the measured master.
  await (supabase as any)
    .from("generated_image_assets")
    .update({ width_px: dims.width, height_px: dims.height })
    .eq("generated_image_id", img.id)
    .eq("asset_type", "original")
    .eq("version_index", 0)
    .is("deleted_at", null);

  return { repaired: true, width: dims.width, height: dims.height, aspectRatio: ratio };
}
