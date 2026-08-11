/**
 * Regression tests for the one-time canonical metadata backfill planner.
 */
import { describe, it, expect } from "vitest";
import {
  inferPrintFormatId,
  planRowBackfill,
  planIsNoop,
  BACKFILL_FORMAT_IDS,
} from "../../supabase/functions/_shared/metadata-backfill-plan";
import { PRINT_FORMATS } from "./print-formats";

describe("inferPrintFormatId", () => {
  it("covers every registered print format", () => {
    expect([...BACKFILL_FORMAT_IDS].sort()).toEqual(PRINT_FORMATS.map((f) => f.id).sort());
  });

  for (const fmt of PRINT_FORMATS) {
    it(`infers ${fmt.id} from its 300 PPI pixel target`, () => {
      expect(
        inferPrintFormatId(fmt.preferredPixelWidth, fmt.preferredPixelHeight),
      ).toBe(fmt.id);
    });
  }

  it("returns null for unknown ratios", () => {
    expect(inferPrintFormatId(1920, 1080)).toBeNull();
  });

  it("returns null for missing dimensions", () => {
    expect(inferPrintFormatId(null, 100)).toBeNull();
    expect(inferPrintFormatId(0, 0)).toBeNull();
  });
});

describe("planRowBackfill", () => {
  it("requests measurement when dimensions are missing", () => {
    const plan = planRowBackfill({ id: "a", storage_path: "gen-a.png" });
    expect(plan.needsMeasurement).toBe(true);
    expect(plan.measureStoragePath).toBe("gen-a.png");
    expect(plan.unresolved).toBe("no_dimensions");
  });

  it("writes measured dimensions, inferred format and canonical ratio", () => {
    const plan = planRowBackfill(
      { id: "a", storage_path: "gen-a.png", aspect_ratio: "1:1" },
      { id: "asset-a", width_px: null, height_px: null, storage_path: "gen-a.png" },
      { width: 5906, height: 8268 },
    );
    expect(plan.printFormatId).toBe("print_50x70");
    expect(plan.imagePatch).toMatchObject({
      actual_width_px: 5906,
      actual_height_px: 8268,
      master_width: 5906,
      master_height: 8268,
      print_format_id: "print_50x70",
      aspect_ratio: "5:7",
    });
    expect(plan.assetPatch).toMatchObject({ width_px: 5906, height_px: 8268 });
  });

  it("keeps an existing print format and repairs only the ratio", () => {
    const plan = planRowBackfill({
      id: "b",
      actual_width_px: 2000,
      actual_height_px: 2800,
      print_format_id: "print_50x70",
      aspect_ratio: null,
      storage_path: "gen-b.png",
    });
    expect(plan.imagePatch).toEqual({ aspect_ratio: "5:7" });
  });

  it("is a no-op for an already canonical row", () => {
    const plan = planRowBackfill(
      {
        id: "c",
        actual_width_px: 2000,
        actual_height_px: 2800,
        print_format_id: "print_50x70",
        aspect_ratio: "5:7",
        storage_path: "gen-c.png",
      },
      { id: "asset-c", width_px: 2000, height_px: 2800, storage_path: "gen-c.png" },
    );
    expect(planIsNoop(plan)).toBe(true);
  });

  it("flags rows whose pixels match no registered format", () => {
    const plan = planRowBackfill({
      id: "d",
      actual_width_px: 1920,
      actual_height_px: 1080,
      storage_path: "gen-d.png",
    });
    expect(plan.unresolved).toBe("no_matching_format");
    expect(plan.imagePatch.print_format_id).toBeUndefined();
  });

  it("prefers the master storage path when syncing the original asset", () => {
    const plan = planRowBackfill(
      {
        id: "e",
        actual_width_px: 2000,
        actual_height_px: 2800,
        print_format_id: "print_50x70",
        aspect_ratio: "5:7",
        storage_path: "old.png",
        master_storage_path: "master.png",
      },
      { id: "asset-e", width_px: 2000, height_px: 2800, storage_path: "old.png" },
    );
    expect(plan.assetPatch).toEqual({ storage_path: "master.png" });
  });
});
