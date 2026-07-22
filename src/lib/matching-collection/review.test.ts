import { describe, it, expect } from "vitest";
import { reviewStatePatch, reviewPrimaryAction } from "./review";

describe("reviewStatePatch", () => {
  it("accepted unarchives", () => {
    expect(reviewStatePatch("accepted")).toEqual({
      matching_review_state: "accepted",
      is_archived: false,
    });
  });
  it("rejected archives", () => {
    expect(reviewStatePatch("rejected")).toEqual({
      matching_review_state: "rejected",
      is_archived: true,
    });
  });
  it("pending (restore) unarchives", () => {
    expect(reviewStatePatch("pending")).toEqual({
      matching_review_state: "pending",
      is_archived: false,
    });
  });
});

describe("reviewPrimaryAction", () => {
  it("returns Keep for pending", () => {
    expect(reviewPrimaryAction("pending")).toEqual({ label: "Keep", target: "accepted" });
  });
  it("returns Keep for accepted (still available as no-op guard target)", () => {
    expect(reviewPrimaryAction("accepted").label).toBe("Keep");
  });
  it("returns Restore for rejected → pending (not directly accepted)", () => {
    expect(reviewPrimaryAction("rejected")).toEqual({ label: "Restore", target: "pending" });
  });
  it("returns Keep for null / unknown", () => {
    expect(reviewPrimaryAction(null).label).toBe("Keep");
    expect(reviewPrimaryAction(undefined).label).toBe("Keep");
  });
});
