/**
 * regenerate — thin client wrapper around the atomic
 * `create_matching_collection_regeneration` RPC.
 *
 * Guarantees delegated to the RPC:
 *   - Source item must exist and be `completed`.
 *   - Caller must own the collection.
 *   - New item gets a fresh position (max+1 within the job) so it never
 *     collides with the original candidate.
 *   - `regenerated_from_item_id` lineage is set; the unique partial
 *     index prevents concurrent duplicate regen queued items.
 *   - Original candidate is untouched — Keep/Reject remains independent
 *     per candidate.
 *
 * After the RPC returns, we invoke `generate-single` for the new item so
 * the durable worker picks it up immediately.
 */
import { supabase } from "@/integrations/supabase/client";

export interface RegenerateResult {
  newItemId: string;
  jobId: string;
}

export async function regenerateCollectionMember(
  sourceItemId: string,
): Promise<RegenerateResult> {
  const { data, error } = await supabase.rpc(
    // Types are refreshed after migration approval; cast keeps this compiling
    // in the interim without loosening the RPC signature at runtime.
    "create_matching_collection_regeneration" as never,
    { p_source_item_id: sourceItemId } as never,
  );
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to start regeneration");
  }
  const row = Array.isArray(data)
    ? (data[0] as { new_item_id: string; job_id: string })
    : (data as { new_item_id: string; job_id: string });

  // Fire the durable worker — realtime updates the UI. Do not await.
  supabase.functions
    .invoke("generate-single", { body: { itemId: row.new_item_id } })
    .catch((e) => console.error("[regenerateCollectionMember] dispatch failed:", e));

  return { newItemId: row.new_item_id, jobId: row.job_id };
}
