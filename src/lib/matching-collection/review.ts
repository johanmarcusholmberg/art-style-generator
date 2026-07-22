/**
 * review — Keep / Reject workflow for matching-collection members.
 *
 * "Keep" flips matching_review_state → 'accepted'. That's the only
 * change; the underlying generated_images row keeps its storage, cost
 * event, prompt history, and provenance intact so accepted members
 * behave exactly like any other gallery image.
 *
 * "Reject" flips matching_review_state → 'rejected' AND soft-archives
 * the image (is_archived=true, admin_status via existing trigger). The
 * durable asset is preserved — nothing is deleted — so it stays out of
 * the finished collection view while remaining recoverable from the
 * admin trash.
 *
 * Only the selected member is ever touched; siblings are unaffected.
 */

import { supabase } from "@/integrations/supabase/client";

export type ReviewState = "pending" | "accepted" | "rejected";

/** Build the update patch for a review-state transition. Pure — tested. */
export function reviewStatePatch(next: ReviewState): Record<string, unknown> {
  return {
    matching_review_state: next,
    // Restore = pending: unarchive so it becomes visible in the default view.
    ...(next === "rejected" ? { is_archived: true } : { is_archived: false }),
  };
}

export async function setMemberReviewState(
  generatedImageId: string,
  next: ReviewState,
): Promise<void> {
  const { error } = await supabase
    .from("generated_images")
    .update(reviewStatePatch(next) as never)
    .eq("id", generatedImageId);
  if (error) throw new Error(error.message);
}

export async function listCollectionMembers(collectionId: string) {
  const { data, error } = await supabase
    .from("generated_images")
    .select(
      "id, storage_path, prompt, aspect_ratio, matching_subject, matching_review_state, matching_is_anchor, created_at, generation_job_item_id, is_archived, deleted_at",
    )
    .eq("matching_collection_id", collectionId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
