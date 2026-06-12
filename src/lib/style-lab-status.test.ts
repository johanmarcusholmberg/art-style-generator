/**
 * Focused tests for the review-workflow consolidation:
 *  - `setImageAdminStatus` writes admin_status directly
 *  - `setImageRejected` / `setImageArchived` only touch the curator flag
 *    (the DB trigger reconciles admin_status server-side — verified via SQL)
 *  - `bulkSetImageAdminStatus` issues a single .in("id", ids) update
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const calls = {
  updates: [] as any[],
  eq: [] as Array<{ col: string; val: unknown }>,
  in: [] as Array<{ col: string; values: unknown[] }>,
};

vi.mock("@/integrations/supabase/client", () => {
  const tableFrom = () => {
    const result = { data: null, error: null };
    const api: any = {
      update: vi.fn((payload: any) => {
        calls.updates.push(payload);
        return api;
      }),
      eq: vi.fn((col: string, val: unknown) => {
        calls.eq.push({ col, val });
        return Promise.resolve(result);
      }),
      in: vi.fn((col: string, values: unknown[]) => {
        calls.in.push({ col, values });
        return Promise.resolve(result);
      }),
    };
    return api;
  };

  return {
    supabase: {
      from: tableFrom,
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
    },
  };
});

import {
  setImageAdminStatus,
  setImageRejected,
  setImageArchived,
  bulkSetImageAdminStatus,
} from "./style-lab";

beforeEach(() => {
  calls.updates = [];
  calls.eq = [];
  calls.in = [];
});

describe("style-lab · review-status helpers", () => {
  it("setImageAdminStatus writes admin_status only (trigger derives flags)", async () => {
    await setImageAdminStatus("img-1", "approved");
    expect(calls.updates).toEqual([{ admin_status: "approved" }]);
    expect(calls.eq).toEqual([{ col: "id", val: "img-1" }]);
  });

  it("setImageRejected only writes is_rejected (trigger handles admin_status)", async () => {
    await setImageRejected("img-2", true);
    expect(calls.updates).toEqual([{ is_rejected: true }]);
    expect(calls.eq).toEqual([{ col: "id", val: "img-2" }]);
  });

  it("setImageArchived only writes is_archived (trigger handles admin_status)", async () => {
    await setImageArchived("img-3", true);
    expect(calls.updates).toEqual([{ is_archived: true }]);
    expect(calls.eq).toEqual([{ col: "id", val: "img-3" }]);
  });

  it("bulkSetImageAdminStatus issues a single .in() update across all ids", async () => {
    await bulkSetImageAdminStatus(["a", "b", "c"], "needs_review");
    expect(calls.updates).toEqual([{ admin_status: "needs_review" }]);
    expect(calls.in).toEqual([{ col: "id", values: ["a", "b", "c"] }]);
  });

  it("bulkSetImageAdminStatus is a no-op for empty input", async () => {
    await bulkSetImageAdminStatus([], "rejected");
    expect(calls.updates).toEqual([]);
    expect(calls.in).toEqual([]);
  });
});
