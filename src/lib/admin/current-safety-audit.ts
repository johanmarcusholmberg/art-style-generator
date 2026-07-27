/**
 * Read-only "current state" safety audit.
 *
 * Wraps the admin-only `report_current_generation_safety_state()` RPC.
 * This module NEVER mutates anything — there is deliberately no apply
 * operation. Scope is limited to what can affect CURRENT generation
 * reliability or the upcoming security hardening:
 *
 *   1. legacy_null_profile_collection
 *      Collections without an owner (profile_id IS NULL).
 *   2. expired_ratio_finalization_processing
 *      Poster-format finalizations stuck in `processing` with either no
 *      lease (missing_lease) or a lease in the past (expired_lease).
 *   3. completed_item_missing_canonical_asset
 *      Completed finalizations that cannot be safely adopted because an
 *      essential canonical fact is missing.
 */

import { supabase } from "@/integrations/supabase/client";

export type SafetyAuditCategory =
  | "legacy_null_profile_collection"
  | "expired_ratio_finalization_processing"
  | "completed_item_missing_canonical_asset";

export const SAFETY_AUDIT_CATEGORIES: SafetyAuditCategory[] = [
  "legacy_null_profile_collection",
  "expired_ratio_finalization_processing",
  "completed_item_missing_canonical_asset",
];

export type StaleFinalizationReason = "missing_lease" | "expired_lease";

export interface NullProfileCollectionRow {
  collectionId: string;
}

export interface StaleFinalizationRow {
  itemId: string;
  jobId: string;
  reason: StaleFinalizationReason;
  leaseExpiresAt: string | null;
}

export interface IncompleteCanonicalAssetRow {
  itemId: string;
  galleryImageId: string | null;
  missingFields: string[];
}

/** A row of a known category that failed strict validation. */
export interface MalformedSafetyAuditRow {
  category: SafetyAuditCategory;
  reason: string;
  raw: RawSafetyAuditRow;
}

export interface SafetyAuditReport {
  nullProfileCollections: NullProfileCollectionRow[];
  staleFinalizations: StaleFinalizationRow[];
  incompleteCanonicalAssets: IncompleteCanonicalAssetRow[];
  /** Known-category rows that could not be parsed — surfaced, not hidden. */
  malformedRows: MalformedSafetyAuditRow[];
  total: number;
  /** True when nothing needs attention before hardening. */
  isClean: boolean;
}

/** Raw shape returned by the RPC (snake_case, loosely typed). */
export interface RawSafetyAuditRow {
  category?: unknown;
  entity_id?: unknown;
  detected_at?: unknown;
  detail?: unknown;
}

function isCategory(value: unknown): value is SafetyAuditCategory {
  return (
    typeof value === "string" &&
    (SAFETY_AUDIT_CATEGORIES as string[]).includes(value)
  );
}

function asDetail(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Pure mapper: raw RPC rows → typed report.
 * Rows of unknown categories are ignored. Rows of a KNOWN category that
 * fail validation are reported in `malformedRows` rather than silently
 * degraded into empty details.
 */
export function mapSafetyAuditRows(
  raw: RawSafetyAuditRow[] | null | undefined,
): SafetyAuditReport {
  const nullProfileCollections: NullProfileCollectionRow[] = [];
  const staleFinalizations: StaleFinalizationRow[] = [];
  const incompleteCanonicalAssets: IncompleteCanonicalAssetRow[] = [];
  const malformedRows: MalformedSafetyAuditRow[] = [];

  for (const item of raw ?? []) {
    if (!item || !isCategory(item.category)) continue;
    const category = item.category;
    const bad = (reason: string) =>
      malformedRows.push({ category, reason, raw: item });

    const entityId = nonEmptyString(item.entity_id);
    if (!entityId) {
      bad("missing entity_id");
      continue;
    }
    const detail = asDetail(item.detail);
    if (!detail) {
      bad("detail is not an object");
      continue;
    }

    if (category === "legacy_null_profile_collection") {
      nullProfileCollections.push({
        collectionId: nonEmptyString(detail.collection_id) ?? entityId,
      });
      continue;
    }

    if (category === "expired_ratio_finalization_processing") {
      const jobId = nonEmptyString(detail.job_id);
      const reason = detail.reason;
      if (!jobId) {
        bad("missing job_id");
        continue;
      }
      if (reason !== "missing_lease" && reason !== "expired_lease") {
        bad("invalid reason");
        continue;
      }
      const leaseExpiresAt = nonEmptyString(detail.lease_expires_at);
      if (reason === "expired_lease" && !leaseExpiresAt) {
        bad("expired_lease without lease_expires_at");
        continue;
      }
      staleFinalizations.push({
        itemId: nonEmptyString(detail.item_id) ?? entityId,
        jobId,
        reason,
        leaseExpiresAt,
      });
      continue;
    }

    // completed_item_missing_canonical_asset
    const missing = detail.missing_fields;
    if (
      !Array.isArray(missing) ||
      !missing.every((f) => typeof f === "string" && f.length > 0)
    ) {
      bad("missing_fields is not a string array");
      continue;
    }
    if (missing.length === 0) {
      bad("missing_fields is empty");
      continue;
    }
    incompleteCanonicalAssets.push({
      itemId: nonEmptyString(detail.item_id) ?? entityId,
      galleryImageId: nonEmptyString(detail.gallery_image_id),
      missingFields: missing as string[],
    });
  }

  const total =
    nullProfileCollections.length +
    staleFinalizations.length +
    incompleteCanonicalAssets.length +
    malformedRows.length;

  return {
    nullProfileCollections,
    staleFinalizations,
    incompleteCanonicalAssets,
    malformedRows,
    total,
    isClean: total === 0,
  };
}

export class SafetyAuditForbiddenError extends Error {
  constructor() {
    super("Only administrators can run the generation safety audit.");
    this.name = "SafetyAuditForbiddenError";
  }
}

/**
 * Runs the read-only audit. Throws `SafetyAuditForbiddenError` when the
 * caller is not an active admin. Performs no writes of any kind.
 */
export async function fetchCurrentGenerationSafetyState(
  limit = 100,
): Promise<SafetyAuditReport> {
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: RawSafetyAuditRow[] | null; error: { message: string } | null }>)(
    "report_current_generation_safety_state",
    { p_limit: limit },
  );

  if (error) {
    if (/forbidden/i.test(error.message)) throw new SafetyAuditForbiddenError();
    throw new Error(error.message);
  }

  return mapSafetyAuditRows(data);
}
