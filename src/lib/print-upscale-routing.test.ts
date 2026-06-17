import { describe, expect, it } from "vitest";
import {
  assessSelectedMode,
  recommendPrintUpscaleRoute,
} from "./print-upscale-routing";

/* ------------------------------------------------------------------ */
/* recommendPrintUpscaleRoute                                          */
/* ------------------------------------------------------------------ */

describe("recommendPrintUpscaleRoute — happy paths", () => {
  it("returns native-meets-target when source already clears the print target", () => {
    const r = recommendPrintUpscaleRoute({
      sourceWidth: 6000,
      sourceHeight: 8400,
      posterFormatId: "print_50x70",
    });
    expect(r.upscaleNeeded).toBe(false);
    expect(r.reason).toBe("native-meets-target");
    expect(r.recommendedMode).toBeNull();
    expect(r.clearsTarget).toBe(true);
  });

  it("falls back safely when source dimensions are unknown", () => {
    const r = recommendPrintUpscaleRoute({
      sourceWidth: null,
      sourceHeight: null,
      posterFormatId: "print_50x70",
    });
    expect(r.reason).toBe("unknown-dimensions-fallback");
    expect(r.recommendedMode).toBe("realesrgan_4x");
    expect(r.requiredScale).toBeNull();
    expect(r.warning).toMatch(/safe default/i);
  });

  it("30x40 source ~1488x1984 picks the smallest 4× mode that clears target", () => {
    const r = recommendPrintUpscaleRoute({
      sourceWidth: 1488,
      sourceHeight: 1984,
      posterFormatId: "print_30x40",
    });
    // target 3543x4724 → required ≈ 2.38× → 4× clears
    expect(r.recommendedMode).toBe("realesrgan_4x");
    expect(r.clearsTarget).toBe(true);
    expect(r.reason).toBe("needs-standard-upscale");
    expect(r.requiredScale).toBeGreaterThan(2);
    expect(r.requiredScale).toBeLessThanOrEqual(2.5);
  });

  it("50x70 source ~1424x1984 needs >4× → escalates to tile_8x, not plain 4×", () => {
    const r = recommendPrintUpscaleRoute({
      sourceWidth: 1424,
      sourceHeight: 1984,
      posterFormatId: "print_50x70",
    });
    // target 5906x8268 → required ≈ 4.17×, so any 4× mode would MISS the target
    expect(r.requiredScale).toBeGreaterThan(4);
    expect(r.recommendedMode).toBe("tile_8x");
    expect(r.clearsTarget).toBe(true);
    expect(r.reason).toBe("needs-large-upscale");
  });

  it("50x50 source ~1984x1984 needs ~3× → smallest 4× mode clears", () => {
    const r = recommendPrintUpscaleRoute({
      sourceWidth: 1984,
      sourceHeight: 1984,
      posterFormatId: "print_50x50",
    });
    expect(r.requiredScale).toBeGreaterThanOrEqual(2.9);
    expect(r.requiredScale).toBeLessThanOrEqual(3.1);
    expect(r.recommendedMode).toBe("realesrgan_4x");
    expect(r.clearsTarget).toBe(true);
  });

  it("A3 source ~1408x1984 picks the smallest safe route", () => {
    const r = recommendPrintUpscaleRoute({
      sourceWidth: 1408,
      sourceHeight: 1984,
      posterFormatId: "print_a3",
    });
    expect(r.recommendedMode).toBe("realesrgan_4x");
    expect(r.clearsTarget).toBe(true);
  });

  it("preview-sized variant fan-out asset escalates to a stronger route for 50x70", () => {
    const r = recommendPrintUpscaleRoute({
      sourceWidth: 1024,
      sourceHeight: 1432, // ~5:7 preview
      posterFormatId: "print_50x70",
    });
    expect(r.requiredScale).toBeGreaterThan(4);
    expect(r.recommendedMode).toBe("tile_8x");
  });
});

