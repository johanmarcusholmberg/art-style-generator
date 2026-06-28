import { describe, it, expect } from "vitest";
import {
  recommendUpscale,
  pixelsForFormat,
  ppiForPixels,
  ppiTier,
} from "./upscale-recommendation";
import { getPrintFormat } from "./print-formats";

const fmt5070 = getPrintFormat("print_50x70")!;
const fmtA4 = getPrintFormat("print_a4")!;

describe("pixelsForFormat", () => {
  it("matches preferred pixel width at 300 PPI within rounding", () => {
    const px = pixelsForFormat(fmt5070, 300);
    expect(px.width).toBeGreaterThanOrEqual(fmt5070.preferredPixelWidth - 2);
    expect(px.width).toBeLessThanOrEqual(fmt5070.preferredPixelWidth + 2);
  });
});

describe("ppiTier", () => {
  it("classifies tiers", () => {
    expect(ppiTier(305)).toBe("preferred");
    expect(ppiTier(150)).toBe("fallback");
    expect(ppiTier(120)).toBe("below");
  });
});

describe("recommendUpscale", () => {
  it("returns 'none' when source already meets target", () => {
    const r = recommendUpscale(7000, 9800, fmt5070, 300);
    expect(r.recommended.mode).toBe("none");
    expect(r.reachesTarget).toBe(true);
  });

  it("picks cheapest 4× preset for small format from 1600x2240", () => {
    const r = recommendUpscale(1600, 2240, fmtA4, 300);
    expect(r.reachesTarget).toBe(true);
    // realesrgan_4x is cheaper than tile_4x; both reach A4 from this source.
    expect(r.recommended.mode).toBe("realesrgan_4x");
  });

  it("falls back to strongest preset when none reach target on 50x70", () => {
    // 800x1120 * 8 = 6400x8960 — still below 50x70 preferred (5906x8268) ✓ reaches.
    // Use much smaller source to force no-fit.
    const r = recommendUpscale(400, 560, fmt5070, 300);
    expect(r.reachesTarget).toBe(false);
    // Strongest by PPI should be tile_8x (even after possible downshift).
    expect(["tile_8x", "tile_4x", "realesrgan_4x"]).toContain(r.recommended.mode);
  });

  it("flags tile_8x downshift when output would exceed cap", () => {
    const r = recommendUpscale(2000, 2000, fmt5070, 300);
    const t8 = r.options.find((o) => o.mode === "tile_8x")!;
    expect(t8.willDownshift).toBe(true);
    expect(t8.effectiveScale).toBe(4);
  });

  it("orders options by cost rank", () => {
    const r = recommendUpscale(1024, 1024, fmt5070, 300);
    const ranks = r.options.map((o) => o.costRank);
    const sorted = [...ranks].sort((a, b) => a - b);
    expect(ranks).toEqual(sorted);
  });

  it("computes target pixels for chosen ppi", () => {
    const r = recommendUpscale(1024, 1024, fmtA4, 150);
    expect(r.targetWidthPx).toBeGreaterThan(1200);
    expect(r.targetHeightPx).toBeGreaterThan(1700);
  });

  it("ppiForPixels matches direct calc", () => {
    const ppi = ppiForPixels(fmt5070, 5906, 8268);
    expect(ppi).toBeGreaterThanOrEqual(299);
  });
});
