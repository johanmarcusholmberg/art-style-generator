/**
 * regeneration-repo — data-layer helper for regenerating a completed
 * matching-collection member.
 *
 * Given the source `generation_job_items` row and its normalized V2
 * request, this builds and inserts a NEW job item under the SAME job,
 * carrying `regenerated_from_item_id` lineage. It NEVER mutates the
 * source row, NEVER reuses the source's rendered output as the new
 * reference, and NEVER carries terminal result/gallery/lease state.
 *
 * Turn 2b will call this from the CollectionPage Regenerate button.
 */

import { supabase } from "@/integrations/supabase/client";
import type { GenerationRequestV2 } from "@/lib/generation-contract-v2";
import {
  buildRegenerationPayload,
  type RegenerationBuild,
} from "./regeneration-payload";

export interface RegenerateItemInput {
  sourceItemId: string;
  sourceJobId: string;
  sourcePosition: number;
  sourcePromptVariant: string;
  originalRequest: GenerationRequestV2;
  /** Completed member output — passed so we can assert-and-reject reuse. */
  completedOutputUrl?: string | null;
  completedOutputId?: string | null;
}

export interface RegenerateItemResult {
  newItemId: string;
  build: RegenerationBuild;
}

/** Injected boundary — tests replace this to observe the insert payload. */
export interface RegenerateItemDeps {
  insert?: (row: Record<string, unknown>) => Promise<{ id: string } | null>;
}

async function defaultInsert(row: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("generation_job_items")
    .insert(row as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string } | null;
}

export async function createRegeneratedItem(
  input: RegenerateItemInput,
  deps: RegenerateItemDeps = {},
): Promise<RegenerateItemResult> {
  const build = buildRegenerationPayload({
    original: input.originalRequest,
    fromItemId: input.sourceItemId,
    completedOutputUrl: input.completedOutputUrl,
    completedOutputId: input.completedOutputId,
  });

  const insert = deps.insert ?? defaultInsert;
  const row = {
    job_id: input.sourceJobId,
    position: input.sourcePosition,
    prompt_variant: input.sourcePromptVariant,
    status: "queued",
    request_payload: build.request as unknown as Record<string, unknown>,
    regenerated_from_item_id: build.lineage.regeneratedFromItemId,
    // No terminal fields carried over.
  };

  const inserted = await insert(row);
  if (!inserted?.id) throw new Error("Failed to insert regenerated item");
  return { newItemId: inserted.id, build };
}
