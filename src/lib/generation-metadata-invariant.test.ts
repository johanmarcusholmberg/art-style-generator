/**
 * Regression tests: canonical aspect_ratio must always be derived from
 * print_format_id, for every registered print format, and must never drift
 * with pixel dimensions that round differently.
 */
import { describe, it, expect } from "vitest";
import {
  canonicalAspectRatio,
  printFormatRatioDecimal,
  findMetadataDefects,
  isMetadataComplete,
  assertMetadataComplete,
  MetadataIncompleteError,
} from "./generation-metadata-invariant";
import {
  canonicalAspectRatio as denoCanonicalAspectRatio,
  printFormatRatioDecimal as denoPrintFormatRatioDecimal,
} from "../../supabase/functions/_shared/generation-metadata-invariant";
import { PRINT_FORMATS, getPrintFormat } from "./print-formats";

const EXPECTED: Record<string, string> = {
  print_50x70: "5:7",
  print_70x50: "7:5",
  print_70x100: "7:10",
  print_30x40: "3:4",
  print_50x50: "1:1",
  print_a2: "ISO-A",
  print_a3: "ISO-A",
  print_a4: "ISO-A",
};

describe("canonical aspect ratio mapping across print formats", () => {
  it("covers every registered format id", () => {
    expect(PRINT_FORMATS.map((f) => f.id).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [id, ratio] of Object.entries(EXPECTED)) {
    it(`${id} maps to ${ratio}`, () => {
      expect(canonicalAspectRatio(id)).toBe(ratio);
      expect(canonicalAspectRatio(id, "9:16")).toBe(ratio);
      expect(getPrintFormat(id)?.aspectRatio).toBe(ratio);
    });
  }

  it("matches the Deno mirror for every format (string + decimal)", () => {
    for (const id of Object.keys(EXPECTED)) {
      expect(denoCanonicalAspectRatio(id), id).toBe(canonicalAspectRatio(id));
      expect(denoPrintFormatRatioDecimal(id), id).toBeCloseTo(
        printFormatRatioDecimal(id)!,
        10,
      );
    }
  });

  it("falls back only when the format is unknown or absent", () => {
    expect(canonicalAspectRatio(null, "4:5")).toBe("4:5");
    expect(canonicalAspectRatio(undefined, null)).toBeNull();
    expect(canonicalAspectRatio("print_does_not_exist", "4:5")).toBe("4:5");
    expect(printFormatRatioDecimal("print_does_not_exist")).toBeNull();
    expect(printFormatRatioDecimal(null)).toBeNull();
  });

  it("exposes decimals consistent with the registry", () => {
    for (const fmt of PRINT_FORMATS) {
      expect(printFormatRatioDecimal(fmt.id), fmt.id).toBeCloseTo(fmt.aspectRatioDecimal, 10);
    }
  });

  it("distinguishes portrait and landscape variants of the same pair", () => {
    expect(canonicalAspectRatio("print_50x70")).not.toBe(canonicalAspectRatio("print_70x50"));
    expect(printFormatRatioDecimal("print_70x50")!).toBeGreaterThan(1);
    expect(printFormatRatioDecimal("print_50x70")!).toBeLessThan(1);
  });

  it("keeps the three ISO-A formats on one shared ratio token but distinct decimals", () => {
    const isoIds = ["print_a2", "print_a3", "print_a4"];
    expect(new Set(isoIds.map((id) => canonicalAspectRatio(id))).size).toBe(1);
    const decimals = isoIds.map((id) => printFormatRatioDecimal(id)!);
    expect(new Set(decimals.map((d) => d.toFixed(6))).size).toBe(3);
    for (const d of decimals) expect(d).toBeCloseTo(1 / Math.SQRT2, 2);
  });
});

describe("boundary cases: dimensions that round differently", () => {
  // Pixel dimensions per format that do NOT reduce to the canonical ratio
  // string when naively simplified. The canonical ratio must stay bound to
  // the print format, never re-derived from pixels.
  const CASES: Array<[string, number, number]> = [
    ["print_50x70", 5906, 8268], // 300 PPI — 5906/8268 != exactly 5/7
    ["print_50x70", 2953, 4134], // 150 PPI half-size, rounds down
    ["print_50x70", 1601, 2240], // off-by-one width
    ["print_70x50", 8268, 5906],
    ["print_70x100", 8268, 11811], // 11811 rounds from 11811.02
    ["print_30x40", 3543, 4724], // 3543/4724 = 0.75006…
    ["print_50x50", 5905, 5906], // one px off square
    ["print_a2", 4961, 7016],
    ["print_a3", 3508, 4961],
    ["print_a4", 2480, 3508],
  ];

  for (const [id, w, h] of CASES) {
    it(`${id} @ ${w}×${h} keeps the canonical ratio`, () => {
      const ratio = canonicalAspectRatio(id, `${w}:${h}`);
      expect(ratio).toBe(EXPECTED[id]);

      const candidate = {
        widthPx: w,
        heightPx: h,
        printFormatId: id,
        aspectRatio: ratio,
        generationMode: "print-ready",
      };
      expect(findMetadataDefects(candidate)).toEqual([]);
      expect(isMetadataComplete(candidate)).toBe(true);

      // Rounded pixel ratio stays within 0.5% of the registry decimal.
      const decimal = printFormatRatioDecimal(id)!;
      expect(Math.abs(w / h - decimal) / decimal).toBeLessThan(0.005);
    });
  }

  it("treats a provider-supplied ratio token as untrusted when a format exists", () => {
    // Gemini-style "1:1" leakage on a 5:7 poster must not survive.
    expect(canonicalAspectRatio("print_50x70", "1:1")).toBe("5:7");
  });

  it("flags rows missing the canonical ratio or format", () => {
    expect(
      findMetadataDefects({
        widthPx: 5906,
        heightPx: 8268,
        printFormatId: null,
        aspectRatio: null,
        generationMode: "print-ready",
      }),
    ).toEqual(["missing_print_format", "missing_aspect_ratio"]);

    expect(() =>
      assertMetadataComplete({
        widthPx: 0,
        heightPx: 8268,
        printFormatId: "print_50x70",
        aspectRatio: "5:7",
      }),
    ).toThrow(MetadataIncompleteError);
  });
});
