/**
 * create-job — turns an approved matching-collection setup into a durable
 * `generation_jobs` row (job_type='matching_collection') with one
 * `generation_job_items` row per subject.
 *
 * Behavior guarantees (Stage 2 spec):
 *   1. Every item's payload carries the SAME anchorImageUrl. Fan-out,
 *      never chained — no item ever references another item's output.
 *   2. anchorImageUrl is the ONE canonical reference property; the worker
 *      is responsible for mapping it to referenceImageUrl at execution.
 *   3. Style / print / poster-format instructions are NOT emitted here.
 *      Only the subject + collection-consistency block. The existing
 *      prompt-compiler pipeline continues to add the canonical style
 *      rules exactly once at execution time.
 *   4. Results persist immediately with `matching_review_state='pending'`
 *      so a refresh cannot lose them.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  ART_DIRECTION_VERSION,
  DEFAULT_CONSISTENCY_STRENGTH,
  type AnchorInheritedSettings,
  type CollectionArtDirection,
  type ConsistencyStrength,
  type MatchingCollectionItemPayload,
  type ResolvedCollectionProvider,
} from "./types";
import { composeCollectionPrompt } from "./prompt-composer";
import { consistencyToReferenceStrength } from "./consistency-strength";

export const MAX_COLLECTION_SUBJECTS = 20;

export interface ParsedSubjects {
  subjects: string[];
  ignoredBlankLines: number;
  truncated: boolean;
}

/**
 * Split a raw multiline subjects textarea into a clean list.
 *   - blank / whitespace-only lines are ignored
 *   - trims each subject
 *   - deduplicates while preserving order
 *   - caps at MAX_COLLECTION_SUBJECTS
 */
export function parseSubjects(raw: string): ParsedSubjects {
  const lines = raw.split(/\r?\n/);
  let ignored = 0;
  const seen = new Set<string>();
  const subjects: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      ignored++;
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    subjects.push(trimmed);
  }
  const truncated = subjects.length > MAX_COLLECTION_SUBJECTS;
  return {
    subjects: truncated ? subjects.slice(0, MAX_COLLECTION_SUBJECTS) : subjects,
    ignoredBlankLines: ignored,
    truncated,
  };
}

export interface BuildItemsInput {
  subjects: string[];
  anchorImageUrl: string;
  anchorImageId: string | null;
  matchingCollectionId: string;
  anchor: AnchorInheritedSettings;
  artDirection: CollectionArtDirection | null;
  consistencyStrength: ConsistencyStrength;
  provider: ResolvedCollectionProvider;
}

/**
 * Pure helper: builds the per-item payloads that will be persisted into
 * `generation_job_items.request_payload`. Exposed for tests.
 */
export function buildCollectionItems(
  input: BuildItemsInput,
): MatchingCollectionItemPayload[] {
  const referenceStrength = consistencyToReferenceStrength(input.consistencyStrength);
  return input.subjects.map((rawSubject) => {
    const prompt = composeCollectionPrompt({
      subject: rawSubject,
      artDirection: input.artDirection,
      consistencyStrength: input.consistencyStrength,
    });
    const payload: MatchingCollectionItemPayload = {
      kind: "matching_collection",
      subject: rawSubject,
      rawSubject,
      prompt,
      anchorImageUrl: input.anchorImageUrl,
      anchorImageId: input.anchorImageId,
      matchingCollectionId: input.matchingCollectionId,
      artDirection: input.artDirection,
      artDirectionVersion: ART_DIRECTION_VERSION,
      consistencyStrength: input.consistencyStrength,
      referenceStrength,
      styleKey: input.anchor.styleKey,
      providerPreference: input.provider.providerPreference,
      aspectRatio: input.anchor.aspectRatio,
      backgroundStyle: input.anchor.backgroundStyle,
      generationMode: "standard",
      printFormatId: input.anchor.posterFormatId,
      mode: input.anchor.styleKey,
      providerLabel: input.provider.substituted
        ? `${input.provider.provider} (substituted)`
        : input.provider.provider,
    };
    return payload;
  });
}

