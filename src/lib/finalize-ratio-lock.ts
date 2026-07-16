/**
 * Per-item ratio-finalization lock.
 *
 * Ratio enforcement (poster-ratio-enforce) can be triggered by more
 * than one code path: the realtime handler when a new item lands, the
 * hydration path when the tab is re-opened after the item completed,
 * and any manual "reprocess" affordance. All of those must converge to
 * a SINGLE canvas-side correction per item, or we risk uploading two
 * enforced masters for the same generation and racing the
 * `finalize_ratio_enforcement` RPC.
 *
 * This module exposes a small in-memory lock keyed by item id. It is
 * intentionally a module-scoped singleton so multiple hook instances
 * (e.g. two components watching the same job) still share the same
 * lock table.
 */

type Runner<T> = () => Promise<T>;

const inflight = new Map<string, Promise<unknown>>();

/**
 * Run `fn` for the given item id at most once concurrently. If another
 * call for the same id is already in-flight, its promise is returned
 * so both callers observe the same result — and only one network /
 * canvas pass happens.
 *
 * The map entry is cleared once the promise settles so a later retry
 * (e.g. after a hard error) can run again.
 */
export function runFinalizeOnce<T>(itemId: string, fn: Runner<T>): Promise<T> {
  const existing = inflight.get(itemId) as Promise<T> | undefined;
  if (existing) return existing;

  const p = (async () => {
    try {
      return await fn();
    } finally {
      // Clear only if this exact promise is still the registered one.
      if (inflight.get(itemId) === p) inflight.delete(itemId);
    }
  })();

  inflight.set(itemId, p);
  return p;
}

/** Test-only: reset the internal lock table. */
export function __resetFinalizeLocksForTests(): void {
  inflight.clear();
}

/** Test-only: inspect current in-flight ids. */
export function __inflightIdsForTests(): string[] {
  return Array.from(inflight.keys());
}
