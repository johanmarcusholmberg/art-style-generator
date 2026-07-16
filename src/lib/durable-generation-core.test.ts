import { describe, it, expect } from "vitest";
import {
  pendingIdemKey,
  currentJobKey,
  shouldAdoptTerminalItem,
  mergeItemRealtime,
  pickPreviewImageUrl,
  decideHydration,
  type DurableItemRow,
} from "./durable-generation-core";
import { RECENT_ADOPT_WINDOW_MS } from "./durable-generation-constants";

function row(over: Partial<DurableItemRow>): DurableItemRow {
  return {
    id: "i",
    job_id: "j",
    status: "queued",
    image_url: null,
    enforced_image_url: null,
    raw_image_url: null,
    ratio_enforcement_status: "not_required",
    storage_path: null,
    completed_at: null,
    updated_at: new Date(1_000_000).toISOString(),
    position: 0,
    ...over,
  };
}

describe("durable-generation-core storage keys", () => {
  it("scopes keys per style so pages do not collide", () => {
    expect(pendingIdemKey("lineart")).not.toEqual(pendingIdemKey("popart"));
    expect(currentJobKey("lineart")).not.toEqual(currentJobKey("popart"));
    expect(pendingIdemKey("lineart")).not.toEqual(currentJobKey("lineart"));
  });
});

describe("shouldAdoptTerminalItem", () => {
  const now = 10_000_000;
  it("adopts items completed inside the window", () => {
    expect(shouldAdoptTerminalItem(now, now - RECENT_ADOPT_WINDOW_MS + 1)).toBe(true);
  });
  it("rejects items completed outside the window", () => {
    expect(shouldAdoptTerminalItem(now, now - RECENT_ADOPT_WINDOW_MS - 1)).toBe(false);
  });
  it("rejects when completedAt is missing", () => {
    expect(shouldAdoptTerminalItem(now, null)).toBe(false);
  });
});

describe("mergeItemRealtime", () => {
  it("appends unknown ids and keeps items sorted by position", () => {
    const a = row({ id: "a", position: 1 });
    const b = row({ id: "b", position: 0 });
    const merged = mergeItemRealtime([a], b);
    expect(merged.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("replaces newer updates and drops out-of-order stale events", () => {
    const t1 = new Date(1000).toISOString();
    const t2 = new Date(2000).toISOString();
    const first = row({ id: "a", status: "processing", updated_at: t2 });
    const stale = row({ id: "a", status: "queued", updated_at: t1 });
    const fresh = row({ id: "a", status: "completed", updated_at: new Date(3000).toISOString() });
    expect(mergeItemRealtime([first], stale)).toEqual([first]);
    expect(mergeItemRealtime([first], fresh)[0].status).toBe("completed");
  });
});

describe("pickPreviewImageUrl", () => {
  it("returns null while item is not completed", () => {
    expect(pickPreviewImageUrl([row({ status: "processing", image_url: "x" })])).toBeNull();
  });
  it("returns null while ratio enforcement is pending", () => {
    expect(
      pickPreviewImageUrl([
        row({ status: "completed", image_url: "x", ratio_enforcement_status: "pending" }),
      ]),
    ).toBeNull();
  });
  it("prefers enforced url, then image_url, then raw", () => {
    expect(
      pickPreviewImageUrl([
        row({
          status: "completed",
          ratio_enforcement_status: "completed",
          enforced_image_url: "E",
          image_url: "I",
          raw_image_url: "R",
        }),
      ]),
    ).toBe("E");
  });
});

describe("decideHydration", () => {
  const now = 10_000_000;
  it("no stored job → clear key, do nothing else", () => {
    expect(decideHydration({ now, storedJobId: null, jobStatus: null, firstItemCompletedAt: null }))
      .toEqual({ resubscribe: false, adoptPreview: false, clearPendingIdem: true });
  });
  it("active job → resubscribe, keep pending key", () => {
    expect(
      decideHydration({
        now,
        storedJobId: "j",
        jobStatus: "processing",
        firstItemCompletedAt: null,
      }),
    ).toEqual({ resubscribe: true, adoptPreview: false, clearPendingIdem: false });
  });
  it("terminal + recent → adopt preview and clear key", () => {
    expect(
      decideHydration({
        now,
        storedJobId: "j",
        jobStatus: "completed",
        firstItemCompletedAt: now - 1000,
      }),
    ).toEqual({ resubscribe: false, adoptPreview: true, clearPendingIdem: true });
  });
  it("terminal + stale → clear key, suppress preview adoption", () => {
    expect(
      decideHydration({
        now,
        storedJobId: "j",
        jobStatus: "completed",
        firstItemCompletedAt: now - RECENT_ADOPT_WINDOW_MS - 1,
      }),
    ).toEqual({ resubscribe: false, adoptPreview: false, clearPendingIdem: true });
  });
});
