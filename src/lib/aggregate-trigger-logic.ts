/**
 * Pure mirror of `public.update_generation_job_aggregate` trigger logic.
 *
 * Kept in TS so we can exhaustively regression-test the invariants that
 * the SQL trigger promises, WITHOUT requiring a live database. Any
 * change to the trigger MUST be mirrored here in the same PR (or vice
 * versa) — the tests will catch obvious drift.
 *
 * Invariants:
 *  1. If the current job status is 'cancelled', it stays cancelled;
 *     counters are still refreshed.
 *  2. When every item is terminal:
 *       - all failed  → 'failed'
 *       - otherwise   → 'completed'    (mixed successes+failures still ok)
 *  3. When some items are terminal but others are not → 'processing'.
 *  4. When no items are terminal yet → 'queued'.
 */

export type ItemStatus = "queued" | "dispatching" | "processing" | "completed" | "failed" | "cancelled";
export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export interface AggregateInput {
  currentJobStatus: JobStatus;
  itemStatuses: ItemStatus[];
}

export interface AggregateResult {
  status: JobStatus;
  completed: number;
  failed: number;
}

export function computeJobAggregate(input: AggregateInput): AggregateResult {
  const items = input.itemStatuses;
  const completed = items.filter((s) => s === "completed").length;
  const failed = items.filter((s) => s === "failed").length;

  if (input.currentJobStatus === "cancelled") {
    return { status: "cancelled", completed, failed };
  }

  const total = items.length;
  const terminal = completed + failed;

  if (total === 0) return { status: "queued", completed: 0, failed: 0 };
  if (terminal >= total) {
    return { status: completed === 0 ? "failed" : "completed", completed, failed };
  }
  if (terminal > 0) return { status: "processing", completed, failed };
  return { status: "queued", completed, failed };
}
