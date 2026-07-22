/**
 * create-job — Matching Collection creation via the atomic
 * `create_matching_collection_atomic` RPC.
 *
 * Guarantees:
 *   1. Server owns collection creation/reuse, frozen metadata, job
 *      creation, item creation, collection↔job linkage, and the
 *      authoritative `matchingCollectionId` injection into every item
 *      payload. The client never trusts its own placeholder id.
 *   2. Idempotency is deterministic — driven entirely by the caller's
 *      fingerprint (see `computeCollectionFingerprint`). Reusing the
 *      same fingerprint returns `reused=true` and skips dispatch for
 *      items already past `queued`.
 *   3. OpenAI is rejected up-front for durable jobs (worker cannot
 *      execute it yet). No RPC call is made in that case.
 *   4. Fan-out only: every item carries the SAME anchor URL. No item
 *      references another item's output.
 */

import { supabase } from "@/integrations/supabase/client";
import { checkDurableExecutability } from "@/lib/generation-executable-providers";
import {
  ART_DIRECTION_VERSION,
  DEFAULT_CONSISTENCY_STRENGTH,
  type CollectionArtDirection,
  type ConsistencyStrength,
  type MatchingCollectionItemPayload,
  type ResolvedCollectionProvider,
} from "./types";
import { composeCollectionPrompt } from "./prompt-composer";
import { consistencyToReferenceStrength } from "./consistency-strength";
import type { FrozenCollectionSettings } from "./frozen-settings";

export const MAX_COLLECTION_SUBJECTS = 20;

export interface ParsedSubjects {
  subjects: string[];
  ignoredBlankLines: number;
  truncated: boolean;
}

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
  /**
   * Placeholder only — the RPC strips this and injects the authoritative
   * collection id. Callers routed through the atomic RPC pass `""`.
   */
  matchingCollectionId: string;
  frozen: Pick<
    FrozenCollectionSettings,
    | "styleKey"
    | "posterFormatId"
    | "aspectRatio"
    | "backgroundStyle"
  >;
  artDirection: CollectionArtDirection | null;
  consistencyStrength: ConsistencyStrength;
  provider: ResolvedCollectionProvider;
}

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
      styleKey: input.frozen.styleKey,
      providerPreference: input.provider.providerPreference,
      aspectRatio: input.frozen.aspectRatio,
      backgroundStyle: input.frozen.backgroundStyle,
      generationMode: "standard",
      printFormatId: input.frozen.posterFormatId,
      mode: input.frozen.styleKey,
      providerLabel: input.provider.substituted
        ? `${input.provider.provider} (substituted)`
        : input.provider.provider,
    };
    return payload;
  });
}

/** Derives the deterministic job idempotency key from a fingerprint. */
export function fingerprintToJobIdempotencyKey(fingerprint: string): string {
  // Fingerprints are 32–64 hex chars; prefix keeps it recognizable and
  // stays well under any known idempotency-key length limit.
  return `mc-v2-${fingerprint}`;
}

export interface CreateMatchingCollectionInput {
  collectionName: string;
  frozen: FrozenCollectionSettings;
  provider: ResolvedCollectionProvider;
  subjects: string[];
  /** Deterministic fingerprint from `computeCollectionFingerprint`. */
  fingerprint: string;
  /** Optional override — defaults to `fingerprintToJobIdempotencyKey`. */
  jobIdempotencyKey?: string;
  /** Optional descriptive prompt persisted on the job row. */
  jobPrompt?: string;
}

export interface CreateMatchingCollectionResult {
  collectionId: string;
  jobId: string;
  itemIds: string[];
  reused: boolean;
  dispatchedItemIds: string[];
  dispatchFailures: Array<{ itemId: string; message: string }>;
}

/** Injected dependency handle used by tests to observe the boundary. */
export interface CreateMatchingCollectionDeps {
  rpc?: typeof supabase.rpc;
  invoke?: typeof supabase.functions.invoke;
  fetchItemStatuses?: (itemIds: string[]) => Promise<Array<{ id: string; status: string }>>;
}

async function defaultFetchItemStatuses(itemIds: string[]) {
  if (itemIds.length === 0) return [];
  const { data, error } = await supabase
    .from("generation_job_items")
    .select("id,status")
    .in("id", itemIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; status: string }>;
}

