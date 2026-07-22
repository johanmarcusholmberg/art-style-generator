import { describe, expect, it } from "vitest";
import {
  planPosterRatioFinalization,
  ratioMatchesTarget,
  RATIO_FINALIZATION_ALGORITHM_VERSION,
  RatioFinalizationPlanError,
} from "./planner";
import { planPosterRatioCorrection, POSTER_RATIO_TOLERANCE } from "@/lib/poster-ratio-enforce";
import { PRINT_FORMATS } from "@/lib/print-formats";

describe("planPosterRatioFinalization — basics", () => {
  it("exact ratio → operation=none", () => {
    const plan = planPosterRatioFinalization({
      sourceWidth: 1000, sourceHeight: 1400,
      targetAspectRatio: "5:7", policy: "pad",
    });
    expect(plan.operation).toBe("none");
    expect(plan.outputWidth).toBe(1000);
    expect(plan.outputHeight).toBe(1400);
    expect(plan.padding).toBeNull();
    expect(plan.algorithmVersion).toBe(RATIO_FINALIZATION_ALGORITHM_VERSION);
  });

  it("wider source with crop policy crops horizontally", () => {
    const plan = planPosterRatioFinalization({
      sourceWidth: 1600, sourceHeight: 1000, targetAspectRatio: "5:7", policy: "crop",
    });
    expect(plan.operation).toBe("crop");
    expect(plan.outputHeight).toBe(1000);
    expect(plan.outputWidth).toBe(Math.round(1000 * (5 / 7)));
    expect(plan.sourceRect.x).toBeGreaterThan(0);
    expect(plan.sourceRect.y).toBe(0);
  });

  it("taller source with crop policy crops vertically", () => {
    const plan = planPosterRatioFinalization({
      sourceWidth: 1000, sourceHeight: 2000, targetAspectRatio: "5:7", policy: "crop",
    });
    expect(plan.operation).toBe("crop");
    expect(plan.outputWidth).toBe(1000);
    expect(plan.outputHeight).toBe(Math.round(1000 / (5 / 7)));
    expect(plan.sourceRect.y).toBeGreaterThan(0);
  });

  it("pad policy extends the short axis symmetrically", () => {
    const plan = planPosterRatioFinalization({
      sourceWidth: 1094, sourceHeight: 1606, targetAspectRatio: "5:7", policy: "pad",
    });
    expect(plan.operation).toBe("pad");
    expect(plan.outputHeight).toBe(1606);
    expect(plan.padding).not.toBeNull();
    expect(plan.padding!.left + plan.padding!.right).toBe(plan.outputWidth - 1094);
    expect(Math.abs(plan.padding!.left - plan.padding!.right)).toBeLessThanOrEqual(1);
    expect(plan.padding!.top).toBe(0);
    expect(plan.padding!.bottom).toBe(0);
  });

  it("crop retains maximum native area (crop area ≥ pad-covered area difference)", () => {
    const crop = planPosterRatioFinalization({
      sourceWidth: 1600, sourceHeight: 1000, targetAspectRatio: "5:7", policy: "crop",
    });
    const nativeArea = 1600 * 1000;
    const cropArea = crop.sourceRect.width * crop.sourceRect.height;
    // Crop discards only what's needed for the target ratio — no more.
    const targetShouldBe = crop.sourceRect.height * (5 / 7);
    expect(Math.abs(crop.sourceRect.width - targetShouldBe)).toBeLessThan(1);
    expect(cropArea).toBeLessThan(nativeArea);
  });

  it("never upscales beyond source pixels", () => {
    const cases: Array<[number, number, string, "pad" | "crop"]> = [
      [1094, 1606, "5:7", "pad"],
      [1600, 1000, "5:7", "pad"],
      [1600, 1000, "5:7", "crop"],
      [1024, 1024, "3:4", "pad"],
    ];
    for (const [w, h, r, p] of cases) {
      const plan = planPosterRatioFinalization({
        sourceWidth: w, sourceHeight: h, targetAspectRatio: r, policy: p,
      });
      // Neither dimension is upscaled beyond source (pad only extends canvas, crop only shrinks).
      expect(plan.sourceRect.width).toBeLessThanOrEqual(w);
      expect(plan.sourceRect.height).toBeLessThanOrEqual(h);
    }
  });

  it("deterministic rounding for identical inputs", () => {
    const a = planPosterRatioFinalization({
      sourceWidth: 1094, sourceHeight: 1606, targetAspectRatio: "5:7", policy: "pad",
    });
    const b = planPosterRatioFinalization({
      sourceWidth: 1094, sourceHeight: 1606, targetAspectRatio: "5:7", policy: "pad",
    });
    expect(a).toEqual(b);
  });

  it("output ratio matches target within canonical tolerance", () => {
    const cases: Array<[number, number, string, "pad" | "crop"]> = [
      [1094, 1606, "5:7", "pad"],
      [4166, 6214, "5:7", "pad"],
      [1600, 1000, "5:7", "pad"],
      [1600, 1000, "5:7", "crop"],
      [1024, 1366, "3:4", "pad"],
    ];
    for (const [w, h, r, p] of cases) {
      const plan = planPosterRatioFinalization({
        sourceWidth: w, sourceHeight: h, targetAspectRatio: r, policy: p,
      });
      expect(ratioMatchesTarget(plan.outputWidth, plan.outputHeight, plan.targetAspectRatio)).toBe(true);
    }
  });
});

