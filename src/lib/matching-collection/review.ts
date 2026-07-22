/**
 * review — Keep / Reject / Restore workflow for matching-collection
 * members.
 *
 * Semantics:
 *   - Keep     : pending → accepted (also unarchive).
 *   - Reject   : any    → rejected + is_archived=true (soft-hide).
 *   - Restore  : rejected → pending + is_archived=false. The user can
 *                Keep again after restoring; this is deliberately NOT
 *                an implicit re-accept so intent stays explicit.
 *
 * Only the selected generated-image row is touched; siblings and
 * regenerated candidates are independent.
 */

import { supabase } from "@/integrations/supabase/client";

export type ReviewState = "pending" | "accepted" | "rejected";

/** Build the update patch for a review-state transition. Pure — tested. */
export function reviewStatePatch(next: ReviewState): Record<string, unknown> {
  return {
    matching_review_state: next,
    // "rejected" archives; every other transition unarchives.
    ...(next === "rejected" ? { is_archived: true } : { is_archived: false }),
  };
}

/**
 * Label + target state for the primary action on a member's card given
 * its current review state. Rejected members surface "Restore" (which
 * returns to pending), everyone else surfaces "Keep".
 */
export function reviewPrimaryAction(
  state: ReviewState | null | undefined,
): { label: "Keep" | "Restore"; target: ReviewState } {
  return state === "rejected"
    ? { label: "Restore", target: "pending" }
    : { label: "Keep", target: "accepted" };
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
