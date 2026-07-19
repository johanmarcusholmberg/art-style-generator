import { describe, it, expect } from "vitest";
import {
  parseSubjects,
  buildCollectionItems,
  MAX_COLLECTION_SUBJECTS,
} from "./create-job";
import { composeCollectionPrompt, COLLECTION_BLOCK_HEADER } from "./prompt-composer";
import { consistencyToReferenceStrength, isConsistencyStrength } from "./consistency-strength";
import { sanitizeArtDirection } from "./anchor-analysis";
import { resolveCollectionProvider } from "./provider-capability";
import { ART_DIRECTION_VERSION, type AnchorInheritedSettings, type CollectionArtDirection, type ResolvedCollectionProvider } from "./types";

const ANCHOR_URL = "https://example.com/anchor.png";

const BASE_ANCHOR: AnchorInheritedSettings = {
  styleKey: "mediterranean-heritage",
  posterFormatId: "5x7",
  aspectRatio: "5:7",
  backgroundStyle: "white",
  provider: "openai",
  model: "gpt-image-2",
  referenceStrength: "balanced",
  anchorWidthPx: 1024,
  anchorHeightPx: 1434,
};

const BASE_PROVIDER: ResolvedCollectionProvider = {
  providerPreference: "openai",
  provider: "openai",
  model: "gpt-image-2",
  substituted: false,
  reason: null,
  estimatedCostPerImageUsd: 0.04,
};

const SAMPLE_AD: CollectionArtDirection = {
  palette: ["#1E3A5F", "#EDE1C9"],
  colorMood: "cool coastal",
  lighting: "soft directional afternoon",
  composition: "centered subject, symmetrical",
  subjectScale: "medium",
  negativeSpace: "generous",
  texture: "matte, screenprint-like",
  framing: "full-bleed",
  detailDensity: "low",
  mood: "calm, sunlit",
  textPolicy: "no text",
};

describe("parseSubjects", () => {
  it("ignores blank lines and trims whitespace", () => {
    const r = parseSubjects("\n  A \n\nB\n   \nC\n");
    expect(r.subjects).toEqual(["A", "B", "C"]);
    expect(r.ignoredBlankLines).toBeGreaterThan(0);
    expect(r.truncated).toBe(false);
  });

  it("deduplicates case-insensitively while preserving order", () => {
    const r = parseSubjects("Blue Door\nblue door\nOlive Grove");
    expect(r.subjects).toEqual(["Blue Door", "Olive Grove"]);
  });

  it("caps at MAX_COLLECTION_SUBJECTS and reports truncation", () => {
    const raw = Array.from({ length: MAX_COLLECTION_SUBJECTS + 5 }, (_, i) => `S${i}`).join("\n");
    const r = parseSubjects(raw);
    expect(r.subjects.length).toBe(MAX_COLLECTION_SUBJECTS);
    expect(r.truncated).toBe(true);
  });
});

describe("consistencyToReferenceStrength", () => {
  it("maps loose/balanced/strict per spec", () => {
    expect(consistencyToReferenceStrength("loose")).toBe("inspiration");
    expect(consistencyToReferenceStrength("balanced")).toBe("balanced");
    expect(consistencyToReferenceStrength("strict")).toBe("strong_reference");
  });
  it("isConsistencyStrength guards unknown values", () => {
    expect(isConsistencyStrength("balanced")).toBe(true);
    expect(isConsistencyStrength("near_original")).toBe(false);
  });
});

describe("composeCollectionPrompt", () => {
  it("includes subject and collection block header", () => {
    const p = composeCollectionPrompt({
      subject: "A tiled entrance in Seville",
      artDirection: SAMPLE_AD,
      consistencyStrength: "balanced",
    });
    expect(p).toContain("A tiled entrance in Seville");
    expect(p).toContain(COLLECTION_BLOCK_HEADER);
    expect(p).toContain("cool coastal");
  });

  it("gracefully falls back when art direction is null", () => {
    const p = composeCollectionPrompt({
      subject: "A fishing harbor in Jávea",
      artDirection: null,
      consistencyStrength: "loose",
    });
    expect(p).toContain("A fishing harbor in Jávea");
    expect(p).toContain("attached collection reference image");
  });

  it("does not re-emit style-registry prompt rules", () => {
    const p = composeCollectionPrompt({
      subject: "Whitewashed street",
      artDirection: SAMPLE_AD,
      consistencyStrength: "strict",
    });
    // The composer must never leak canonical style rules — those are added
    // exactly once by the prompt-compiler pipeline downstream.
    expect(p.toLowerCase()).not.toContain("style key:");
    expect(p.toLowerCase()).not.toContain("mediterranean-heritage");
  });
});

