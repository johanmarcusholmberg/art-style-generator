/**
 * Pure helpers for the durable (server-owned) generation path.
 *
 * These are extracted from `useDurableGeneration` so they can be unit
 * tested without React or Supabase in scope. The hook composes them.
 *
 * Isolation contract:
 *  - Every browser-side key is scoped by `styleKey` so two style pages
 *    open in different tabs never trample each other.
 *  - Pending idempotency keys are written BEFORE any network POST, so a
 *    reload mid-flight can recover the exact same server job instead of
 *    creating a duplicate.
 *  - Adoption of terminal items into the live preview is time-gated by
 *    RECENT_ADOPT_WINDOW_MS to avoid resurrecting an image from a
 *    generation the user has clearly moved on from.
 */

import {
  RECENT_ADOPT_WINDOW_MS,
  PENDING_IDEMPOTENCY_KEY_PREFIX,
  CURRENT_JOB_KEY_PREFIX,
} from "./durable-generation-constants";

export type ItemStatus =
  | "queued"
  | "dispatching"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface DurableItemRow {
  id: string;
  job_id: string;
  status: ItemStatus;
  image_url: string | null;
  enforced_image_url: string | null;
  raw_image_url: string | null;
  ratio_enforcement_status: string | null;
  ratio_finalization_lease_expires_at?: string | null;
  ratio_finalization_error?: string | null;
  finalization_operation?: string | null;
  storage_path: string | null;
  completed_at: string | null;
  updated_at: string;
  position: number;
  result_metadata?: unknown;
  error_message?: string | null;
}

/** Storage keys — pure, deterministic, per-style. */
export function pendingIdemKey(styleKey: string): string {
  return `${PENDING_IDEMPOTENCY_KEY_PREFIX}${styleKey}`;
}
export function currentJobKey(styleKey: string): string {
  return `${CURRENT_JOB_KEY_PREFIX}${styleKey}`;
}

/**
 * Should a terminal item be adopted into the live preview slot when the
 * tab (re)hydrates?
 *
 * `now` and `completedAt` are ms epoch. If `completedAt` is null we
 * treat the item as stale (we have no evidence of recency).
 */
export function shouldAdoptTerminalItem(now: number, completedAt: number | null): boolean {
  if (completedAt == null) return false;
  return now - completedAt <= RECENT_ADOPT_WINDOW_MS;
}

/**
 * Merge a realtime UPDATE/INSERT payload row into the existing list of
 * items, preserving order (by position, stable by id).
 *
 * Behaviors:
 *  - Unknown id → append.
 *  - Known id → replace, but drop stale updates whose `updated_at` is
 *    older than the one already in state (Supabase realtime does not
 *    guarantee strict ordering under reconnects).
 */
export function mergeItemRealtime(
  existing: DurableItemRow[],
  incoming: DurableItemRow,
): DurableItemRow[] {
  const idx = existing.findIndex((r) => r.id === incoming.id);
  if (idx < 0) {
    const next = [...existing, incoming];
    next.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    return next;
  }
  const prev = existing[idx];
  // Drop out-of-order stale event.
  if (Date.parse(incoming.updated_at) < Date.parse(prev.updated_at)) return existing;
  const next = existing.slice();
  next[idx] = incoming;
  return next;
}

/**
 * Pick the "current preview" item from a job's item list. Rules:
 *  - Prefer the first item at position 0 (single-image generations put
 *    exactly one item at pos 0; variant fan-outs are handled elsewhere).
 *  - Only return an image url if the item is completed AND the ratio
 *    enforcement stage is either not-required or completed. This
 *    prevents flashing an un-corrected master to the user.
 */
export function pickPreviewImageUrl(items: DurableItemRow[]): string | null {
  const first = items.find((r) => r.position === 0) ?? items[0];
  if (!first) return null;
  if (first.status !== "completed") return null;
  const rat = first.ratio_enforcement_status ?? "not_required";
  if (rat !== "completed" && rat !== "not_required") return null;
  return first.enforced_image_url ?? first.image_url ?? first.raw_image_url ?? null;
}

/** In-memory result of hydration decision — no side effects. */
export interface HydrationDecision {
  /** Should we re-subscribe to realtime for this job? */
  resubscribe: boolean;
  /** Should we adopt the completed image into the live preview? */
  adoptPreview: boolean;
  /** Should the stored pending-idem key be cleared? */
  clearPendingIdem: boolean;
}

export function decideHydration(input: {
  now: number;
  storedJobId: string | null;
  jobStatus: JobStatus | null;
  firstItemCompletedAt: number | null;
}): HydrationDecision {
  if (!input.storedJobId || !input.jobStatus) {
    return { resubscribe: false, adoptPreview: false, clearPendingIdem: true };
  }
  const active = input.jobStatus === "queued" || input.jobStatus === "processing";
  if (active) {
    return { resubscribe: true, adoptPreview: false, clearPendingIdem: false };
  }
  // Terminal
  const recent = shouldAdoptTerminalItem(input.now, input.firstItemCompletedAt);
  return { resubscribe: false, adoptPreview: recent, clearPendingIdem: true };
}

export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";
