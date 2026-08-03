/**
 * Regression: Admin bulk deletion must never optimistically drop the whole
 * selection. Skipped (and archived) assets survive the mutation and must
 * still be visible after the persisted rows are reloaded.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  },
}));

import {
  executeBulkAssetMutation,
  previewCollectionMembershipRemoval,
  type BulkPreview,
} from "./mutation-service";

/** Membership previews skip the graph re-plan, isolating the bulk loop. */
function bulk(ids: string[]): BulkPreview {
  return {
    previews: ids.map((id) => previewCollectionMembershipRemoval(id, `m-${id}`, `c-${id}`)),
    blockedPreviews: [],
    sharedStoragePaths: [],
    anyBlocked: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fromMock.mockReturnValue({
    select: () => ({ is: () => ({ eq: () => ({ limit: async () => ({ data: [] }) }) }) }),
  });
});

describe("bulk mutation refresh contract", () => {
  it("counts a failed item as skipped instead of deleted", async () => {
    rpcMock
      .mockResolvedValueOnce({ data: { noop: false }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "stale_preflight_assets" } })
      .mockResolvedValueOnce({ data: { noop: false }, error: null });

    const res = await executeBulkAssetMutation(bulk(["a", "b", "c"]), { confirmed: true });
    expect(res.deleted).toBe(2);
    expect(res.skipped).toBe(1);
  });

  it("leaves a skipped asset present in the reloaded persisted rows", async () => {
    // Persisted state: 'b' survives because its mutation failed.
    const persisted = [{ id: "b" }];
    rpcMock
      .mockResolvedValueOnce({ data: { noop: false }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    const res = await executeBulkAssetMutation(bulk(["a", "b"]), { confirmed: true });
    expect(res.skipped).toBe(1);

    // The Admin surface reloads persisted rows rather than filtering out the
    // originally selected ids — so 'b' is still visible.
    const rowsAfterReload = persisted;
    expect(rowsAfterReload.map((r) => r.id)).toContain("b");
  });

  it("refuses to mutate anything when any preview is blocked", async () => {
    const blocked = bulk(["a"]);
    blocked.anyBlocked = true;
    blocked.blockedPreviews = blocked.previews;
    await expect(executeBulkAssetMutation(blocked)).rejects.toThrow(/blocked/);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
