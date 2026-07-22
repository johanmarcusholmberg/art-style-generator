/**
 * createRatioFinalizationQueue — sequential, non-React queue engine.
 *
 * - Only one active item at a time.
 * - Duplicate IDs are collapsed while queued or active.
 * - `enqueue()` while an item is active continues sequentially.
 * - A single item failure does not stop later items.
 * - `dispose()` prevents future queued starts. If called mid-flight, the
 *   in-flight item finishes; no new item is picked up.
 * - Per-item outcomes are emitted via the optional `onResult` callback.
 */

import type { RatioFinalizationResult } from "./finalizer";

export interface RatioFinalizationQueue {
  enqueue: (itemId: string) => void;
  size: () => number;
  isBusy: () => boolean;
  isDisposed: () => boolean;
  dispose: () => void;
  /** Await settling of currently queued + active work (for tests). */
  drain: () => Promise<void>;
}

export interface CreateRatioFinalizationQueueOptions {
  finalize: (itemId: string) => Promise<RatioFinalizationResult>;
  onResult?: (result: RatioFinalizationResult) => void;
  onError?: (itemId: string, err: unknown) => void;
}

export function createRatioFinalizationQueue(
  opts: CreateRatioFinalizationQueueOptions,
): RatioFinalizationQueue {
  const queued: string[] = [];
  const known = new Set<string>();
  let active: string | null = null;
  let disposed = false;
  let idlePromise: Promise<void> = Promise.resolve();
  let idleResolve: (() => void) | null = null;

  const markBusy = () => {
    if (idleResolve) return;
    idlePromise = new Promise<void>((resolve) => { idleResolve = resolve; });
  };
  const markIdle = () => {
    if (idleResolve) { idleResolve(); idleResolve = null; }
  };

  const pump = async () => {
    if (active !== null) return;
    if (disposed) { markIdle(); return; }
    const next = queued.shift();
    if (next === undefined) { markIdle(); return; }
    active = next;
    try {
      const result = await opts.finalize(next);
      try { opts.onResult?.(result); } catch { /* swallow */ }
    } catch (err) {
      try { opts.onError?.(next, err); } catch { /* swallow */ }
    } finally {
      known.delete(next);
      active = null;
      // Continue with next regardless of outcome.
      void pump();
    }
  };

  return {
    enqueue(itemId: string) {
      if (disposed) return;
      if (known.has(itemId)) return;
      known.add(itemId);
      queued.push(itemId);
      markBusy();
      void pump();
    },
    size() { return queued.length + (active ? 1 : 0); },
    isBusy() { return active !== null || queued.length > 0; },
    isDisposed() { return disposed; },
    dispose() {
      disposed = true;
      queued.length = 0;
      // Drop queued IDs from the dedup set so they can be re-enqueued if
      // a fresh queue is created later.
      known.clear();
      if (active === null) markIdle();
    },
    drain() { return idlePromise; },
  };
}