export interface CreateMatchingCollectionInput {
  collectionId: string;
  collectionName: string;
  anchorImageUrl: string;
  anchorImageId: string | null;
  anchor: AnchorInheritedSettings;
  artDirection: CollectionArtDirection | null;
  consistencyStrength?: ConsistencyStrength;
  provider: ResolvedCollectionProvider;
  subjects: string[];
  idempotencyKey: string;
}

export interface CreateMatchingCollectionResult {
  jobId: string;
  itemIds: string[];
}

/**
 * Wire the matching-collection payloads into the existing durable
 * `create_generation_job` RPC. Job type is `matching_collection` so the
 * aggregate trigger and recovery paths already handle mixed outcomes and
 * single-item failures.
 */
export async function createMatchingCollectionJob(
  input: CreateMatchingCollectionInput,
): Promise<CreateMatchingCollectionResult> {
  const consistency = input.consistencyStrength ?? DEFAULT_CONSISTENCY_STRENGTH;
  const items = buildCollectionItems({
    subjects: input.subjects,
    anchorImageUrl: input.anchorImageUrl,
    anchorImageId: input.anchorImageId,
    matchingCollectionId: input.collectionId,
    anchor: input.anchor,
    artDirection: input.artDirection,
    consistencyStrength: consistency,
    provider: input.provider,
  });

  // Persist collection-level metadata BEFORE dispatch so a refresh in the
  // middle of job creation still finds the anchor + art direction.
  await supabase
    .from("collections")
    .update({
      anchor_image_id: input.anchorImageId,
      art_direction: input.artDirection as unknown as never,
      art_direction_version: ART_DIRECTION_VERSION,
      consistency_strength: consistency,
      anchor_style_key: input.anchor.styleKey,
      anchor_poster_format_id: input.anchor.posterFormatId,
      anchor_provider: input.anchor.provider,
      anchor_model: input.anchor.model,
      resolved_provider: input.provider.provider,
      resolved_model: input.provider.model,
      provider_substitution_reason: input.provider.reason,
      reference_strength: consistencyToReferenceStrength(consistency),
    } as never)
    .eq("id", input.collectionId);

  const { data, error } = await supabase.rpc("create_generation_job", {
    p_idempotency_key: input.idempotencyKey,
    p_job_type: "matching_collection",
    p_style_key: input.anchor.styleKey,
    p_generation_mode: "standard",
    p_context_key: input.collectionId,
    p_prompt: `Matching collection: ${input.collectionName}`,
    p_aspect_ratio: input.anchor.aspectRatio,
    p_background_style: input.anchor.backgroundStyle,
    p_items: items as unknown as never,
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to create matching-collection job");

  const created = Array.isArray(data)
    ? (data[0] as { job_id: string; item_ids: string[] })
    : (data as { job_id: string; item_ids: string[] });

  // Best-effort — annotate the job row with the anchor + art direction so
  // resume/rerun can read them without walking every item payload.
  await supabase
    .from("generation_jobs")
    .update({
      anchor_image_id: input.anchorImageId,
      anchor_image_url: input.anchorImageUrl,
      anchor_width_px: input.anchor.anchorWidthPx,
      anchor_height_px: input.anchor.anchorHeightPx,
      anchor_aspect_ratio: input.anchor.aspectRatio,
      art_direction: input.artDirection as unknown as never,
      art_direction_version: ART_DIRECTION_VERSION,
      consistency_strength: consistency,
      matching_collection_id: input.collectionId,
    } as never)
    .eq("id", created.job_id);

  // Fire durable worker per item (fan-out from same anchor, never chained).
  for (const itemId of created.item_ids) {
    void supabase.functions
      .invoke("generate-single", { body: { itemId } })
      .catch((err) =>
        console.error("[createMatchingCollectionJob] dispatch failed:", err),
      );
  }

  return { jobId: created.job_id, itemIds: created.item_ids };
}
