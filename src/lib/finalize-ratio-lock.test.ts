import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  runFinalizeOnce,
  __resetFinalizeLocksForTests,
  __inflightIdsForTests,
} from "./finalize-ratio-lock";

describe("finalize-ratio-lock", () => {
  beforeEach(() => __resetFinalizeLocksForTests());

  it("deduplicates concurrent calls for the same item id", async () => {
    const fn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return "ok";
    });

    const [a, b, c] = await Promise.all([
      runFinalizeOnce("i1", fn),
      runFinalizeOnce("i1", fn),
      runFinalizeOnce("i1", fn),
    ]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect([a, b, c]).toEqual(["ok", "ok", "ok"]);
    expect(__inflightIdsForTests()).toEqual([]);
  });

  it("allows different item ids to run in parallel", async () => {
    const fn = vi.fn(async (v: string) => v);
    const [a, b] = await Promise.all([
      runFinalizeOnce("i1", () => fn("A")),
      runFinalizeOnce("i2", () => fn("B")),
    ]);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(a).toBe("A");
    expect(b).toBe("B");
  });

  it("allows a retry after the previous attempt settles (including rejection)", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("ok");

    await expect(runFinalizeOnce("i1", fn)).rejects.toThrow("boom");
    // After settle, the lock must be released so a retry can proceed.
    expect(__inflightIdsForTests()).toEqual([]);
    await expect(runFinalizeOnce("i1", fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
