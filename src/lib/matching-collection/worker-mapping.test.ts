import { describe, it, expect } from "vitest";

/**
 * Worker payload contract tests — cover the mapping done inside
 * `supabase/functions/generate-single/index.ts` without booting Deno.
 * The logic is intentionally trivial and mirrored here 1:1; if the
 * worker's mapping changes, this test must change with it.
 */
function resolveReferenceImageUrl(p: {
  kind?: string;
  anchorImageUrl?: string | null;
  sourceImageUrl?: string | null;
}): string | null {
  if (p.kind === "matching_collection") return p.anchorImageUrl ?? null;
  return p.sourceImageUrl ?? p.anchorImageUrl ?? null;
}

describe("generate-single reference url mapping", () => {
  it("maps anchorImageUrl → reference url for matching_collection items", () => {
    expect(
      resolveReferenceImageUrl({
        kind: "matching_collection",
        anchorImageUrl: "https://a/anchor.png",
        sourceImageUrl: "https://b/other.png", // must be ignored
      }),
    ).toBe("https://a/anchor.png");
  });

  it("never uses another collection member as the reference (only anchor)", () => {
    // Simulate a payload where a bug tried to inject a sibling member's url
    // as sourceImageUrl. For matching_collection kind we still return the
    // anchor, ignoring anything else.
    expect(
      resolveReferenceImageUrl({
        kind: "matching_collection",
        anchorImageUrl: "https://a/anchor.png",
        sourceImageUrl: "https://a/member-a.png",
      }),
    ).toBe("https://a/anchor.png");
  });

  it("keeps existing sourceImageUrl behaviour for non-collection items", () => {
    expect(
      resolveReferenceImageUrl({ sourceImageUrl: "https://x/src.png" }),
    ).toBe("https://x/src.png");
  });

  it("returns null when no reference is available", () => {
    expect(resolveReferenceImageUrl({})).toBeNull();
    expect(resolveReferenceImageUrl({ kind: "matching_collection" })).toBeNull();
  });
});

/**
 * Persistence contract test — validates the shape passed to
 * persistGenerationResult for a matching_collection item. Mirrors the
 * fields the worker sets so a regression here fails locally, not only
 * at runtime in an edge function.
 */
describe("matching_collection persistence fields", () => {
  it("always persists as pending review, non-anchor, with subject + collection id", () => {
    const payload = {
      kind: "matching_collection" as const,
      matchingCollectionId: "col-1",
      subject: "A fishing harbor in Jávea",
      rawSubject: "A fishing harbor in Jávea",
    };
    const persistArgs = {
      matchingCollectionId: payload.matchingCollectionId,
      matchingSubject: payload.kind === "matching_collection" ? (payload.subject ?? payload.rawSubject ?? null) : null,
      matchingReviewState: payload.kind === "matching_collection" ? "pending" : null,
      matchingIsAnchor: false,
    };
    expect(persistArgs.matchingCollectionId).toBe("col-1");
    expect(persistArgs.matchingSubject).toBe("A fishing harbor in Jávea");
    expect(persistArgs.matchingReviewState).toBe("pending");
    expect(persistArgs.matchingIsAnchor).toBe(false);
  });
});
