import { describe, it, expect } from "vitest";
import {
  gptImage2SizeForFormat,
  hasGptImage2ExactSize,
  formatOpenAISize,
} from "./openai-gpt-image-2-sizes";
import { planPosterRatioCorrection } from "./poster-ratio-enforce";

describe("gptImage2SizeForFormat — exact poster sizes", () => {
  const cases: Array<[string, "portrait" | "landscape", string]> = [
    ["print_50x70", "portrait", "1600x2240"],
    ["print_50x70", "landscape", "2240x1600"],
    ["print_a4", "portrait", "1120x1584"],
    ["print_a4", "landscape", "1584x1120"],
    ["print_a3", "portrait", "1584x2240"],
    ["print_a3", "landscape", "2240x1584"],
    ["print_a2", "portrait", "2240x3168"],
    ["print_a2", "landscape", "3168x2240"],
  ];

  for (const [fmt, orient, expected] of cases) {
    it(`${fmt} (${orient}) → ${expected}`, () => {
      const s = gptImage2SizeForFormat(fmt, orient);
      expect(s).not.toBeNull();
      expect(formatOpenAISize(s!)).toBe(expected);
      expect(s!.exact).toBe(true);
      expect(s!.width % 16).toBe(0);
      expect(s!.height % 16).toBe(0);
    });
  }

  it("never returns one of the legacy gpt-image-1 fixed sizes for poster formats", () => {
    const legacy = new Set(["1024x1024", "1024x1536", "1536x1024"]);
    for (const fmt of ["print_50x70", "print_a4", "print_a3", "print_a2"]) {
      const s = gptImage2SizeForFormat(fmt, "portrait")!;
      expect(legacy.has(formatOpenAISize(s))).toBe(false);
    }
  });

  it("hasGptImage2ExactSize is true for all supported poster formats", () => {
    for (const fmt of ["print_50x70", "print_a4", "print_a3", "print_a2"]) {
      expect(hasGptImage2ExactSize(fmt)).toBe(true);
    }
    expect(hasGptImage2ExactSize("nope")).toBe(false);
    expect(hasGptImage2ExactSize(undefined)).toBe(false);
  });
});

describe("planPosterRatioCorrection — crop mode (used for OpenAI exact-size returns)", () => {
  it("returns method=none when source already matches within tolerance", () => {
    const p = planPosterRatioCorrection(1600, 2240, "print_50x70", "crop");
    expect(p?.method).toBe("none");
  });

  it("crops the wider axis when source is too wide for 5:7", () => {
    // Provider returned 1700x2240 — too wide. Crop horizontally to 1600x2240.
    const p = planPosterRatioCorrection(1700, 2240, "print_50x70", "crop")!;
    expect(p.method).toBe("crop");
    expect(p.outputHeight).toBe(2240);
    expect(p.outputWidth).toBe(1600);
    expect(p.cropLeft).toBe(50);
    expect(p.cropTop).toBe(0);
    expect(p.padLeft).toBe(0);
    expect(p.padTop).toBe(0);
  });

  it("crops the taller axis when source is too tall for 5:7", () => {
    const p = planPosterRatioCorrection(1600, 2300, "print_50x70", "crop")!;
    expect(p.method).toBe("crop");
    expect(p.outputWidth).toBe(1600);
    // 1600 / (5/7) = 2240
    expect(p.outputHeight).toBe(2240);
    expect(p.cropTop).toBe(30);
  });

  it("default mode is pad (no white-border crop unless explicitly requested)", () => {
    const padded = planPosterRatioCorrection(1700, 2240, "print_50x70")!;
    expect(padded.method).toBe("pad");
    expect(padded.padTop).toBeGreaterThan(0);
  });
});
