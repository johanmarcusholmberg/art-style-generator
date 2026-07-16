/**
 * Tests for retryFailedItems — the browser must NOT mutate job/item rows
 * directly; retries must go through the authenticated
 * `generate-single-item-retry` edge function so lease and attempt
 * bookkeeping stay intact.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const selectMock = vi.fn();
const eq1Mock = vi.fn();
const eq2Mock = vi.fn();
const fromMock = vi.fn();
const invokeMock = vi.fn().mockResolvedValue({ data: null, error: null });
const updateMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

import { retryFailedItems } from "./batch-jobs";

beforeEach(() => {
  vi.clearAllMocks();
  // Chain: from().select().eq().eq() → { data: [{id: 'a'}, {id: 'b'}] }
  eq2Mock.mockResolvedValue({ data: [{ id: "a" }, { id: "b" }], error: null });
  eq1Mock.mockReturnValue({ eq: eq2Mock });
  selectMock.mockReturnValue({ eq: eq1Mock });
  fromMock.mockReturnValue({ select: selectMock, update: updateMock });
});

describe("retryFailedItems (durable path)", () => {
  it("dispatches generate-single-item-retry per failed item and never mutates job rows", async () => {
    await retryFailedItems("job-1");
    // No direct table mutation is permitted anymore.
    expect(updateMock).not.toHaveBeenCalled();
    // One invocation per failed item.
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenCalledWith("generate-single-item-retry", {
      body: { itemId: "a" },
    });
    expect(invokeMock).toHaveBeenCalledWith("generate-single-item-retry", {
      body: { itemId: "b" },
    });
    // No call to batch-generate — the old sweep path is gone.
    for (const call of invokeMock.mock.calls) {
      expect(call[0]).not.toBe("batch-generate");
    }
  });

  it("no-ops cleanly when there are no failed items", async () => {
    eq2Mock.mockResolvedValueOnce({ data: [], error: null });
    await retryFailedItems("job-2");
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
