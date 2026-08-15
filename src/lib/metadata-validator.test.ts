/**
 * Regression suite for the shared generated-image metadata validator.
 *
 * Pure/offline: no Supabase, no network, no UI. Exercises every print format,
 * every issue code, front/back parity and idempotent stability.
 */
import { describe, it, expect } from "vitest";
import {
  validateGeneratedImageMetadata,
  validateAssetConsistency,
  validateGeneratedImageWithAsset,
  summarizeValidations,
  DEFAULT_RATIO_TOLERANCE,
  type GeneratedImageMetadataRow,
} from "./metadata-validator";
import {
  validateGeneratedImageMetadata as denoValidate,
  validateGeneratedImageWithAsset as denoValidateWithAsset,
} from "../../supabase/functions/_shared/metadata-validator";
import { PRINT_FORMATS, getPrintFormat } from "./print-formats";

function rowFor(id: string, overrides: Partial<GeneratedImageMetadataRow> = {}) {
  const fmt = getPrintFormat(id)!;
  return {
    id: `row-${id}`,
    actual_width_px: fmt.preferredPixelWidth,
    actual_height_px: fmt.preferredPixelHeight,
    master_width: fmt.preferredPixelWidth,
    master_height: fmt.preferredPixelHeight,
    print_format_id: id,
    aspect_ratio: fmt.aspectRatio,
    generation_mode: "print-ready",
    storage_path: "gen-1.png",
    master_storage_path: "gen-1.png",
    ...overrides,
  } satisfies GeneratedImageMetadataRow;
}

const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code).sort();

describe("validator: canonical rows for every registered print format", () => {
  for (const fmt of PRINT_FORMATS) {
    it(`${fmt.id} at 300 PPI and 150 PPI validates clean`, () => {
      for (const [w, h] of [
        [fmt.preferredPixelWidth, fmt.preferredPixelHeight],
        [fmt.fallbackPixelWidth, fmt.fallbackPixelHeight],
        [fmt.recommendedGenerationWidth, fmt.recommendedGenerationHeight],
      ]) {
        const res = validateGeneratedImageMetadata(
          rowFor(fmt.id, {
            actual_width_px: w,
            actual_height_px: h,
            master_width: w,
            master_height: h,
          }),
        );
        expect(res.issues, `${fmt.id} ${w}x${h}`).toEqual([]);
        expect(res.ok).toBe(true);
        expect(res.canonicalAspectRatio).toBe(fmt.aspectRatio);
      }
    });
  }
});

describe("validator: hard errors", () => {
  it("flags missing dimensions", () => {
    expect(
      codes(
        validateGeneratedImageMetadata(
          rowFor("print_50x70", { actual_width_px: null, actual_height_px: 8268 }),
        ),
      ),
    ).toEqual(["missing_dimensions"]);
  });

  it("flags zero and negative dimensions as missing", () => {
    for (const w of [0, -10, Number.NaN]) {
      const res = validateGeneratedImageMetadata(
        rowFor("print_50x70", { actual_width_px: w as number }),
      );
      expect(res.ok, String(w)).toBe(false);
      expect(codes(res)).toContain("missing_dimensions");
    }
  });

  it("rejects fractional dimensions as unmeasured", () => {
    const res = validateGeneratedImageMetadata(
      rowFor("print_50x70", { actual_width_px: 5906.5 }),
    );
    expect(codes(res)).toEqual(["missing_dimensions"]);
    expect(res.ok).toBe(false);
  });

  it("flags a print-ready row without a print format", () => {
    const res = validateGeneratedImageMetadata({
      actual_width_px: 1600,
      actual_height_px: 2240,
      print_format_id: null,
      aspect_ratio: "5:7",
      generation_mode: "print_ready",
    });
    expect(codes(res)).toEqual(["missing_print_format"]);
  });

  it("does not require a format for non print-ready generations", () => {
    const res = validateGeneratedImageMetadata({
      actual_width_px: 1024,
      actual_height_px: 1024,
      print_format_id: null,
      aspect_ratio: "1:1",
      generation_mode: "standard",
    });
    expect(res.ok).toBe(true);
  });

  it("flags a missing aspect ratio", () => {
    expect(
      codes(validateGeneratedImageMetadata(rowFor("print_50x70", { aspect_ratio: null }))),
    ).toEqual(["missing_aspect_ratio"]);
  });

  it("flags a provider ratio token that contradicts the print format", () => {
    const res = validateGeneratedImageMetadata(
      rowFor("print_50x70", { aspect_ratio: "1:1" }),
    );
    expect(codes(res)).toEqual(["aspect_ratio_mismatch"]);
    expect(res.errors[0].message).toContain("5:7");
  });

  it("flags an unknown print format id", () => {
    const res = validateGeneratedImageMetadata(
      rowFor("print_50x70", { print_format_id: "print_does_not_exist" }),
    );
    expect(codes(res)).toContain("unknown_print_format");
  });

  it("keeps portrait and landscape of the same pair distinguishable", () => {
    const res = validateGeneratedImageMetadata(
      rowFor("print_50x70", { aspect_ratio: "7:5" }),
    );
    expect(codes(res)).toContain("aspect_ratio_mismatch");
  });

  it("accepts either ISO-A member carrying the shared token", () => {
    for (const id of ["print_a2", "print_a3", "print_a4"]) {
      expect(validateGeneratedImageMetadata(rowFor(id)).ok, id).toBe(true);
    }
  });
});

