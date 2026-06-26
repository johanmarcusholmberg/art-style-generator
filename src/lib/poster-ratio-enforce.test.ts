import { describe, it, expect } from "vitest";
import { planPosterRatioCorrection, POSTER_RATIO_TOLERANCE } from "./poster-ratio-enforce";
import { PRINT_FORMATS } from "./print-formats";

describe("planPosterRatioCorrection — format → ratio mapping", () => {
  it("returns null for unknown formatId", () => {
    expect(planPosterRatioCorrection(1024, 1024, "nope")).toBeNull();
  });

  it("50×70 maps to 5:7", () => {
    const fmt = PRINT_FORMATS.find((f) => f.id === "print_50x70")!;
    expect(fmt.aspectRatioDecimal).toBeCloseTo(5 / 7, 5);
  });

  it("30×40 maps to 3:4", () => {
    const fmt = PRINT_FORMATS.find((f) => f.id === "print_30x40")!;
    expect(fmt.aspectRatioDecimal).toBeCloseTo(3 / 4, 5);
  });

  it("50×50 maps to 1:1", () => {
    const fmt = PRINT_FORMATS.find((f) => f.id === "print_50x50")!;
    expect(fmt.aspectRatioDecimal).toBe(1);
  });

  it("A-series formats use ISO-A ratios", () => {
    const a2 = PRINT_FORMATS.find((f) => f.id === "print_a2")!;
    const a3 = PRINT_FORMATS.find((f) => f.id === "print_a3")!;
    const a4 = PRINT_FORMATS.find((f) => f.id === "print_a4")!;
    expect(a2.aspectRatioDecimal).toBeCloseTo(420 / 594, 5);
    expect(a3.aspectRatioDecimal).toBeCloseTo(297 / 420, 5);
    expect(a4.aspectRatioDecimal).toBeCloseTo(210 / 297, 5);
  });
});

describe("planPosterRatioCorrection — no-op on exact match", () => {
  it("does not touch a 5:7 image when 50×70 is selected", () => {
    const plan = planPosterRatioCorrection(1000, 1400, "print_50x70")!;
    expect(plan.method).toBe("none");
    expect(plan.outputWidth).toBe(1000);
    expect(plan.outputHeight).toBe(1400);
    expect(plan.ratioError).toBeLessThanOrEqual(POSTER_RATIO_TOLERANCE);
  });

  it("does not touch a 1:1 image when 50×50 is selected", () => {
    const plan = planPosterRatioCorrection(1024, 1024, "print_50x50")!;
    expect(plan.method).toBe("none");
  });
});

describe("planPosterRatioCorrection — pad to fix drift", () => {
  it("the reported bug: 1094×1606 ⇒ pads up to 5:7 (no crop)", () => {
    const plan = planPosterRatioCorrection(1094, 1606, "print_50x70")!;
    expect(plan.method).toBe("pad");
    // Source ratio ~0.681 < target 5/7 (~0.714) ⇒ taller than target,
    // so we pad WIDTH to reach the target ratio.
    expect(plan.outputHeight).toBe(1606);
    expect(plan.outputWidth).toBe(Math.round(1606 * (5 / 7)));
    expect(plan.padLeft).toBeGreaterThan(0);
    expect(plan.padTop).toBe(0);
    // Final ratio is within tolerance.
    expect(Math.abs(plan.outputWidth / plan.outputHeight - 5 / 7))
      .toBeLessThan(POSTER_RATIO_TOLERANCE);
  });

  it("4166×6214 (upscaled drift) is also corrected to 5:7 by padding", () => {
    const plan = planPosterRatioCorrection(4166, 6214, "print_50x70")!;
    expect(plan.method).toBe("pad");
    expect(plan.outputWidth).toBeGreaterThan(4166); // pad width
    expect(plan.outputHeight).toBe(6214);
  });

  it("wide image vs portrait target pads height", () => {
    // 1600×1000 (1.6) vs 5:7 (0.714) ⇒ wider than target ⇒ pad height
    const plan = planPosterRatioCorrection(1600, 1000, "print_50x70")!;
    expect(plan.method).toBe("pad");
    expect(plan.outputWidth).toBe(1600);
    expect(plan.outputHeight).toBe(Math.round(1600 / (5 / 7)));
    expect(plan.padTop).toBeGreaterThan(0);
    expect(plan.padLeft).toBe(0);
  });

  it("3:4 generation requested as 1:1 pads to square", () => {
    const plan = planPosterRatioCorrection(1024, 1366, "print_50x50")!;
    expect(plan.method).toBe("pad");
    expect(plan.outputWidth).toBe(1366);
    expect(plan.outputHeight).toBe(1366);
  });

  it("never produces stretch/distort — output ratio matches target within tolerance", () => {
    const cases: Array<[number, number, string]> = [
      [1094, 1606, "print_50x70"],
      [4166, 6214, "print_50x70"],
      [1024, 1366, "print_30x40"],
      [1500, 1500, "print_a3"],
      [1600, 1000, "print_50x70"],
    ];
    for (const [w, h, id] of cases) {
      const plan = planPosterRatioCorrection(w, h, id)!;
      const finalRatio = plan.outputWidth / plan.outputHeight;
      expect(Math.abs(finalRatio - plan.targetRatio) / plan.targetRatio)
        .toBeLessThanOrEqual(POSTER_RATIO_TOLERANCE);
      // Pixel preservation: source dims must still fit inside output.
      expect(plan.outputWidth).toBeGreaterThanOrEqual(plan.sourceWidth);
      expect(plan.outputHeight).toBeGreaterThanOrEqual(plan.sourceHeight);
    }
  });

  it("regression: an off-ratio output is never marked method='none'", () => {
    const plan = planPosterRatioCorrection(1094, 1606, "print_50x70")!;
    expect(plan.method).not.toBe("none");
  });
});
