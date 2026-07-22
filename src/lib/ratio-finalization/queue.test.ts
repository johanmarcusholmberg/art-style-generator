import { describe, expect, it, vi } from "vitest";
import { createRatioFinalizationQueue } from "./queue";
import type { RatioFinalizationResult } from "./finalizer";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const ok = (id: string): RatioFinalizationResult => ({
  status: "completed", itemId: id, storagePath: `p/${id}`,
  width: 100, height: 140, operation: "pad",
});

describe("createRatioFinalizationQueue", () => {
  it("processes items sequentially, never in parallel", async () => {
    const active: string[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;
    const finalize = vi.fn().mockImplementation(async (id: string) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      active.push(id);
      await new Promise((r) => setTimeout(r, 5));
      concurrent--;
      return ok(id);
    });
    const q = createRatioFinalizationQueue({ finalize });
    q.enqueue("a"); q.enqueue("b"); q.enqueue("c");
    await q.drain();
    expect(active).toEqual(["a", "b", "c"]);
    expect(maxConcurrent).toBe(1);
    expect(finalize).toHaveBeenCalledTimes(3);
  });

  it("collapses duplicate IDs while queued or active", async () => {
    const gate = deferred<void>();
    const finalize = vi.fn().mockImplementation(async (id: string) => {
      if (id === "a") await gate.promise;
      return ok(id);
    });
    const q = createRatioFinalizationQueue({ finalize });
    q.enqueue("a"); q.enqueue("a"); q.enqueue("a"); // dedup while active
    q.enqueue("b"); q.enqueue("b"); // dedup while queued
    gate.resolve();
    await q.drain();
    const calls = finalize.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(["a", "b"]);
  });

  it("re-enqueue after completion is allowed", async () => {
    const finalize = vi.fn().mockResolvedValue(ok("a"));
    const q = createRatioFinalizationQueue({ finalize });
    q.enqueue("a");
    await q.drain();
    q.enqueue("a");
    await q.drain();
    expect(finalize).toHaveBeenCalledTimes(2);
  });

  it("failure of one item does not stop later items", async () => {
    const results: RatioFinalizationResult[] = [];
    const finalize = vi.fn().mockImplementation(async (id: string) => {
      if (id === "b") throw new Error("boom");
      return ok(id);
    });
    const errors: Array<[string, unknown]> = [];
    const q = createRatioFinalizationQueue({
      finalize,
      onResult: (r) => results.push(r),
      onError: (id, err) => errors.push([id, err]),
    });
    q.enqueue("a"); q.enqueue("b"); q.enqueue("c");
    await q.drain();
    expect(results.map((r) => r.itemId)).toEqual(["a", "c"]);
    expect(errors.map(([id]) => id)).toEqual(["b"]);
  });

  it("dispose while queued cancels future starts, in-flight completes", async () => {
    const gate = deferred<void>();
    const finalize = vi.fn().mockImplementation(async (id: string) => {
      if (id === "a") await gate.promise;
      return ok(id);
    });
    const q = createRatioFinalizationQueue({ finalize });
    q.enqueue("a"); q.enqueue("b"); q.enqueue("c");
    q.dispose();
    gate.resolve();
    await q.drain();
    // Only "a" (already in-flight) completes; b and c dropped.
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledWith("a");
    expect(q.isDisposed()).toBe(true);
  });

  it("enqueue after dispose is a no-op", async () => {
    const finalize = vi.fn().mockResolvedValue(ok("a"));
    const q = createRatioFinalizationQueue({ finalize });
    q.dispose();
    q.enqueue("a");
    await q.drain();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("onResult / onError callback throws do not break the queue", async () => {
    const finalize = vi.fn().mockImplementation(async (id: string) => {
      if (id === "b") throw new Error("x");
      return ok(id);
    });
    const q = createRatioFinalizationQueue({
      finalize,
      onResult: () => { throw new Error("bad-result-listener"); },
      onError: () => { throw new Error("bad-error-listener"); },
    });
    q.enqueue("a"); q.enqueue("b"); q.enqueue("c");
    await q.drain();
    expect(finalize).toHaveBeenCalledTimes(3);
  });
});
