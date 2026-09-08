import { describe, it, expect } from "vitest";
import { resolveRequestedEngine } from "@/hooks/use-upscale";
import { preflightUpscale } from "@/lib/upscale-preflight";
import { UPSCALERS } from "@/lib/upscalers";

describe("requested engine resolution", () => {
  it("routes the recommended 300 PPI flow to Auto, not Clarity", () => {
    expect(
      resolveRequestedEngine({
        mode: "print_target_300",
        upscaleFamily: "realesrgan",
      }),
    ).toBeNull();
  });

  it("keeps explicit Clarity and tiled async routes on Clarity", () => {
    expect(
      resolveRequestedEngine({ mode: "clarity_dynamic" }),
    ).toBe("clarity");
    expect(
      resolveRequestedEngine({
        mode: "print_target_300",
        upscaleFamily: "clarity",
      }),
    ).toBe("clarity");
    expect(resolveRequestedEngine({ mode: "tile_8x" })).toBe("clarity");
  });

  it("never substitutes an explicitly selected engine", () => {
    expect(
      resolveRequestedEngine({
        mode: "print_target_300",
        upscalerId: "realesrgan_large",
        upscaleFamily: "clarity",
      }),
    ).toBe("realesrgan_large");
  });
});

describe("Large Real-ESRGAN envelope (regressions A/B)", () => {
  it("A: 1200x1680 (2.016 MP, above Normal's 2.0 MP cap) routes to Large under Auto", () => {
    const r = preflightUpscale({
      sourceWidth: 1200,
      sourceHeight: 1680,
      scale: 4.11,
    });
    expect(r.ok).toBe(true);
    expect(r.upscalerId).toBe("realesrgan_large");
  });

  it("A2: 1440x2016 Auto selects Large", () => {
    const r = preflightUpscale({
      sourceWidth: 1440,
      sourceHeight: 2016,
      scale: 4.11,
    });
    expect(r.ok).toBe(true);
    expect(r.upscalerId).toBe("realesrgan_large");
    expect(r.outputWidth).toBeGreaterThanOrEqual(5906);
    expect(r.outputHeight).toBeGreaterThanOrEqual(8268);
  });

  it("B: a source above the verified Large ceiling is blocked, not resized", () => {
    const above = UPSCALERS.realesrgan_large.verifiedInputPixels! + 1_000_000;
    const w = 2000;
    const h = Math.ceil(above / w);
    const auto = preflightUpscale({ sourceWidth: w, sourceHeight: h, scale: 2 });
    expect(auto.ok).toBe(false);
    expect(auto.upscalerId).toBeNull();

    const manual = preflightUpscale({
      sourceWidth: w,
      sourceHeight: h,
      scale: 2,
      upscalerId: "realesrgan_large",
    });
    expect(manual.ok).toBe(false);
    expect(manual.code).toBe("input_too_large");
    expect(manual.upscalerId).toBe("realesrgan_large");
  });
});
