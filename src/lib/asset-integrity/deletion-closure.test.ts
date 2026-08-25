/**
 * Closure coverage for the deletion lifecycle (single-user/admin generator).
 *
 * These tests pin the execution-level guarantees that the pure planner tests
 * cannot see: what is actually sent to the admin RPC, and when a Storage
 * object may be removed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const fromMock = vi.fn();
const removeMock = vi.fn(async () => ({ error: null }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
    storage: { from: () => ({ remove: (...a: unknown[]) => removeMock(...(a as [])) }) },
  },
}));

import {
  cleanupStorage,
  executeAssetMutation,
  previewCollectionMembershipRemoval,
} from "./mutation-service";

/** Table stub: `.select().is().eq()|.or().limit()` resolving to fixed rows. */
function tableStub(rows: unknown[]) {
  const limit = async () => ({ data: rows });
  return {
    select: () => ({
      is: () => ({ eq: () => ({ limit }), or: () => ({ limit }) }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fromMock.mockReturnValue(tableStub([]));
});

describe("collection membership removal", () => {
  it("calls the membership-only RPC and never targets the artwork or storage", async () => {
    rpcMock.mockResolvedValueOnce({ data: { ok: true, noop: false }, error: null });

    const res = await executeAssetMutation(
      previewCollectionMembershipRemoval("img-1", "mem-1", "col-1"),
    );

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe("execute_asset_mutation");
    expect(args.p_mode).toBe("remove_membership");
    expect(args.p_membership_id).toBe("mem-1");
    expect(args.p_root_image_id).toBeNull();
    expect(args.p_asset_id).toBeNull();
    expect(args.p_promote_asset_id).toBeNull();
    expect(res.storageRemoved).toEqual([]);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("reports a repeated removal as a no-op rather than an error", async () => {
    rpcMock.mockResolvedValueOnce({ data: { ok: true, noop: true }, error: null });
    const res = await executeAssetMutation(
      previewCollectionMembershipRemoval("img-1", "mem-1", "col-1"),
    );
    expect(res.ok).toBe(true);
    expect(res.noop).toBe(true);
    expect(removeMock).not.toHaveBeenCalled();
  });
});

describe("reference-safe storage cleanup", () => {
  it("removes an object no live row references", async () => {
    const res = await cleanupStorage(["orphan.png"]);
    expect(removeMock).toHaveBeenCalledWith(["orphan.png"]);
    expect(res.removed).toEqual(["orphan.png"]);
    expect(res.failures).toEqual([]);
  });

  it("keeps an object still referenced by a live version row", async () => {
    fromMock.mockImplementation((table: string) =>
      tableStub(table === "generated_image_assets" ? [{ id: "asset-live" }] : []),
    );
    const res = await cleanupStorage(["shared.png"]);
    expect(removeMock).not.toHaveBeenCalled();
    expect(res.removed).toEqual([]);
  });

  it("keeps an object still referenced by a live root image", async () => {
    fromMock.mockImplementation((table: string) =>
      tableStub(table === "generated_images" ? [{ id: "root-live" }] : []),
    );
    const res = await cleanupStorage(["shared.png"]);
    expect(removeMock).not.toHaveBeenCalled();
    expect(res.removed).toEqual([]);
  });

  it("reports a storage failure without claiming the file was removed", async () => {
    removeMock.mockResolvedValueOnce({ error: { message: "nope" } } as never);
    const res = await cleanupStorage(["orphan.png"]);
    expect(res.removed).toEqual([]);
    expect(res.failures).toEqual(["orphan.png"]);
  });
});

describe("blocked previews", () => {
  it("never reaches the database when the plan is blocked", async () => {
    await expect(
      executeAssetMutation({
        ...previewCollectionMembershipRemoval("img-1", "mem-1", "col-1"),
        blocked: true,
        mode: "blocked",
      }),
    ).rejects.toThrow();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
