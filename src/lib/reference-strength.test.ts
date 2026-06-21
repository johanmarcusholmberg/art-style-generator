import { describe, it, expect } from "vitest";
import {
  DEFAULT_REFERENCE_STRENGTH,
  REFERENCE_STRENGTH_OPTIONS,
  isReferenceStrength,
  referenceStrengthInstruction,
  referenceStrengthLabel,
  type ReferenceStrength,
} from "./reference-strength";

describe("reference-strength", () => {
  it("defaults to balanced", () => {
    expect(DEFAULT_REFERENCE_STRENGTH).toBe("balanced");
  });

  it("exposes all four options in stable order", () => {
    expect(REFERENCE_STRENGTH_OPTIONS.map((o) => o.id)).toEqual([
      "inspiration",
      "balanced",
      "strong_reference",
      "near_original",
    ]);
  });

  it("validates known ids", () => {
    expect(isReferenceStrength("balanced")).toBe(true);
    expect(isReferenceStrength("inspiration")).toBe(true);
    expect(isReferenceStrength("strong_reference")).toBe(true);
    expect(isReferenceStrength("near_original")).toBe(true);
    expect(isReferenceStrength("nope")).toBe(false);
    expect(isReferenceStrength(null)).toBe(false);
    expect(isReferenceStrength(undefined)).toBe(false);
  });

  it("returns a distinct instruction sentence per mode", () => {
    const all: ReferenceStrength[] = [
      "inspiration",
      "balanced",
      "strong_reference",
      "near_original",
    ];
    const texts = all.map(referenceStrengthInstruction);
    expect(new Set(texts).size).toBe(all.length);
    for (const t of texts) {
      expect(t).toMatch(/^REFERENCE STRENGTH —/);
    }
  });

  it("inspiration allows significant changes", () => {
    expect(referenceStrengthInstruction("inspiration")).toMatch(/loose inspiration/i);
    expect(referenceStrengthInstruction("inspiration")).toMatch(/change significantly/i);
  });

  it("near_original locks structure", () => {
    expect(referenceStrengthInstruction("near_original")).toMatch(/minimal structural changes/i);
    expect(referenceStrengthInstruction("near_original")).toMatch(/master source/i);
  });

  it("strong_reference preserves composition and pose", () => {
    const t = referenceStrengthInstruction("strong_reference");
    expect(t).toMatch(/composition/i);
    expect(t).toMatch(/pose/i);
  });

  it("balanced preserves subject + composition while adapting", () => {
    const t = referenceStrengthInstruction("balanced");
    expect(t).toMatch(/main subject/i);
    expect(t).toMatch(/adapt/i);
  });

  it("labels each option", () => {
    expect(referenceStrengthLabel("balanced")).toBe("Balanced");
    expect(referenceStrengthLabel("strong_reference")).toBe("Strong reference");
  });
});