export async function createMatchingCollectionJob(
  input: CreateMatchingCollectionInput,
  deps: CreateMatchingCollectionDeps = {},
): Promise<CreateMatchingCollectionResult> {
  // 1. Durable executability gate — reject BEFORE any RPC side-effect.
  const gate = checkDurableExecutability(input.provider.providerPreference);
  if (!gate.ok) {
    throw new Error(gate.reason ?? "Selected provider cannot run as a durable job.");
  }

  // 2. Build items with an EMPTY collection id — the RPC injects the
  //    authoritative id server-side and strips any caller value.
  const items = buildCollectionItems({
    subjects: input.subjects,
    anchorImageUrl: input.frozen.anchorImageUrl ?? "",
    anchorImageId: input.frozen.anchorImageId,
    matchingCollectionId: "",
    frozen: {
      styleKey: input.frozen.styleKey,
      posterFormatId: input.frozen.posterFormatId,
      aspectRatio: input.frozen.aspectRatio,
      backgroundStyle: input.frozen.backgroundStyle,
    },
    artDirection: input.frozen.artDirection,
    consistencyStrength: input.frozen.consistencyStrength,
    provider: input.provider,
  });

  const rpc = deps.rpc ?? supabase.rpc.bind(supabase);
  const invoke = deps.invoke ?? supabase.functions.invoke.bind(supabase.functions);
  const fetchStatuses = deps.fetchItemStatuses ?? defaultFetchItemStatuses;

  const jobIdempotencyKey =
    input.jobIdempotencyKey ?? fingerprintToJobIdempotencyKey(input.fingerprint);

  // 3. Single atomic call that owns collection + job + items + linkage.
  const { data, error } = await rpc("create_matching_collection_atomic", {
    p_fingerprint: input.fingerprint,
    p_name: input.collectionName,
    p_anchor_image_id: input.frozen.anchorImageId as unknown as string,
    p_anchor_image_url: input.frozen.anchorImageUrl as unknown as string,
    p_anchor_storage_path: input.frozen.anchorStoragePath as unknown as string,
    p_anchor_width_px: input.frozen.anchorWidthPx as unknown as number,
    p_anchor_height_px: input.frozen.anchorHeightPx as unknown as number,
    p_anchor_aspect_ratio: input.frozen.aspectRatio,
    p_anchor_style_key: input.frozen.styleKey,
    p_anchor_poster_format_id: input.frozen.posterFormatId as unknown as string,
    p_anchor_background_style: input.frozen.backgroundStyle,
    p_anchor_provider: input.frozen.anchorProvider as unknown as string,
    p_anchor_model: input.frozen.anchorModel as unknown as string,
    p_resolved_provider: input.provider.provider,
    p_resolved_model: input.provider.model,
    p_provider_preference: input.provider.providerPreference,
    p_provider_substitution_reason: (input.provider.reason ?? null) as unknown as string,
    p_art_direction: input.frozen.artDirection as unknown as never,
    p_art_direction_version: input.frozen.artDirectionVersion,
    p_consistency_strength: input.frozen.consistencyStrength,
    p_reference_strength: (input.frozen.referenceStrength ??
      consistencyToReferenceStrength(input.frozen.consistencyStrength)) as unknown as string,
    p_job_idempotency_key: jobIdempotencyKey,
    p_job_prompt: input.jobPrompt ?? `Matching collection: ${input.collectionName}`,
    p_items: items as unknown as never,
  });

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create matching-collection job");
  }
  const row = Array.isArray(data)
    ? (data[0] as { collection_id: string; job_id: string; item_ids: string[]; reused: boolean })
    : (data as { collection_id: string; job_id: string; item_ids: string[]; reused: boolean });

  // 4. Dispatch policy.
  //    - reused=false → every returned item is fresh; dispatch each exactly once.
  //    - reused=true  → inspect statuses, dispatch only those still queued.
  let toDispatch: string[] = row.item_ids ?? [];
  if (row.reused) {
    try {
      const statuses = await fetchStatuses(toDispatch);
      const dispatchable = new Set(
        statuses.filter((s) => s.status === "queued").map((s) => s.id),
      );
      toDispatch = toDispatch.filter((id) => dispatchable.has(id));
    } catch (err) {
      console.warn("[createMatchingCollectionJob] status probe failed:", err);
      toDispatch = [];
    }
  }

  const dispatchFailures: Array<{ itemId: string; message: string }> = [];
  const dispatchedItemIds: string[] = [];
  for (const itemId of toDispatch) {
    try {
      await invoke("generate-single", { body: { itemId } });
      dispatchedItemIds.push(itemId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[createMatchingCollectionJob] dispatch failed:", itemId, err);
      dispatchFailures.push({ itemId, message });
    }
  }

  return {
    collectionId: row.collection_id,
    jobId: row.job_id,
    itemIds: row.item_ids ?? [],
    reused: !!row.reused,
    dispatchedItemIds,
    dispatchFailures,
  };
}