describe("recommendPrintUpscaleRoute — repeat / warnings", () => {
  it("alreadyUpscaled does not block — returns needs-repeat-upscale with warning", () => {
    const r = recommendPrintUpscaleRoute({
      sourceWidth: 1488,
      sourceHeight: 1984,
      posterFormatId: "print_30x40",
      alreadyUpscaled: true,
    });
    expect(r.recommendedMode).toBe("realesrgan_4x");
    expect(r.reason).toBe("needs-repeat-upscale");
    expect(r.warning).toMatch(/already been upscaled/i);
    expect(r.allowManualOverride).toBe(true);
  });

  it("no available mode in surface clears target → safest fallback + clear reason", () => {
    const r = recommendPrintUpscaleRoute({
      sourceWidth: 400,
      sourceHeight: 560,
      posterFormatId: "print_50x70",
      availableModes: ["realesrgan_4x"], // only 4× available; needs ~14×
    });
    expect(r.reason).toBe("no-mode-clears-target");
    expect(r.recommendedMode).toBe("realesrgan_4x");
    expect(r.clearsTarget).toBe(false);
    expect(r.warning).toMatch(/does not fully reach/i);
  });

  it("respects an explicit availableModes allow-list", () => {
    const r = recommendPrintUpscaleRoute({
      sourceWidth: 1488,
      sourceHeight: 1984,
      posterFormatId: "print_30x40",
      availableModes: ["tile_4x", "tile_8x"],
    });
    expect(r.recommendedMode).toBe("tile_4x");
  });

  it("manual override remains available on every result shape", () => {
    expect(
      recommendPrintUpscaleRoute({
        sourceWidth: 6000,
        sourceHeight: 8400,
        posterFormatId: "print_50x70",
      }).allowManualOverride,
    ).toBe(true);
    expect(
      recommendPrintUpscaleRoute({
        sourceWidth: null,
        sourceHeight: null,
        posterFormatId: "print_50x70",
      }).allowManualOverride,
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* assessSelectedMode                                                 */
/* ------------------------------------------------------------------ */

describe("assessSelectedMode", () => {
  it("warns when a manual selection does not clear the target", () => {
    const a = assessSelectedMode(
      {
        sourceWidth: 1424,
        sourceHeight: 1984,
        posterFormatId: "print_50x70",
      },
      "realesrgan_4x",
    );
    expect(a.clearsTarget).toBe(false);
    expect(a.warning).toMatch(/does not fully reach/i);
  });

  it("warns when a manual selection is more aggressive than needed", () => {
    const a = assessSelectedMode(
      {
        sourceWidth: 1488,
        sourceHeight: 1984,
        posterFormatId: "print_30x40",
      },
      "tile_8x",
    );
    expect(a.clearsTarget).toBe(true);
    expect(a.isMoreAggressiveThanNeeded).toBe(true);
    expect(a.warning).toMatch(/more aggressive/i);
  });

  it("returns silent assessment when the selected mode is the recommended one", () => {
    const a = assessSelectedMode(
      {
        sourceWidth: 1488,
        sourceHeight: 1984,
        posterFormatId: "print_30x40",
      },
      "realesrgan_4x",
    );
    expect(a.clearsTarget).toBe(true);
    expect(a.isMoreAggressiveThanNeeded).toBe(false);
    expect(a.warning).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* dialog-availability consistency                                     */
/* ------------------------------------------------------------------ */

// Must mirror EnhanceForPrintDialog OFFERED_MODES exactly.
const DIALOG_OFFERED = ["realesrgan_4x", "tile_4x", "tile_8x", "print_plus"] as const;

describe("router never recommends a mode hidden from the dialog", () => {
  it("recommends tile_8x for 50×70 when 4× modes can't clear the target", () => {
    const r = recommendPrintUpscaleRoute({
      sourceWidth: 1424,
      sourceHeight: 1984,
      posterFormatId: "print_50x70",
      availableModes: [...DIALOG_OFFERED],
    });
    expect(r.recommendedMode).toBe("tile_8x");
    expect(r.clearsTarget).toBe(true);
    expect(DIALOG_OFFERED).toContain(r.recommendedMode);
  });

  it("any recommendation across common print formats is in the dialog's offered list", () => {
    const formats = ["print_30x40", "print_50x50", "print_50x70", "print_a4", "print_a3", "print_a2"];
    for (const f of formats) {
      const r = recommendPrintUpscaleRoute({
        sourceWidth: 1424,
        sourceHeight: 1984,
        posterFormatId: f,
        availableModes: [...DIALOG_OFFERED],
      });
      if (r.recommendedMode) {
        expect(DIALOG_OFFERED).toContain(r.recommendedMode);
      }
    }
  });
});

