import { describe, it, expect } from "vitest";
import {
  buildArtworkDetailSummary,
  buildPrintReadinessSummary,
} from "./artwork-summary";
import type { ImageAssetRow } from "@/lib/generated-image-assets";

function asset(over: Partial<ImageAssetRow> & { id: string }): ImageAssetRow {
  return {
    generated_image_id: "img-1",
    asset_type: "original",
    version_index: 0,
    source_asset_id: null,
    storage_bucket: "generated-images",
    storage_path: "secret/path.png",
    width_px: 2048,
    height_px: 2867,
    mime_type: "image/png",
    file_size_bytes: 1,
    upscale_method: null,
    scale_factor: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...over,
  } as ImageAssetRow;
}

const original = asset({ id: "a0" });
const up1 = asset({
  id: "a1",
  asset_type: "upscale",
  version_index: 1,
  width_px: 6144,
  height_px: 8601,
  upscale_method: "hd",
});

const baseImage = {
  id: "img-1",
  storage_path: "img.png",
  print_format_id: "50x70",
  created_at: "2026-01-02T00:00:00Z",
} as any;

describe("buildArtworkDetailSummary", () => {
  it("labels the original version as Original", () => {
    const s = buildArtworkDetailSummary(baseImage, original, [original]);
    expect(s.selected?.label).toBe("Original");
    expect(s.selected?.isOriginal).toBe(true);
    expect(s.selected?.dimensions).toBe("2048 × 2867");
  });

  it("gives upscaled versions a clear label", () => {
    const s = buildArtworkDetailSummary(baseImage, up1, [original, up1]);
    expect(s.selected?.label).toBe("Upscale 1");
    expect(s.selected?.isOriginal).toBe(false);
  });

  it("marks the largest active version as current master", () => {
    const s = buildArtworkDetailSummary(baseImage, up1, [original, up1]);
    expect(s.master?.label).toBe("Upscale 1");
    expect(s.selected?.isMaster).toBe(true);
    expect(s.previewingNonMaster).toBe(false);
  });

  it("distinguishes selected version from current master", () => {
    const s = buildArtworkDetailSummary(baseImage, original, [original, up1]);
    expect(s.selected?.label).toBe("Original");
    expect(s.selected?.isMaster).toBe(false);
    expect(s.master?.label).toBe("Upscale 1");
    expect(s.previewingNonMaster).toBe(true);
  });

  it("uses the selected version dimensions for display", () => {
    const s = buildArtworkDetailSummary(
      { ...baseImage, actual_width_px: 2048, actual_height_px: 2867 },
      up1,
      [original, up1],
    );
    expect(s.displayDimensions).toBe("6144 × 8601");
  });

  it("falls back to row dimensions when no version is selected", () => {
    const s = buildArtworkDetailSummary(
      { ...baseImage, actual_width_px: 2048, actual_height_px: 2867 },
      null,
      [],
    );
    expect(s.displayDimensions).toBe("2048 × 2867");
  });

  it("reports an unknown state instead of false readiness when dimensions are missing", () => {
    const s = buildArtworkDetailSummary(baseImage, null, []);
    expect(s.printReadiness.state).toBe("unknown");
    expect(s.printReadiness.detail).toMatch(/verified/i);
    expect(s.enhancementRecommended).toBe(false);
  });

  it("derives print readiness from the existing readiness logic", () => {
    const big = {
      ...baseImage,
      actual_width_px: 6144,
      actual_height_px: 8601,
    };
    const s = buildArtworkDetailSummary(big, up1, [original, up1]);
    expect(s.printReadiness.state).toBe("ready");
    expect(s.printReadiness.headline).toBe("Ready for print");
    expect(s.printReadiness.ppiLabel).toMatch(/PPI$/);
  });

  it("recommends enhancement for small masters", () => {
    const small = {
      ...baseImage,
      actual_width_px: 640,
      actual_height_px: 896,
    };
    const s = buildArtworkDetailSummary(small, null, []);
    expect(["good", "insufficient"]).toContain(s.printReadiness.state);
    expect(s.enhancementRecommended).toBe(true);
  });

  it("handles missing legacy provider values gracefully", () => {
    const s = buildArtworkDetailSummary(baseImage, null, []);
    expect(s.providerLabel).toBe("Provider not recorded");
    const s2 = buildArtworkDetailSummary(
      { ...baseImage, generation_provider: "gemini", generation_model: "g-3" },
      null,
      [],
    );
    expect(s2.providerLabel).toBe("Gemini · g-3");
  });

  it("describes download master using the actual source version", () => {
    const withMaster = buildArtworkDetailSummary(baseImage, up1, [original, up1]);
    expect(withMaster.downloadMasterDescription).toBe("Uses Upscale 1 · 6144 × 8601");

    // Selected preview differs from master — description reflects what the
    // existing download contract actually reads (the selected version).
    const previewOriginal = buildArtworkDetailSummary(baseImage, original, [original, up1]);
    expect(previewOriginal.downloadMasterDescription).toBe("Uses Original · 2048 × 2867");
    expect(previewOriginal.master?.label).toBe("Upscale 1");
  });

  it("never leaks database ids or storage paths into labels", () => {
    const s = buildArtworkDetailSummary(baseImage, up1, [original, up1]);
    const text = JSON.stringify(s);
    expect(text).not.toContain("a1");
    expect(text).not.toContain("secret/path.png");
    expect(text).not.toContain("img-1");
  });
});

describe("buildPrintReadinessSummary", () => {
  it("keeps existing thresholds as the source of truth", () => {
    const r = buildPrintReadinessSummary(
      { actual_width_px: 6144, actual_height_px: 8601, print_format_id: "50x70" } as any,
      "6144 × 8601",
    );
    expect(r.level).toBe("ready-300");
    expect(r.state).toBe("ready");
    expect(r.detail).toContain("6144 × 8601");
  });
});
