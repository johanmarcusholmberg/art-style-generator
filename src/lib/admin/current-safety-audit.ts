/**
 * Read-only "current state" safety audit (Turn 2c.3).
 *
 * Wraps the protected `report_current_generation_safety_state()` RPC.
 * This module NEVER mutates anything — there is deliberately no apply
 * operation. It exists so we can see, before RLS/security hardening,
 * which live records could break generation, recovery, or ownership:
 *
 *   1. legacy_null_profile_collection
 *      Collections with no owner. These become unreachable once
 *      profile-scoped RLS lands.
 *   2. expired_ratio_finalization_processing
 *      Ratio finalization rows stuck in `processing` past their lease.
 *      They block format readiness and never self-heal.
 *   3. completed_item_missing_canonical_asset
 *      Recently completed items with no canonical persisted asset
 *      truth (no gallery row, or a gallery row without storage path).
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

export interface SafetyAuditRow {
  category: SafetyAuditCategory;
  entityId: string;
  detectedAt: string | null;
  detail: Record<string, unknown>;
}

export interface SafetyAuditReport {
  rows: SafetyAuditRow[];
  countsByCategory: Record<SafetyAuditCategory, number>;
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

/**
 * Pure mapper: raw RPC rows → normalized report.
 * Unknown categories and rows without an id are dropped rather than
 * throwing, so a schema drift can never break the audit screen.
 */
export function mapSafetyAuditRows(
  raw: RawSafetyAuditRow[] | null | undefined,
): SafetyAuditReport {
  const countsByCategory = {
    legacy_null_profile_collection: 0,
    expired_ratio_finalization_processing: 0,
    completed_item_missing_canonical_asset: 0,
  } as Record<SafetyAuditCategory, number>;

  const rows: SafetyAuditRow[] = [];

  for (const item of raw ?? []) {
    if (!item || !isCategory(item.category)) continue;
    const entityId = item.entity_id;
    if (typeof entityId !== "string" || entityId.length === 0) continue;

    const detectedAt =
      typeof item.detected_at === "string" ? item.detected_at : null;
    const detail =
      item.detail && typeof item.detail === "object" && !Array.isArray(item.detail)
        ? (item.detail as Record<string, unknown>)
        : {};

    rows.push({ category: item.category, entityId, detectedAt, detail });
    countsByCategory[item.category] += 1;
  }

  return {
    rows,
    countsByCategory,
    total: rows.length,
    isClean: rows.length === 0,
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
 * caller is not an active admin.
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
