import { describe, expect, it } from "vitest";
import {
  calculatePrintTargetUpscale,
  ceilToSafePrecision,
  DYNAMIC_DEFAULT_MAX_LONG_SIDE,
  REALESRGAN_DYNAMIC_MAX_SCALE,
} from "./print-target-upscale";

describe("ceilToSafePrecision", () => {
  it("ceils up to the next 2-decimal step", () => {
    expect(ceilToSafePrecision(5.148, 2)).toBe(5.15);
    expect(ceilToSafePrecision(5.141, 2)).toBe(5.15);
  });
  it("keeps values already on the precision grid stable", () => {
    expect(ceilToSafePrecision(5.15, 2)).toBe(5.15);
    expect(ceilToSafePrecision(2.0, 2)).toBe(2.0);
  });
  it("never rounds down", () => {
    expect(ceilToSafePrecision(4.0001, 2)).toBe(4.01);
  });
});

describe("calculatePrintTargetUpscale — 50×70 contract", () => {
  it("resolves 50×70 target to 5906×8268 at 300 PPI", () => {
    const p = calculatePrintTargetUpscale({
      sourceWidth: 1147,
      sourceHeight: 1606,
      posterFormatId: "print_50x70",
    });
    expect(p.targetWidth).toBe(5906);
    expect(p.targetHeight).toBe(8268);
    expect(p.targetDpi).toBe(300);
  });

  it("calculates required ≈ 5.148 and requests 5.15 (never below)", () => {
    const p = calculatePrintTargetUpscale({
      sourceWidth: 1147,
      sourceHeight: 1606,
      posterFormatId: "print_50x70",
    });
    expect(p.requiredScaleRaw).toBeGreaterThan(5.147);
    expect(p.requiredScaleRaw).toBeLessThan(5.149);
    expect(p.requestedScale).toBeGreaterThanOrEqual(5.15);
    expect(p.roundedScaleUp).toBe(true);
    expect(p.status).toBe("dynamic_upscale_recommended");
  });

  it("predicted output ≥ target on both axes", () => {
    const p = calculatePrintTargetUpscale({
      sourceWidth: 1147,
      sourceHeight: 1606,
      posterFormatId: "print_50x70",
    });
    expect(p.predictedOutputWidth).toBeGreaterThanOrEqual(p.targetWidth);
    expect(p.predictedOutputHeight).toBeGreaterThanOrEqual(p.targetHeight);
    expect(p.clears300Ppi).toBe(true);
    expect(p.effectivePpiAfterUpscale).toBeGreaterThanOrEqual(300);
  });
});

describe("calculatePrintTargetUpscale — guards", () => {
  it("returns already_ready when source meets target", () => {
    const p = calculatePrintTargetUpscale({
      sourceWidth: 6000,
      sourceHeight: 8400,
      posterFormatId: "print_50x70",
    });
    expect(p.status).toBe("already_ready");
    expect(p.requestedScale).toBe(1);
    expect(p.noUpscaleNeeded).toBe(true);
  });

  it("blocks when source is too small (>8× required)", () => {
    const p = calculatePrintTargetUpscale({
      sourceWidth: 400,
      sourceHeight: 560,
      posterFormatId: "print_50x70",
    });
    expect(p.status).toBe("source_too_small");
    expect(p.clears300Ppi).toBe(false);
    expect(p.warning).toBeTruthy();
  });

  it("blocks when predicted output exceeds maxLongSide", () => {
    // Source 3000×4200 with ~2× would land ~6000×8400 (under default cap);
    // pin a small cap to exercise the guard deterministically.
    const p = calculatePrintTargetUpscale({
      sourceWidth: 1147,
      sourceHeight: 1606,
      posterFormatId: "print_50x70",
      maxLongSide: 6000,
    });
    expect(p.status).toBe("output_too_large");
    expect(p.exceedsMaxLongSide).toBe(true);
    expect(p.warning).toBeTruthy();
  });

  it("Clarity dynamic is marked unsupported (routes via Real-ESRGAN)", () => {
    const p = calculatePrintTargetUpscale({
      sourceWidth: 1147,
      sourceHeight: 1606,
      posterFormatId: "print_50x70",
      upscaleFamily: "clarity",
    });
    expect(p.status).toBe("unsupported_dynamic_scale");
  });

  it("default max long side matches the central constant", () => {
    expect(DYNAMIC_DEFAULT_MAX_LONG_SIDE).toBeGreaterThanOrEqual(8192);
  });

  it("respects the Real-ESRGAN provider max scale", () => {
    expect(REALESRGAN_DYNAMIC_MAX_SCALE).toBe(8);
  });

  it("throws on unknown format", () => {
    expect(() =>
      calculatePrintTargetUpscale({
        sourceWidth: 1000,
        sourceHeight: 1400,
        posterFormatId: "nope",
      }),
    ).toThrow();
  });
});
