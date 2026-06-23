/**
 * Phase 4: Style-specific upscale recipe coverage for new styles
 * (Art Nouveau, Mid-Century Modern, Loose Watercolor) plus the
 * repositioned Urban Noir.
 *
 * These tests pin the recipe resolver so the four styles never silently
 * regress back to safe_default, and they verify that print routing
 * escalation remains style-agnostic (recipes do not block tile_8x).
 */
import { describe, it, expect } from "vitest";
import {
  resolveUpscaleRecipe,
  UPSCALE_RECIPES,
} from "@/lib/upscale-recipes";
import { recommendPrintUpscaleRoute } from "@/lib/print-upscale-routing";
import { assessUpscaleSuitability } from "@/lib/upscale-suitability";

describe("resolveUpscaleRecipe — Phase 4 styles", () => {
  it.each([
    ["artnouveau", "decorative_linework"],
    ["artnouveau-freestyle", "decorative_linework"],
    ["midcenturymodern", "flat_graphic"],
    ["midcenturymodern-freestyle", "flat_graphic"],
    ["loosewatercolor", "painterly_soft"],
    ["loosewatercolor-freestyle", "painterly_soft"],
    ["urbannoir", "illustrative_noir"],
    ["urbannoir-freestyle", "illustrative_noir"],
  ])("styleKey %s resolves to %s (not safe_default)", (styleKey, expected) => {
    const recipe = resolveUpscaleRecipe({ styleKey });
    expect(recipe.id).toBe(expected);
    expect(recipe.id).not.toBe("safe_default");
  });

  it("falls back to mode field when styleKey is missing", () => {
    expect(resolveUpscaleRecipe({ mode: "artnouveau" }).id).toBe(
      "decorative_linework",
    );
    expect(resolveUpscaleRecipe({ mode: "midcenturymodern" }).id).toBe(
      "flat_graphic",
    );
  });

  it("urban noir no longer routes to photo_restore (no fine-grain emphasis)", () => {
    const recipe = resolveUpscaleRecipe({ styleKey: "urbannoir" });
    expect(recipe.id).not.toBe("photo_restore");
    expect(recipe.recommendedMode).not.toBe("print_plus");
  });

  it("recipe registry references valid existing modes", () => {
    for (const r of [
      UPSCALE_RECIPES.decorative_linework,
      UPSCALE_RECIPES.flat_graphic,
      UPSCALE_RECIPES.illustrative_noir,
    ]) {
      expect(r.recommendedMode).toBeDefined();
      expect(r.fallbackMode).toBeDefined();
    }
  });
});

describe("Large-format escalation participates for Phase 4 styles", () => {
  // Small 1024x1024 source → 50x70cm @ 300 PPI (~5906x8268) requires >4×.
  const largeTargetInput = {
    sourceWidth: 1080,
    sourceHeight: 1080,
    targetWidth: 5906,
    targetHeight: 8268,
    surface: "manual" as const,
  };

  it("routes to tile_8x when 4× cannot clear the print target", () => {
    const result = recommendPrintUpscaleRoute(largeTargetInput);
    expect(result.recommendedMode).toBe("tile_8x");
    expect(result.clearsTarget).toBe(true);
  });

  it("routing remains style-agnostic (recipes do not block escalation)", () => {
    // Recipe is selected independently from print routing — this is the
    // contract Phase 4 must preserve.
    for (const styleKey of [
      "artnouveau",
      "midcenturymodern",
      "loosewatercolor",
      "urbannoir",
    ]) {
      const recipe = resolveUpscaleRecipe({ styleKey });
      const route = recommendPrintUpscaleRoute(largeTargetInput);
      expect(recipe.id).not.toBe("safe_default");
      expect(route.recommendedMode).toBe("tile_8x");
    }
  });
});

describe("Suitability copy — Phase 4", () => {
  const baseAsset = {
    base_width_px: 2048,
    base_height_px: 2048,
  };

  it("loose watercolor surfaces a soft/painterly caveat (no crisp promise)", () => {
    const s = assessUpscaleSuitability({ ...baseAsset, mode: "loosewatercolor" });
    expect(s.riskFlags.some((r) => /soft|painterly/i.test(r))).toBe(true);
    expect(s.recommendation).not.toMatch(/crisp|sharp/i);
  });

  it("mid-century modern is treated as sharp/graphic and biased upward", () => {
    const s = assessUpscaleSuitability({ ...baseAsset, mode: "midcenturymodern" });
    expect(s.reasons.some((r) => /sharp|graphic/i.test(r))).toBe(true);
  });

  it("art nouveau is treated as sharp/graphic decorative work", () => {
    const s = assessUpscaleSuitability({ ...baseAsset, mode: "artnouveau" });
    expect(s.reasons.some((r) => /sharp|graphic/i.test(r))).toBe(true);
  });

  it("urban noir no longer flagged as soft/painterly after repositioning", () => {
    const s = assessUpscaleSuitability({ ...baseAsset, mode: "urbannoir" });
    expect(
      s.riskFlags.some((r) => /soft|painterly/i.test(r)),
    ).toBe(false);
  });
});