describe("sanitizeArtDirection", () => {
  it("rejects garbage", () => {
    expect(sanitizeArtDirection(null)).toBeNull();
    expect(sanitizeArtDirection(123)).toBeNull();
    expect(sanitizeArtDirection({})).toBeNull();
  });
  it("keeps well-formed art direction and trims long strings", () => {
    const long = "x".repeat(500);
    const cleaned = sanitizeArtDirection({ ...SAMPLE_AD, mood: long });
    expect(cleaned).not.toBeNull();
    expect(cleaned!.mood.length).toBeLessThanOrEqual(240);
  });
});

describe("resolveCollectionProvider", () => {
  it("keeps the anchor's provider when it supports image-to-image", () => {
    const r = resolveCollectionProvider(BASE_ANCHOR);
    expect(r.substituted).toBe(false);
    expect(r.provider).toBe("openai");
    expect(r.model).toBe("gpt-image-2");
  });

  it("substitutes when the anchor provider does not support i2i (SDXL)", () => {
    const r = resolveCollectionProvider({ ...BASE_ANCHOR, provider: "sdxl", model: "stability-ai/sdxl" });
    expect(r.substituted).toBe(true);
    expect(r.reason).toMatch(/does not support image-to-image/i);
    expect(["openai", "gemini", "sdxl", "auto"]).toContain(r.provider);
  });
});

describe("buildCollectionItems", () => {
  it("uses the SAME anchorImageUrl on every item (fan-out, never chained)", () => {
    const items = buildCollectionItems({
      subjects: ["A", "B", "C"],
      anchorImageUrl: ANCHOR_URL,
      anchorImageId: null,
      matchingCollectionId: "col-1",
      anchor: BASE_ANCHOR,
      artDirection: SAMPLE_AD,
      consistencyStrength: "balanced",
      provider: BASE_PROVIDER,
    });
    expect(items).toHaveLength(3);
    for (const it of items) expect(it.anchorImageUrl).toBe(ANCHOR_URL);
  });

  it("inherits style, provider preference, aspect ratio, poster format", () => {
    const items = buildCollectionItems({
      subjects: ["A"],
      anchorImageUrl: ANCHOR_URL,
      anchorImageId: null,
      matchingCollectionId: "col-1",
      anchor: BASE_ANCHOR,
      artDirection: SAMPLE_AD,
      consistencyStrength: "balanced",
      provider: BASE_PROVIDER,
    });
    const [it] = items;
    expect(it.styleKey).toBe(BASE_ANCHOR.styleKey);
    expect(it.providerPreference).toBe("openai");
    expect(it.aspectRatio).toBe("5:7");
    expect(it.printFormatId).toBe("5x7");
    expect(it.artDirectionVersion).toBe(ART_DIRECTION_VERSION);
    expect(it.referenceStrength).toBe("balanced");
    expect(it.subject).toBe("A");
    expect(it.rawSubject).toBe("A");
    expect(it.prompt).toContain("A");
    expect(it.prompt).toContain(COLLECTION_BLOCK_HEADER);
  });

  it("never places a previous collection member as another item's reference", () => {
    const items = buildCollectionItems({
      subjects: ["A", "B"],
      anchorImageUrl: ANCHOR_URL,
      anchorImageId: null,
      matchingCollectionId: "col-1",
      anchor: BASE_ANCHOR,
      artDirection: SAMPLE_AD,
      consistencyStrength: "strict",
      provider: BASE_PROVIDER,
    });
    // Every payload only knows about the ORIGINAL anchor URL.
    const referencedUrls = new Set(items.map((i) => i.anchorImageUrl));
    expect(referencedUrls.size).toBe(1);
    expect([...referencedUrls][0]).toBe(ANCHOR_URL);
  });
});
