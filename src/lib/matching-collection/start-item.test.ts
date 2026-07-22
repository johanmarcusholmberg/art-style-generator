import { describe, it, expect, vi } from "vitest";
import { canStartCandidate, startQueuedItem } from "./start-item";

describe("canStartCandidate", () => {
  it("allows queued", () => {
    expect(canStartCandidate({ itemId: "a", itemStatus: "queued" })).toBe(true);
  });
  it.each(["processing", "completed", "failed", "cancelled", "dispatching"])(
    "rejects %s",
    (s) => {
      expect(canStartCandidate({ itemId: "a", itemStatus: s })).toBe(false);
    },
  );
});

describe("startQueuedItem", () => {
  it("invokes when queued", async () => {
    const invoke = vi.fn().mockResolvedValue({ error: null });
    await startQueuedItem({ itemId: "x", itemStatus: "queued" }, invoke);
    expect(invoke).toHaveBeenCalledWith("x");
  });

  it("throws when item is not queued and does not invoke", async () => {
    const invoke = vi.fn();
    await expect(
      startQueuedItem({ itemId: "x", itemStatus: "failed" }, invoke),
    ).rejects.toThrow(/Cannot start/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("surfaces invocation errors", async () => {
    const invoke = vi.fn().mockResolvedValue({ error: { message: "nope" } });
    await expect(
      startQueuedItem({ itemId: "x", itemStatus: "queued" }, invoke),
    ).rejects.toThrow("nope");
  });
});
