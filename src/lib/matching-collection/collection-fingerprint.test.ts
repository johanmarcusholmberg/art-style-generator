import { describe, it, expect } from "vitest";
import {
  buildFingerprintPayload,
  computeCollectionFingerprint,
  computeCollectionFingerprintSync,
  normalizeSubjectsForFingerprint,
  type FingerprintInput,
} from "./collection-fingerprint";

const BASE: FingerprintInput = {
  scope: "create",
  subjects: ["Blue Door", "Olive Grove"],
  anchor: {
    imageId: "img-1",
    imageUrl: "https://example.com/a.png",
    widthPx: 1024,
    heightPx: 1434,
  },
  artDirectionVersion: 1,
  consistencyStrength: "balanced",
  posterFormatId: "5x7",
  aspectRatio: "5:7",
  backgroundStyle: "white",
  resolvedProvider: "gemini",
  resolvedModel: "gemini-2.5-flash-image",
};

describe("normalizeSubjectsForFingerprint", () => {
  it("collapses whitespace, trims, dedupes case-insensitively, preserves order", () => {
    expect(
      normalizeSubjectsForFingerprint([
        "  Blue   Door  ",
        "\nblue door\n",
        "Olive Grove",
        "olive grove",
      ]),
    ).toEqual(["Blue Door", "Olive Grove"]);
  });
  it("drops empty entries and non-strings", () => {
    // @ts-expect-error deliberately invalid
    expect(normalizeSubjectsForFingerprint(["", "  ", 42, null, "x"])).toEqual(["x"]);
  });
});

describe("computeCollectionFingerprint stability", () => {
  it("identical logical requests produce identical fingerprints (sync)", () => {
    const a = computeCollectionFingerprintSync(BASE);
    const b = computeCollectionFingerprintSync({ ...BASE });
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
  it("identical logical requests produce identical fingerprints (async)", async () => {
    const a = await computeCollectionFingerprint(BASE);
    const b = await computeCollectionFingerprint({ ...BASE });
    expect(a).toBe(b);
  });
  it("blank lines and superficial whitespace do not change it", () => {
    const a = computeCollectionFingerprintSync(BASE);
    const b = computeCollectionFingerprintSync({
      ...BASE,
      // Same first-spellings, plus noise: extra spaces, blank line, and a
      // duplicate case-only variant that must be de-duped.
      subjects: ["  Blue   Door  ", "\n\n", "Olive Grove", "olive grove"],
    });
    expect(a).toBe(b);
  });
  it("subject order changes it", () => {
    const a = computeCollectionFingerprintSync(BASE);
    const b = computeCollectionFingerprintSync({
      ...BASE,
      subjects: ["Olive Grove", "Blue Door"],
    });
    expect(a).not.toBe(b);
  });

  const perturbations: Array<[string, Partial<FingerprintInput>]> = [
    ["scope", { scope: "col-abc" }],
    ["anchor.imageId", { anchor: { ...BASE.anchor, imageId: "img-2" } }],
    ["anchor.imageUrl", { anchor: { ...BASE.anchor, imageUrl: "https://x/b.png" } }],
    ["anchor.widthPx", { anchor: { ...BASE.anchor, widthPx: 999 } }],
    ["artDirectionVersion", { artDirectionVersion: 2 }],
    ["consistencyStrength", { consistencyStrength: "strict" }],
    ["posterFormatId", { posterFormatId: "a3" }],
    ["aspectRatio", { aspectRatio: "3:4" }],
    ["backgroundStyle", { backgroundStyle: "cream" }],
    ["resolvedProvider", { resolvedProvider: "sdxl" }],
    ["resolvedModel", { resolvedModel: "other-model" }],
    ["contractVersion", { contractVersion: 99 }],
  ];
  for (const [name, patch] of perturbations) {
    it(`changing ${name} changes fingerprint`, () => {
      const a = computeCollectionFingerprintSync(BASE);
      const b = computeCollectionFingerprintSync({ ...BASE, ...patch } as FingerprintInput);
      expect(a).not.toBe(b);
    });
  }

  it("canonical serialization sorts object keys deterministically", () => {
    // Different construction order → same payload string.
    const p1 = buildFingerprintPayload(BASE);
    const reordered: FingerprintInput = {
      resolvedModel: BASE.resolvedModel,
      resolvedProvider: BASE.resolvedProvider,
      backgroundStyle: BASE.backgroundStyle,
      aspectRatio: BASE.aspectRatio,
      posterFormatId: BASE.posterFormatId,
      consistencyStrength: BASE.consistencyStrength,
      artDirectionVersion: BASE.artDirectionVersion,
      anchor: BASE.anchor,
      subjects: BASE.subjects,
      scope: BASE.scope,
    };
    expect(buildFingerprintPayload(reordered)).toBe(p1);
  });
});
