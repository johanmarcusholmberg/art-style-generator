/**
 * regenerate — thin client wrapper around the atomic
 * `create_matching_collection_regeneration` RPC.
 *
 * Turn 2c.1: dispatch outcome is returned to the caller so the UI can
 * distinguish "queued AND started" from "queued but not yet started".
 * A queued candidate created by the RPC is NEVER rolled back on
 * dispatch failure — the user can retry via the Start action.
 */
import { supabase } from "@/integrations/supabase/client";

export interface RegenerateResult {
  newItemId: string;
  jobId: string;
  /** True when `generate-single` was invoked successfully. */
  dispatchStarted: boolean;
  /** Concise message when dispatch failed; null on success. */
  dispatchError: string | null;
}

export async function regenerateCollectionMember(
  sourceItemId: string,
): Promise<RegenerateResult> {
  const { data, error } = await supabase.rpc(
    "create_matching_collection_regeneration" as never,
    { p_source_item_id: sourceItemId } as never,
  );
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to start regeneration");
  }
  const row = Array.isArray(data)
    ? (data[0] as { new_item_id: string; job_id: string })
    : (data as { new_item_id: string; job_id: string });

  let dispatchStarted = false;
  let dispatchError: string | null = null;
  try {
    const res = await supabase.functions.invoke("generate-single", {
      body: { itemId: row.new_item_id },
    });
    if (res.error) throw new Error(res.error.message);
    dispatchStarted = true;
  } catch (e) {
    dispatchError = e instanceof Error ? e.message : String(e);
    console.error("[regenerateCollectionMember] dispatch failed:", e);
  }

  return {
    newItemId: row.new_item_id,
    jobId: row.job_id,
    dispatchStarted,
    dispatchError,
  };
}