describe("validator: rounding boundaries and drift", () => {
  const BOUNDARY: Array<[string, number, number]> = [
    ["print_50x70", 5906, 8268],
    ["print_50x70", 2953, 4134],
    ["print_50x70", 1601, 2240],
    ["print_70x50", 8268, 5906],
    ["print_70x100", 8268, 11811],
    ["print_30x40", 3543, 4724],
    ["print_50x50", 5905, 5906],
    ["print_a2", 4961, 7016],
    ["print_a3", 3508, 4961],
    ["print_a4", 2480, 3508],
  ];

  for (const [id, w, h] of BOUNDARY) {
    it(`${id} @ ${w}x${h} is accepted without drift warnings`, () => {
      const res = validateGeneratedImageMetadata(
        rowFor(id, {
          actual_width_px: w,
          actual_height_px: h,
          master_width: w,
          master_height: h,
        }),
      );
      expect(res.issues, `${id} ${w}x${h}`).toEqual([]);
    });
  }

  it("warns (not errors) when pixels drift beyond tolerance", () => {
    const res = validateGeneratedImageMetadata(
      rowFor("print_50x70", {
        actual_width_px: 2048,
        actual_height_px: 2048,
        master_width: 2048,
        master_height: 2048,
      }),
    );
    expect(res.ok).toBe(true);
    expect(codes(res)).toEqual(["dimension_ratio_drift"]);
    expect(res.warnings).toHaveLength(1);
  });

  it("respects a caller-supplied tolerance", () => {
    const row = rowFor("print_50x70", {
      actual_width_px: 5920,
      actual_height_px: 8268,
      master_width: 5920,
      master_height: 8268,
    });
    expect(validateGeneratedImageMetadata(row, { ratioTolerance: 0 }).warnings).toHaveLength(1);
    expect(validateGeneratedImageMetadata(row, { ratioTolerance: 0.05 }).warnings).toEqual([]);
  });

  it("exposes a 0.5% default tolerance", () => {
    expect(DEFAULT_RATIO_TOLERANCE).toBe(0.005);
  });

  it("warns when master dimensions disagree with actual", () => {
    const res = validateGeneratedImageMetadata(
      rowFor("print_50x70", { master_width: 1600, master_height: 2240 }),
    );
    expect(codes(res)).toEqual(["master_dimension_mismatch"]);
    expect(res.ok).toBe(true);
  });
});

describe("validator: versioned asset consistency", () => {
  const row = rowFor("print_50x70");

  it("passes when the original asset matches", () => {
    expect(
      validateAssetConsistency(row, {
        asset_type: "original",
        version_index: 0,
        width_px: row.actual_width_px,
        height_px: row.actual_height_px,
        storage_path: row.master_storage_path,
        deleted_at: null,
      }),
    ).toEqual([]);
  });

  it("ignores a missing or soft-deleted asset", () => {
    expect(validateAssetConsistency(row, null)).toEqual([]);
    expect(
      validateAssetConsistency(row, {
        width_px: 1,
        height_px: 1,
        storage_path: "other.png",
        deleted_at: "2026-01-01T00:00:00Z",
      }),
    ).toEqual([]);
  });

  it("flags divergent asset dimensions and storage path", () => {
    const res = validateGeneratedImageWithAsset(row, {
      width_px: 1600,
      height_px: 2240,
      storage_path: "stale.png",
      deleted_at: null,
    });
    expect(codes(res)).toEqual(
      ["asset_dimension_mismatch", "asset_storage_path_mismatch"].sort(),
    );
    expect(res.ok).toBe(false);
  });
});

describe("validator: parity with the Deno mirror", () => {
  const CASES: GeneratedImageMetadataRow[] = [
    rowFor("print_50x70"),
    rowFor("print_70x50", { aspect_ratio: "1:1" }),
    rowFor("print_a3", { actual_width_px: null }),
    rowFor("print_50x50", { actual_width_px: 2048, actual_height_px: 3072 }),
    rowFor("print_30x40", { master_width: 10, master_height: 10 }),
    { actual_width_px: 1024, actual_height_px: 1024, aspect_ratio: "1:1" },
    { generation_mode: "print-ready" },
  ];

  for (const [i, row] of CASES.entries()) {
    it(`case ${i} yields identical issues on both sides`, () => {
      expect(denoValidate(row)).toEqual(validateGeneratedImageMetadata(row));
    });
  }

  it("agrees on asset consistency too", () => {
    const row = rowFor("print_50x70");
    const asset = { width_px: 10, height_px: 10, storage_path: "x.png", deleted_at: null };
    expect(denoValidateWithAsset(row, asset)).toEqual(
      validateGeneratedImageWithAsset(row, asset),
    );
  });
});

describe("validator: stability and reporting", () => {
  it("is pure — repeated runs return identical results", () => {
    const row = rowFor("print_70x100", { aspect_ratio: "1:1" });
    const a = validateGeneratedImageMetadata(row);
    const b = validateGeneratedImageMetadata(row);
    expect(a).toEqual(b);
    expect(row).toEqual(rowFor("print_70x100", { aspect_ratio: "1:1" }));
  });

  it("summarizes a mixed batch", () => {
    const results = [
      validateGeneratedImageMetadata(rowFor("print_50x70")),
      validateGeneratedImageMetadata(rowFor("print_50x70", { aspect_ratio: null })),
      validateGeneratedImageMetadata(
        rowFor("print_50x70", { master_width: 1, master_height: 1 }),
      ),
    ];
    expect(summarizeValidations(results)).toEqual({
      total: 3,
      valid: 2,
      invalid: 1,
      withWarnings: 1,
      byCode: { missing_aspect_ratio: 1, master_dimension_mismatch: 1 },
    });
  });
});
