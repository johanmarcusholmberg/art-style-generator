import { describe, it, expect } from "vitest";
import {
  joinMembers,
  memberDisplayStatus,
  type RawItemRow,
  type RawImageRow,
} from "./members-query";
import { reviewStatePatch } from "./review";

function item(overrides: Partial<RawItemRow>): RawItemRow {
  return {
    id: "i1",
    job_id: "j1",
    position: 0,
    status: "queued",
    prompt_variant: null,
    request_payload: null,
    error_message: null,
    regenerated_from_item_id: null,
    ratio_enforcement_status: null,
    gallery_image_id: null,
    storage_path: null,
    image_url: null,
    attempt_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("joinMembers", () => {
  it("keeps queued items even without a generated_images row", () => {
    const out = joinMembers(
      [item({ id: "a", position: 1, status: "queued", request_payload: { subject: "cat" } })],
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0].itemStatus).toBe("queued");
    expect(out[0].subject).toBe("cat");
    expect(out[0].reviewState).toBeNull();
  });

  it("orders by position", () => {
    const out = joinMembers(
      [item({ id: "b", position: 2 }), item({ id: "a", position: 0 }), item({ id: "c", position: 1 })],
      [],
    );
    expect(out.map((m) => m.itemId)).toEqual(["a", "c", "b"]);
  });

  it("joins the persisted image, preferring its storage_path and review state", () => {
    const out = joinMembers(
      [item({ id: "i", status: "completed", storage_path: "old/path.png" })],
      [
        {
          id: "img-1",
          storage_path: "new/path.png",
          matching_subject: "seahorse",
          matching_review_state: "accepted",
          is_archived: false,
          deleted_at: null,
          generation_job_item_id: "i",
        } satisfies RawImageRow,
      ],
    );
    expect(out[0].storagePath).toBe("new/path.png");
    expect(out[0].generatedImageId).toBe("img-1");
    expect(out[0].reviewState).toBe("accepted");
    expect(out[0].subject).toBe("seahorse");
  });

  it("ignores soft-deleted images", () => {
    const out = joinMembers(
      [item({ id: "i", status: "completed" })],
      [
        {
          id: "img-x",
          storage_path: "x.png",
          matching_subject: "",
          matching_review_state: "accepted",
          is_archived: false,
          deleted_at: "2026-02-01T00:00:00Z",
          generation_job_item_id: "i",
        },
      ],
    );
    expect(out[0].generatedImageId).toBeNull();
  });
});

describe("memberDisplayStatus", () => {
  const base = joinMembers([item({ id: "x", status: "queued" })], [])[0];
  it("labels regenerating candidates distinctly from fresh queued items", () => {
    expect(memberDisplayStatus({ ...base, itemStatus: "queued", regeneratedFromItemId: "src" })).toBe("Regenerating");
    expect(memberDisplayStatus({ ...base, itemStatus: "queued" })).toBe("Queued");
  });
  it("collapses dispatching + processing into Generating", () => {
    expect(memberDisplayStatus({ ...base, itemStatus: "dispatching" })).toBe("Generating");
    expect(memberDisplayStatus({ ...base, itemStatus: "processing" })).toBe("Generating");
  });
  it("flags completed items whose image never persisted", () => {
    expect(memberDisplayStatus({ ...base, itemStatus: "completed" })).toBe("Recoverable — image missing");
  });
  it("uses the review state once the image exists", () => {
    const completed = { ...base, itemStatus: "completed" as const, storagePath: "p.png" };
    expect(memberDisplayStatus({ ...completed, reviewState: null })).toBe("Completed — pending review");
    expect(memberDisplayStatus({ ...completed, reviewState: "accepted" })).toBe("Accepted");
    expect(memberDisplayStatus({ ...completed, reviewState: "rejected" })).toBe("Rejected");
  });
});

describe("reviewStatePatch", () => {
  it("archives on reject, restores visibility on accept and pending", () => {
    expect(reviewStatePatch("rejected")).toEqual({ matching_review_state: "rejected", is_archived: true });
    expect(reviewStatePatch("accepted")).toEqual({ matching_review_state: "accepted", is_archived: false });
    expect(reviewStatePatch("pending")).toEqual({ matching_review_state: "pending", is_archived: false });
  });
});
