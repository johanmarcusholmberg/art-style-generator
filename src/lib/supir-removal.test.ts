/**
 * Surgical-removal guard for the retired SUPIR / Print+ pipeline.
 *
 * If any of these tests fail, somebody has re-introduced the removed feature
 * — please re-read the 2025-Q4 audit before resurrecting it. The dynamic
 * `print_target_300` route is the supported replacement.
 */
import { describe, expect, it } from "vitest";
import {
  UPSCALE_MODES,
  UPSCALE_MODE_OPTIONS,
  type UpscaleMode,
} from "@/lib/upscale-modes";
import { UPSCALE_RECIPES } from "@/lib/upscale-recipes";
import { estimateUpscaleCost } from "@/lib/admin-asset-cost";

describe("SUPIR / Print+ removal", () => {
  it("does not include print_plus in the active UpscaleMode union", () => {
    const modes = Object.keys(UPSCALE_MODES) as string[];
    expect(modes).not.toContain("print_plus");
  });

  it("does not expose print_plus in the option list", () => {
    const ids = UPSCALE_MODE_OPTIONS.map((m) => m.id as string);
    expect(ids).not.toContain("print_plus");
  });

  it("has no recipe that recommends print_plus", () => {
    for (const recipe of Object.values(UPSCALE_RECIPES)) {
      expect(recipe.recommendedMode as string).not.toBe("print_plus");
    }
  });

  it("photo_restore recipe falls back to tile_4x (not print_plus)", () => {
    expect(UPSCALE_RECIPES.photo_restore.recommendedMode).toBe("tile_4x");
  });

  it("typescript-level: print_plus is not assignable to UpscaleMode", () => {
    // @ts-expect-error – print_plus has been removed from the union
    const bad: UpscaleMode = "print_plus";
    expect(bad).toBe("print_plus");
  });

  it("retains legacy cost lookup for historical 'supir' / 'print_plus' rows", () => {
    // Old asset/cost rows must still render — keep the cost map read-only legacy.
    expect(estimateUpscaleCost("supir")).not.toBeNull();
    expect(estimateUpscaleCost("print_plus")).not.toBeNull();
  });
});
