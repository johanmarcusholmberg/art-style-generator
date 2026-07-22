/**
 * Typed RPC wrapper for durable ratio finalization.
 *
 * Layer between the generated Supabase types and the finalizer / UI.
 * Runtime-validates the claim response and normalizes RPC errors into
 * concise typed errors so callers can act on known conditions without
 * pattern-matching on Postgres error strings.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type RatioFinalizationErrorCode =
  | "not_claimable"
  | "forbidden_or_missing"
  | "invalid_claim"
  | "idempotent_replay_conflict"
  | "invalid_operation"
  | "invalid_dimensions"
  | "invalid_policy"
  | "not_authenticated"
  | "no_usable_source"
  | "unknown_rpc_error";

export class RatioFinalizationApiError extends Error {
  constructor(
    public readonly code: RatioFinalizationErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RatioFinalizationApiError";
  }
}

const KNOWN_CODES: RatioFinalizationErrorCode[] = [
  "not_claimable", "forbidden_or_missing", "invalid_claim",
  "idempotent_replay_conflict", "invalid_operation", "invalid_dimensions",
  "invalid_policy", "not_authenticated",
];

function classifyRpcError(err: { message?: string | null } | null | undefined): RatioFinalizationApiError {
  const msg = err?.message ?? "";
  const match = KNOWN_CODES.find((code) => msg.includes(code));
  if (match) return new RatioFinalizationApiError(match, msg, err);
  return new RatioFinalizationApiError("unknown_rpc_error", msg || "unknown_rpc_error", err);
}

export interface ClaimedRatioFinalizationItem {
  itemId: string;
  claimToken: string;
  galleryImageId: string | null;
  /** Preferred source identity — resolves from Storage before URL fallback. */
  sourceStoragePath: string | null;
  /** Fallback source identity when storage_path is missing. */
  sourceImageUrl: string | null;
  /** Stored dimensions — MAY be stale; the finalizer decodes real pixels. */
  sourceWidth: number | null;
  sourceHeight: number | null;
  posterFormatId: string | null;
  targetAspectRatio: string;
  correctionPolicy: "pad" | "crop";
  attempts: number;
}

type ClaimRow = Database["public"]["Functions"]["claim_generation_ratio_finalization"]["Returns"][number];

function validateClaimRow(row: ClaimRow | null | undefined): ClaimedRatioFinalizationItem {
  if (!row) throw new RatioFinalizationApiError("not_claimable", "no row returned from claim");
  if (!row.item_id) throw new RatioFinalizationApiError("unknown_rpc_error", "claim missing item_id");
  if (!row.claim_token) throw new RatioFinalizationApiError("unknown_rpc_error", "claim missing claim_token");
  if (!row.target_aspect_ratio) {
    throw new RatioFinalizationApiError("no_usable_source", "claim missing target_aspect_ratio");
  }
  const sourceStoragePath = row.source_storage_path ?? null;
  const sourceImageUrl = row.source_image_url ?? null;
  if (!sourceStoragePath && !sourceImageUrl) {
    throw new RatioFinalizationApiError("no_usable_source", "claim has no source path or url");
  }
  // Strict policy validation — never silently coerce an unknown value.
  // The RPC contract must return "crop" or "pad"; anything else is a
  // contract violation the finalizer must surface, not paper over.
  const rawPolicy = row.correction_policy;
  let correctionPolicy: "pad" | "crop";
  if (rawPolicy === "crop" || rawPolicy === "pad") {
    correctionPolicy = rawPolicy;
  } else if (rawPolicy == null) {
    // The database default for the RPC contract is "pad"; keep this
    // narrow allowance for genuinely-null RPC values.
    correctionPolicy = "pad";
  } else {
    throw new RatioFinalizationApiError(
      "invalid_policy",
      `unrecognized correction_policy: ${String(rawPolicy)}`,
    );
  }
  return {
    itemId: row.item_id,
    claimToken: row.claim_token,
    galleryImageId: row.gallery_image_id ?? null,
    sourceStoragePath,
    sourceImageUrl,
    sourceWidth: typeof row.source_width === "number" ? row.source_width : null,
    sourceHeight: typeof row.source_height === "number" ? row.source_height : null,
    posterFormatId: row.poster_format_id ?? null,
    targetAspectRatio: row.target_aspect_ratio,
    correctionPolicy,
    attempts: typeof row.attempts === "number" ? row.attempts : 0,
  };
}

export interface RatioFinalizationApiDeps {
  client?: SupabaseClient<Database>;
}

function getClient(deps?: RatioFinalizationApiDeps): SupabaseClient<Database> {
  return deps?.client ?? defaultClient;
}

export async function claimRatioFinalization(
  itemId: string,
  deps?: RatioFinalizationApiDeps & { leaseSeconds?: number },
): Promise<ClaimedRatioFinalizationItem> {
  const client = getClient(deps);
  const { data, error } = await client.rpc("claim_generation_ratio_finalization", {
    p_item_id: itemId,
    p_lease_seconds: deps?.leaseSeconds,
  });
  if (error) throw classifyRpcError(error);
  const row = Array.isArray(data) ? data[0] : null;
  return validateClaimRow(row);
}

export interface CompleteRatioFinalizationInput {
  itemId: string;
  claimToken: string;
  finalStoragePath: string;
  finalImageUrl: string;
  finalWidth: number;
  finalHeight: number;
  operation: "none" | "crop" | "pad";
  metadata: Record<string, unknown>;
}

export async function completeRatioFinalization(
  input: CompleteRatioFinalizationInput,
  deps?: RatioFinalizationApiDeps,
): Promise<true> {
  const client = getClient(deps);
  const { data, error } = await client.rpc("complete_generation_ratio_finalization", {
    p_item_id: input.itemId,
    p_claim_token: input.claimToken,
    p_final_storage_path: input.finalStoragePath,
    p_final_image_url: input.finalImageUrl,
    p_final_width: input.finalWidth,
    p_final_height: input.finalHeight,
    p_operation: input.operation,
    p_metadata: input.metadata as Database["public"]["Functions"]["complete_generation_ratio_finalization"]["Args"]["p_metadata"],
  });
  if (error) throw classifyRpcError(error);
  if (data !== true) {
    throw new RatioFinalizationApiError("unknown_rpc_error", "complete returned non-true");
  }
  return true;
}

export interface FailRatioFinalizationInput {
  itemId: string;
  claimToken: string;
  error: string;
}

export async function failRatioFinalization(
  input: FailRatioFinalizationInput,
  deps?: RatioFinalizationApiDeps,
): Promise<boolean> {
  const client = getClient(deps);
  const { data, error } = await client.rpc("fail_generation_ratio_finalization", {
    p_item_id: input.itemId,
    p_claim_token: input.claimToken,
    p_error: input.error,
  });
  if (error) throw classifyRpcError(error);
  return data === true;
}

export async function retryRatioFinalization(
  itemId: string,
  deps?: RatioFinalizationApiDeps,
): Promise<boolean> {
  const client = getClient(deps);
  const { data, error } = await client.rpc("retry_generation_ratio_finalization", {
    p_item_id: itemId,
  });
  if (error) throw classifyRpcError(error);
  return data === true;
}
