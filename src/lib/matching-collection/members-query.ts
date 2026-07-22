/**
 * members-query — unified collection-member view.
 *
 * The `generation_job_items` row is the requested work unit; the
 * `generated_images` row is its optional persisted result. This helper
 * joins both so every queued/processing/failed/completed subject appears
 * in the UI immediately — long before a `generated_images` row exists.
 *
 * Turn 2b: this replaces `listCollectionMembers` as the primary source
 * for the collection page. The old helper still exists for callers that
 * only want completed images.
 */

import { supabase } from "@/integrations/supabase/client";

export type ItemStatus =
  | "queued"
  | "dispatching"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type ReviewState = "pending" | "accepted" | "rejected";

export interface CollectionMemberView {
  itemId: string;
  jobId: string;
  position: number;
  subject: string;
  itemStatus: ItemStatus;
  errorMessage: string | null;

  generatedImageId: string | null;
  storagePath: string | null;
  imageUrl: string | null;

  reviewState: ReviewState | null;
  isArchived: boolean;

  regeneratedFromItemId: string | null;
  ratioFinalizationStatus: string | null;

  createdAt: string;
  attemptCount: number;
}

/** Minimal shapes for pure joining — exported for tests. */
export interface RawItemRow {
  id: string;
  job_id: string;
  position: number;
  status: string;
  prompt_variant: string | null;
  request_payload: Record<string, unknown> | null;
  error_message: string | null;
  regenerated_from_item_id: string | null;
  ratio_enforcement_status: string | null;
  gallery_image_id: string | null;
  storage_path: string | null;
  image_url: string | null;
  attempt_count: number | null;
  created_at: string;
}
export interface RawImageRow {
  id: string;
  storage_path: string | null;
  matching_subject: string | null;
  matching_review_state: string | null;
  is_archived: boolean | null;
  deleted_at: string | null;
  generation_job_item_id: string | null;
}

function subjectFromPayload(p: Record<string, unknown> | null): string {
  if (!p) return "";
  const raw = (p["rawSubject"] ?? p["subject"] ?? p["prompt"]) as unknown;
  return typeof raw === "string" ? raw : "";
}

/** Pure join used by tests + the live query. */
export function joinMembers(
  items: RawItemRow[],
  images: RawImageRow[],
): CollectionMemberView[] {
  const imgByItem = new Map<string, RawImageRow>();
  for (const img of images) {
    if (img.deleted_at) continue;
    if (img.generation_job_item_id) imgByItem.set(img.generation_job_item_id, img);
  }
  return items
    .slice()
    .sort((a, b) => a.position - b.position)
    .map<CollectionMemberView>((it) => {
      const img = imgByItem.get(it.id) ?? null;
      const payloadSubject = subjectFromPayload(it.request_payload);
      return {
        itemId: it.id,
        jobId: it.job_id,
        position: it.position,
        subject: img?.matching_subject || payloadSubject || it.prompt_variant || "",
        itemStatus: (it.status as ItemStatus) ?? "queued",
        errorMessage: it.error_message,
        generatedImageId: img?.id ?? it.gallery_image_id ?? null,
        storagePath: img?.storage_path ?? it.storage_path ?? null,
        imageUrl: it.image_url ?? null,
        reviewState: (img?.matching_review_state as ReviewState | null) ?? null,
        isArchived: !!img?.is_archived,
        regeneratedFromItemId: it.regenerated_from_item_id,
        ratioFinalizationStatus: it.ratio_enforcement_status,
        createdAt: it.created_at,
        attemptCount: it.attempt_count ?? 0,
      };
    });
}

export async function fetchCollectionJobIds(collectionId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("generation_jobs")
    .select("id")
    .eq("matching_collection_id", collectionId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => (r as { id: string }).id);
}

export async function fetchCollectionMembers(
  collectionId: string,
): Promise<CollectionMemberView[]> {
  const jobIds = await fetchCollectionJobIds(collectionId);
  if (jobIds.length === 0) return [];

  const [{ data: items, error: itemsErr }, { data: images, error: imagesErr }] =
    await Promise.all([
      supabase
        .from("generation_job_items")
        .select(
          "id, job_id, position, status, prompt_variant, request_payload, error_message, regenerated_from_item_id, ratio_enforcement_status, gallery_image_id, storage_path, image_url, attempt_count, created_at",
        )
        .in("job_id", jobIds),
      supabase
        .from("generated_images")
        .select(
          "id, storage_path, matching_subject, matching_review_state, is_archived, deleted_at, generation_job_item_id",
        )
        .eq("matching_collection_id", collectionId)
        .is("deleted_at", null),
    ]);
  if (itemsErr) throw new Error(itemsErr.message);
  if (imagesErr) throw new Error(imagesErr.message);

  return joinMembers(
    (items ?? []) as unknown as RawItemRow[],
    (images ?? []) as unknown as RawImageRow[],
  );
}

/** Human-readable status label combining item + review state. */
export function memberDisplayStatus(m: CollectionMemberView): string {
  if (m.itemStatus === "queued") {
    return m.regeneratedFromItemId ? "Regenerating" : "Queued";
  }
  if (m.itemStatus === "dispatching" || m.itemStatus === "processing") return "Generating";
  if (m.itemStatus === "failed") return "Failed";
  if (m.itemStatus === "cancelled") return "Cancelled";
  // completed
  if (!m.storagePath && !m.imageUrl && !m.generatedImageId) return "Recoverable — image missing";
  if (m.reviewState === "accepted") return "Accepted";
  if (m.reviewState === "rejected") return "Rejected";
  return "Completed — pending review";
}
