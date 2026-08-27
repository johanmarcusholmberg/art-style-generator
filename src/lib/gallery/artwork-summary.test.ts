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

const original = asset({ id: "a0", storage_path: "orig.png" });
const up1 = asset({
  id: "a1",
  asset_type: "upscale",
  version_index: 1,
  width_px: 6144,
  height_px: 8601,
  upscale_method: "hd",
  storage_path: "up1.png",
});

const baseImage = {
  id: "img-1",
  storage_path: "orig.png",
  master_storage_path: "up1.png",
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

  it("marks the persisted master_storage_path version as current master", () => {
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

  it("does not label a larger non-master version as current master", () => {
    const bigger = asset({
      id: "a2",
      asset_type: "upscale",
      version_index: 2,
      width_px: 8192,
      height_px: 11468,
      storage_path: "up2.png",
    });
    const s = buildArtworkDetailSummary(baseImage, bigger, [original, up1, bigger]);
    expect(s.master?.label).toBe("Upscale 1");
    expect(s.selected?.isMaster).toBe(false);
  });

  it("falls back to enhanced_storage_path when no master path exists", () => {
    const img = { ...baseImage, master_storage_path: null, enhanced_storage_path: "up1.png" };
    const s = buildArtworkDetailSummary(img, original, [original, up1]);
    expect(s.master?.label).toBe("Upscale 1");
  });

  it("uses storage_path so Original is master when no enhanced/master path exists", () => {
    const img = { ...baseImage, master_storage_path: null, enhanced_storage_path: null };
    const s = buildArtworkDetailSummary(img, original, [original, up1]);
    expect(s.master?.label).toBe("Original");
    expect(s.selected?.isMaster).toBe(true);
  });

  it("omits the master when the persisted path cannot be matched", () => {
    const img = { ...baseImage, master_storage_path: "gone.png", storage_path: "also-gone.png" };
    const s = buildArtworkDetailSummary(img, up1, [original, up1]);
    expect(s.master).toBeNull();
    expect(s.selected?.isMaster).toBe(false);
    expect(s.previewingNonMaster).toBe(false);
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

  it("quotes master dimensions in readiness copy, not the previewed version", () => {
    const big = { ...baseImage, actual_width_px: 6144, actual_height_px: 8601 };
    const s = buildArtworkDetailSummary(big, original, [original, up1]);
    expect(s.selected?.dimensions).toBe("2048 × 2867");
    expect(s.printReadiness.detail).toContain("Current master · 6144 × 8601");
    expect(s.printReadiness.detail).not.toContain("2048 × 2867");
  });

  it("keeps master readiness unchanged when an earlier version is selected", () => {
    const big = { ...baseImage, actual_width_px: 6144, actual_height_px: 8601 };
    const a = buildArtworkDetailSummary(big, up1, [original, up1]);
    const b = buildArtworkDetailSummary(big, original, [original, up1]);
    expect(b.printReadiness.state).toBe(a.printReadiness.state);
    expect(b.printReadiness.detail).toBe(a.printReadiness.detail);
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
