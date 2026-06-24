import { describe, it, expect } from "vitest";
import {
  sortAssetsByVersion,
  activeAssets,
  latestUpscale,
  originalAsset,
  defaultSelectedAsset,
  nextVersionIndex,
  bestAvailableAsset,
  versionLabel,
  formatSourceLabel,
  estimateUpscaleOutput,
  getVersionPrintReadiness,
  canDeleteAsset,
  pickNextSelectionAfterDelete,
  MAX_LONG_EDGE_PX,
  type ImageAssetRow,
} from "@/lib/generated-image-assets";

function asset(over: Partial<ImageAssetRow>): ImageAssetRow {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    generated_image_id: "gi-1",
    asset_type: over.asset_type ?? "upscale",
    version_index: over.version_index ?? 1,
    source_asset_id: over.source_asset_id ?? null,
    storage_bucket: "generated-images",
    storage_path: over.storage_path ?? "x.png",
    width_px: over.width_px ?? null,
    height_px: over.height_px ?? null,
    mime_type: "image/png",
    file_size_bytes: null,
    upscale_method: over.upscale_method ?? null,
    scale_factor: over.scale_factor ?? null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: over.deleted_at ?? null,
    ...over,
  } as ImageAssetRow;
}

const orig = asset({ id: "v0", asset_type: "original", version_index: 0, width_px: 1024, height_px: 1024 });
const up1 = asset({ id: "v1", asset_type: "upscale", version_index: 1, width_px: 4096, height_px: 4096, upscale_method: "realesrgan_4x" });
const up2 = asset({ id: "v2", asset_type: "upscale", version_index: 2, width_px: 8192, height_px: 8192, upscale_method: "tile_4x" });

describe("sortAssetsByVersion", () => {
  it("sorts ascending by version_index", () => {
    const out = sortAssetsByVersion([up2, orig, up1]);
    expect(out.map((a) => a.version_index)).toEqual([0, 1, 2]);
  });
});

describe("activeAssets", () => {
  it("filters out soft-deleted rows", () => {
    const deleted = asset({ id: "vd", deleted_at: "2026-02-01T00:00:00Z" });
    expect(activeAssets([orig, up1, deleted]).map((a) => a.id)).toEqual(["v0", "v1"]);
  });
});

describe("defaultSelectedAsset", () => {
  it("returns the latest upscale when one exists", () => {
    expect(defaultSelectedAsset([orig, up1, up2])?.id).toBe("v2");
  });
  it("falls back to original when no upscales exist", () => {
    expect(defaultSelectedAsset([orig])?.id).toBe("v0");
  });
  it("ignores soft-deleted upscales when picking latest", () => {
    const deletedUp2 = { ...up2, deleted_at: "2026-02-01T00:00:00Z" };
    expect(defaultSelectedAsset([orig, up1, deletedUp2])?.id).toBe("v1");
  });
});

describe("nextVersionIndex", () => {
  it("is 1 for an image with only original", () => {
    expect(nextVersionIndex([orig])).toBe(1);
  });
  it("is max+1 across all rows including deleted ones", () => {
    const deletedUp2 = { ...up2, deleted_at: "2026-02-01T00:00:00Z" };
    expect(nextVersionIndex([orig, up1, deletedUp2])).toBe(3);
  });
  it("starts at 1 when given an empty list", () => {
    expect(nextVersionIndex([])).toBe(1);
  });
});

describe("bestAvailableAsset", () => {
  it("picks the largest pixel-area asset", () => {
    expect(bestAvailableAsset([orig, up1, up2])?.id).toBe("v2");
  });
  it("ignores soft-deleted rows", () => {
    const deletedUp2 = { ...up2, deleted_at: "2026-02-01T00:00:00Z" };
    expect(bestAvailableAsset([orig, up1, deletedUp2])?.id).toBe("v1");
  });
  it("falls back when no dims known", () => {
    const a = asset({ id: "a", asset_type: "original", version_index: 0 });
    const b = asset({ id: "b", asset_type: "upscale", version_index: 1 });
    expect(bestAvailableAsset([a, b])?.id).toBe("b");
  });
});

describe("versionLabel & formatSourceLabel", () => {
  it("labels original and upscales correctly", () => {
    expect(versionLabel(orig)).toBe("Original");
    expect(versionLabel(up1)).toBe("Upscale 1");
    expect(versionLabel(up2)).toBe("Upscale 2");
  });
  it("formats source label with dimensions", () => {
    expect(formatSourceLabel(orig)).toBe("Source: Original · 1024×1024");
    expect(formatSourceLabel(up1)).toBe("Source: Upscale 1 · 4096×4096");
  });
  it("formats source label with unknown dimensions", () => {
    const unknown = asset({ id: "u", asset_type: "original", version_index: 0 });
    expect(formatSourceLabel(unknown)).toBe("Source: Original · dimensions unknown");
  });
});