describe("planPosterRatioFinalization — validation", () => {
  it("rejects zero / negative source dimensions", () => {
    expect(() =>
      planPosterRatioFinalization({ sourceWidth: 0, sourceHeight: 100, targetAspectRatio: "5:7", policy: "pad" }),
    ).toThrow(RatioFinalizationPlanError);
    expect(() =>
      planPosterRatioFinalization({ sourceWidth: 100, sourceHeight: -1, targetAspectRatio: "5:7", policy: "pad" }),
    ).toThrow(RatioFinalizationPlanError);
  });

  it("rejects invalid target ratio strings", () => {
    expect(() =>
      planPosterRatioFinalization({ sourceWidth: 100, sourceHeight: 100, targetAspectRatio: "not-a-ratio", policy: "pad" }),
    ).toThrow(RatioFinalizationPlanError);
    expect(() =>
      planPosterRatioFinalization({ sourceWidth: 100, sourceHeight: 100, targetAspectRatio: "", policy: "pad" }),
    ).toThrow(RatioFinalizationPlanError);
  });

  it("accepts numeric target ratios", () => {
    const plan = planPosterRatioFinalization({
      sourceWidth: 1000, sourceHeight: 1400, targetAspectRatio: 5 / 7, policy: "pad",
    });
    expect(plan.operation).toBe("none");
  });

  it("rejects invalid policy", () => {
    expect(() =>
      // @ts-expect-error - deliberately invalid
      planPosterRatioFinalization({ sourceWidth: 100, sourceHeight: 100, targetAspectRatio: "1:1", policy: "stretch" }),
    ).toThrow(RatioFinalizationPlanError);
  });
});

describe("planPosterRatioFinalization — behavioral parity with existing planner", () => {
  const fixtures: Array<[number, number, string, "pad" | "crop"]> = [
    [1094, 1606, "print_50x70", "pad"],
    [4166, 6214, "print_50x70", "pad"],
    [1600, 1000, "print_50x70", "pad"],
    [1024, 1366, "print_50x50", "pad"],
    [1000, 1400, "print_50x70", "pad"],
    [1024, 1024, "print_50x50", "pad"],
    [1600, 1000, "print_50x70", "crop"],
  ];

  for (const [w, h, formatId, policy] of fixtures) {
    it(`parity: ${w}x${h} ${formatId} ${policy}`, () => {
      const fmt = PRINT_FORMATS.find((f) => f.id === formatId)!;
      const oldPlan = planPosterRatioCorrection(w, h, formatId, policy)!;
      const newPlan = planPosterRatioFinalization({
        sourceWidth: w, sourceHeight: h,
        targetAspectRatio: fmt.aspectRatio, policy,
      });
      // Same operation classification (pad / crop / none)
      expect(newPlan.operation).toBe(oldPlan.method);
      // Same output canvas
      expect(newPlan.outputWidth).toBe(oldPlan.outputWidth);
      expect(newPlan.outputHeight).toBe(oldPlan.outputHeight);
      // Same target within tolerance
      expect(Math.abs(newPlan.targetAspectRatio - fmt.aspectRatioDecimal)).toBeLessThan(POSTER_RATIO_TOLERANCE);
    });
  }
});
