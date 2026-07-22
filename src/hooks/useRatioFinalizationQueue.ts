/**
 * useRatioFinalizationQueue — thin React binding over
 * `createRatioFinalizationQueue`.
 *
 * Wraps the pure queue so a mounted page can:
 *   - `enqueue(itemId)` any number of times (deduplicated)
 *   - `retry(itemId)` a failed item (calls retry RPC → enqueue)
 *   - observe `activeItemId`, `queuedItemIds`, and per-item `outcomes`
 *   - be notified via `onOutcome` to trigger a debounced reload
 *
 * Guarantees:
 *   - One queue instance per mounted hook — stable across rerenders.
 *   - Dispose on unmount.
 *   - React state never holds Blob/Canvas/ImageBitmap.
 *   - Rendering/uploading/completion stays inside the finalizer engine.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createRatioFinalizationQueue,
  type RatioFinalizationQueue,
} from "@/lib/ratio-finalization/queue";
import {
  finalizePendingRatioItem,
  type RatioFinalizationResult,
} from "@/lib/ratio-finalization/finalizer";
import { retryRatioFinalization } from "@/lib/ratio-finalization/api";

export interface UseRatioFinalizationQueueOptions {
  /** Called after each item settles (success/skipped/failed). */
  onOutcome?: (result: RatioFinalizationResult) => void;
  /** Test hook — overrides the real finalizer engine. */
  finalize?: (itemId: string) => Promise<RatioFinalizationResult>;
}

export interface UseRatioFinalizationQueueReturn {
  enqueue: (itemId: string) => void;
  retry: (itemId: string) => Promise<void>;
  activeItemId: string | null;
  queuedItemIds: string[];
  outcomes: Map<string, RatioFinalizationResult>;
  clearOutcome: (itemId: string) => void;
  isBusy: boolean;
}

export function useRatioFinalizationQueue(
  opts: UseRatioFinalizationQueueOptions = {},
): UseRatioFinalizationQueueReturn {
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [queuedItemIds, setQueuedItemIds] = useState<string[]>([]);
  const [outcomes, setOutcomes] = useState<Map<string, RatioFinalizationResult>>(
    () => new Map(),
  );

  // Live opts — avoid queue rebinding when consumer callbacks change.
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; }, [opts]);

  // Track dedup + ordering client-side so the hook can surface it.
  const knownRef = useRef<Set<string>>(new Set());
  const orderRef = useRef<string[]>([]);

  const queueRef = useRef<RatioFinalizationQueue | null>(null);
  if (queueRef.current === null) {
    queueRef.current = createRatioFinalizationQueue({
      finalize: (itemId) => {
        // Reflect active state before starting the actual work.
        setActiveItemId(itemId);
        setQueuedItemIds(() => {
          orderRef.current = orderRef.current.filter((v) => v !== itemId);
          return orderRef.current.slice();
        });
        const finalizer = optsRef.current.finalize ?? finalizePendingRatioItem;
        return finalizer(itemId);
      },
      onResult: (result) => {
        knownRef.current.delete(result.itemId);
        setActiveItemId(null);
        setOutcomes((prev) => {
          const next = new Map(prev);
          next.set(result.itemId, result);
          return next;
        });
        try { optsRef.current.onOutcome?.(result); } catch { /* swallow */ }
      },
      onError: (itemId, err) => {
        knownRef.current.delete(itemId);
        setActiveItemId(null);
        setOutcomes((prev) => {
          const next = new Map(prev);
          next.set(itemId, {
            status: "failed",
            itemId,
            error: err instanceof Error ? err.message : String(err),
          });
          return next;
        });
      },
    });
  }

  useEffect(() => {
    return () => {
      queueRef.current?.dispose();
      queueRef.current = null;
      knownRef.current.clear();
      orderRef.current = [];
    };
  }, []);

  const enqueue = useCallback((itemId: string) => {
    if (!itemId) return;
    if (knownRef.current.has(itemId)) return;
    knownRef.current.add(itemId);
    orderRef.current.push(itemId);
    setQueuedItemIds(orderRef.current.slice());
    queueRef.current?.enqueue(itemId);
  }, []);

  const retry = useCallback(async (itemId: string) => {
    // Move the DB row from `failed` back to `pending` FIRST, then queue.
    // If the RPC rejects, do not queue — the item would only fail claim.
    await retryRatioFinalization(itemId);
    // Reset any prior outcome so UI clears the "failed" badge locally.
    setOutcomes((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Map(prev);
      next.delete(itemId);
      return next;
    });
    enqueue(itemId);
  }, [enqueue]);

  const clearOutcome = useCallback((itemId: string) => {
    setOutcomes((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Map(prev);
      next.delete(itemId);
      return next;
    });
  }, []);

  const isBusy = activeItemId !== null || queuedItemIds.length > 0;

  return {
    enqueue,
    retry,
    activeItemId,
    queuedItemIds,
    outcomes,
    clearOutcome,
    isBusy,
  };
}