describe("estimateUpscaleOutput / 12K cap", () => {
  it("returns unknown when source has no dims", () => {
    const r = estimateUpscaleOutput({ width_px: null, height_px: null }, 4);
    expect(r.unknown).toBe(true);
    expect(r.exceedsCap).toBe(false);
    expect(r.warning).toMatch(/12K/i);
  });
  it("flags exceedsCap when result clears 12K", () => {
    const r = estimateUpscaleOutput({ width_px: 4096, height_px: 4096 }, 4);
    expect(r.estimatedLongEdge).toBe(16_384);
    expect(r.exceedsCap).toBe(true);
    expect(r.warning).toContain(`${MAX_LONG_EDGE_PX.toLocaleString()}`);
  });
  it("stays under cap for a 1024 × 4× upscale", () => {
    const r = estimateUpscaleOutput({ width_px: 1024, height_px: 1024 }, 4);
    expect(r.estimatedLongEdge).toBe(4096);
    expect(r.exceedsCap).toBe(false);
    expect(r.warning).toBeNull();
  });
});

describe("getVersionPrintReadiness", () => {
  it("returns unknown when dims are missing", () => {
    const r = getVersionPrintReadiness({ width_px: null, height_px: null });
    expect(r.ppi).toBeNull();
    expect(r.printReady).toBe(false);
    expect(r.message).toContain("dimensions unknown");
  });
  it("flags below-300 PPI as not ready", () => {
    const r = getVersionPrintReadiness({ width_px: 4096, height_px: 4096 });
    expect(r.printReady).toBe(false);
    expect(r.message).toMatch(/below 300/);
  });
  it("marks 50×70 cm as ready when PPI ≥ 280", () => {
    // 50 cm ≈ 19.685 in → 19.685 * 300 ≈ 5906 px wide for 300 PPI
    const r = getVersionPrintReadiness({ width_px: 8192, height_px: 8192 });
    expect(r.printReady).toBe(true);
    expect(r.message).toContain("print ready");
  });
});

describe("delete rules", () => {
  it("forbids deleting the original", () => {
    expect(canDeleteAsset(orig)).toBe(false);
  });
  it("allows deleting upscales", () => {
    expect(canDeleteAsset(up1)).toBe(true);
    expect(canDeleteAsset(up2)).toBe(true);
  });
  it("falls back to latest remaining upscale after delete", () => {
    expect(pickNextSelectionAfterDelete([orig, up1, up2], "v2")?.id).toBe("v1");
  });
  it("falls back to original when no upscales remain", () => {
    expect(pickNextSelectionAfterDelete([orig, up1], "v1")?.id).toBe("v0");
  });
});

describe("latestUpscale / originalAsset", () => {
  it("latestUpscale returns null when none exist", () => {
    expect(latestUpscale([orig])).toBeNull();
  });
  it("originalAsset returns the v0 row", () => {
    expect(originalAsset([orig, up1])?.id).toBe("v0");
  });
});

describe("version persistence semantics (bugfix Phase 5)", () => {
  it("after a successful save, the asset list includes the new upscale and it becomes default", () => {
    // Simulates fetchImageAssets returning rows after saveUpscaleAsset insert.
    const before = [orig];
    const newUp = asset({
      id: "v1-new",
      asset_type: "upscale",
      version_index: nextVersionIndex(before),
      width_px: 4096,
      height_px: 4096,
      upscale_method: "realesrgan_4x",
    });
    const after = [...before, newUp];
    expect(after.some((a) => a.id === "v1-new")).toBe(true);
    expect(defaultSelectedAsset(after)?.id).toBe("v1-new");
    expect(versionLabel(newUp)).toBe("Upscale 1");
  });

  it("second upscale lands at version 2 and labels accordingly", () => {
    const after1 = [orig, up1];
    const newUp2 = asset({
      id: "v2-new",
      asset_type: "upscale",
      version_index: nextVersionIndex(after1),
      upscale_method: "tile_4x",
    });
    expect(newUp2.version_index).toBe(2);
    expect(versionLabel(newUp2)).toBe("Upscale 2");
    const after2 = [...after1, newUp2];
    expect(defaultSelectedAsset(after2)?.id).toBe("v2-new");
  });

  it("activeAssets treats deleted_at IS NULL as active (.is null semantics, not .eq)", () => {
    // Mirrors the Postgres .is("deleted_at", null) filter used in fetchImageAssets.
    const deleted = asset({ id: "vd", deleted_at: "2026-02-01T00:00:00Z" });
    const partial = asset({ id: "vp", deleted_at: null });
    const active = activeAssets([orig, deleted, partial]);
    expect(active.map((a) => a.id).sort()).toEqual(["v0", "vp"]);
  });
});

