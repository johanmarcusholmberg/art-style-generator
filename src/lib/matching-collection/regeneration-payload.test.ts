import { describe, it, expect } from "vitest";
import { buildRegenerationPayload } from "./regeneration-payload";
import {
  GENERATION_REQUEST_VERSION,
  normalizeLegacyGenerationRequest,
  type GenerationRequestV2,
} from "@/lib/generation-contract-v2";

function makeOriginal(): GenerationRequestV2 {
  return normalizeLegacyGenerationRequest({
    kind: "matching_collection",
    styleKey: "mediterranean-heritage",
    mode: "mediterranean-heritage",
    prompt: "Blue Door",
    subject: "Blue Door",
    rawSubject: "Blue Door",
    anchorImageUrl: "https://x/anchor.png",
    anchorImageId: "img-anchor",
    matchingCollectionId: "col-1",
    consistencyStrength: "balanced",
    providerPreference: "gemini",
    aspectRatio: "5:7",
    backgroundStyle: "white",
    referenceStrength: "balanced",
  });
}

describe("buildRegenerationPayload", () => {
  it("does not mutate the source request", () => {
    const original = makeOriginal();
    const snapshot = JSON.stringify(original);
    buildRegenerationPayload({ original, fromItemId: "item-1" });
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("preserves anchor + subject + provider selection", () => {
    const original = makeOriginal();
    const { request, lineage } = buildRegenerationPayload({
      original,
      fromItemId: "item-1",
    });
    expect(request.sourceImageUrl).toBe("https://x/anchor.png");
    expect(request.matching?.anchorImageUrl).toBe("https://x/anchor.png");
    expect(request.matching?.subject).toBe("Blue Door");
    expect(request.providerPreference).toBe("gemini");
    expect(request.referenceStrength).toBe("balanced");
    expect(request.aspectRatio).toBe("5:7");
    expect(lineage.regeneratedFromItemId).toBe("item-1");
  });

  it("stamps current contract version", () => {
    const original = makeOriginal();
    const { request } = buildRegenerationPayload({ original, fromItemId: "item-1" });
    expect(request.version).toBe(GENERATION_REQUEST_VERSION);
  });

  it("rejects using the completed member as its own reference (url)", () => {
    const original = makeOriginal();
    expect(() =>
      buildRegenerationPayload({
        original,
        fromItemId: "item-1",
        completedOutputUrl: "https://x/anchor.png",
      }),
    ).toThrow(/reference/);
  });

  it("rejects using the completed member as its own reference (id)", () => {
    const original = makeOriginal();
    expect(() =>
      buildRegenerationPayload({
        original: { ...original, sourceImageId: "img-anchor" },
        fromItemId: "item-1",
        completedOutputId: "img-anchor",
      }),
    ).toThrow(/reference/);
  });

  it("returns a deep clone (mutating result does not affect original)", () => {
    const original = makeOriginal();
    const { request } = buildRegenerationPayload({ original, fromItemId: "item-1" });
    if (request.matching) request.matching.subject = "MUTATED";
    expect(original.matching?.subject).toBe("Blue Door");
  });

  it("requires fromItemId", () => {
    const original = makeOriginal();
    expect(() => buildRegenerationPayload({ original, fromItemId: "" })).toThrow();
  });
});
