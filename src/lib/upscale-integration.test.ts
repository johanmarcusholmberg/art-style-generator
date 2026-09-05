/**
 * Integration guards for the SDXL 50×70 → print upscale routing.
 *
 * Proves the registry is the single source of truth, that ineligible
 * routes are blocked (never substituted or silently downscaled), and
 * that generation-size copy no longer promises an upscale route.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import { SDXL_SIZE_PRESETS } from "@/lib/sdxl-size-presets";
import {
  UPSCALERS,
  inputPixelEnvelope,
  acceptsInputPixels,
} from "@/lib/upscalers";
import { preflightUpscale, selectAutoUpscaler } from "@/lib/upscale-preflight";

const SMALL = SDXL_SIZE_PRESETS.small;

describe("SDXL Small vs Real-ESRGAN Normal envelope", () => {
  it("1200×1680 is exactly 2,016,000 px", () => {
    expect(SMALL.width).toBe(1200);
    expect(SMALL.height).toBe(1680);
    expect(SMALL.width * SMALL.height).toBe(2_016_000);
  });

  it("Normal's configured limit is 2,000,000 px and rejects Small", () => {
    expect(inputPixelEnvelope(UPSCALERS.realesrgan_normal)).toBe(2_000_000);
    expect(
      acceptsInputPixels(UPSCALERS.realesrgan_normal, SMALL.width * SMALL.height),
    ).toBe(false);

    const r = preflightUpscale({
      sourceWidth: SMALL.width,
      sourceHeight: SMALL.height,
      scale: 4.11,
      upscalerId: "realesrgan_normal",
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("input_too_large");
    expect(r.reason).toMatch(/2 MP/);
  });
});

describe("no silent substitution or downscaling", () => {
  it("disabled Large is never selected by Auto", () => {
    expect(UPSCALERS.realesrgan_large.enabled).toBe(false);
    expect(selectAutoUpscaler(SMALL.width * SMALL.height).upscalerId).toBeNull();
  });

  it("Auto reports unavailable rather than falling back to Clarity", () => {
    const r = preflightUpscale({
      sourceWidth: SMALL.width,
      sourceHeight: SMALL.height,
      scale: 4.11,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("no_eligible_upscaler");
    expect(r.upscalerId).toBeNull();
    expect(r.autoSelected).toBe(true);
  });

  it("manual unavailable choice is blocked, not swapped", () => {
    const r = preflightUpscale({
      sourceWidth: SMALL.width,
      sourceHeight: SMALL.height,
      scale: 2,
      upscalerId: "realesrgan_large",
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("upscaler_disabled");
    expect(r.upscalerId).toBe("realesrgan_large");
  });

  it("preflight never changes the source dimensions", () => {
    const r = preflightUpscale({
      sourceWidth: SMALL.width,
      sourceHeight: SMALL.height,
      scale: 4,
      upscalerId: "realesrgan_normal",
    });
    expect(r.inputPixels).toBe(SMALL.width * SMALL.height);
    // output is derived from the untouched source, no shrink applied
    const r2 = preflightUpscale({
      sourceWidth: 1000,
      sourceHeight: 1400,
      scale: 4,
      upscalerId: "realesrgan_normal",
    });
    expect(r2.ok).toBe(true);
    expect(r2.outputWidth).toBe(4000);
    expect(r2.outputHeight).toBe(5600);
  });

  it("Clarity keeps its manual-only behaviour with no registry pixel block", () => {
    expect(inputPixelEnvelope(UPSCALERS.clarity)).toBeNull();
    const r = preflightUpscale({
      sourceWidth: SMALL.width,
      sourceHeight: SMALL.height,
      scale: 4,
      upscalerId: "clarity",
    });
    expect(r.ok).toBe(true);
    expect(r.upscalerId).toBe("clarity");
    expect(r.autoSelected).toBe(false);
  });
});

describe("single source of truth + honest copy", () => {
  const read = (p: string) =>
    fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

  it("generated-image-assets.ts no longer owns a Real-ESRGAN limit constant", () => {
    const src = read("src/lib/generated-image-assets.ts");
    expect(src).not.toMatch(/MAX_REALESRGAN_INPUT_PIXELS\s*=/);
    expect(src).toMatch(/inputPixelEnvelope/);
  });

  it("useUpscale runs preflight after poster-master correction", () => {
    const src = read("src/hooks/use-upscale.ts");
    const correctionIdx = src.indexOf("preparePosterMaster(");
    const preflightIdx = src.indexOf("preflightUpscale(");
    expect(correctionIdx).toBeGreaterThan(-1);
    expect(preflightIdx).toBeGreaterThan(correctionIdx);
  });

  it("Small preset copy does not promise an upscale route", () => {
    expect(SMALL.label).toBe("Small");
    expect(SMALL.description).toBe("Smaller SDXL source.");
    expect(SDXL_SIZE_PRESETS.large.description).toBe(
      "Higher-detail SDXL source.",
    );
    expect(`${SMALL.label} ${SMALL.description}`).not.toMatch(/Real-ESRGAN/i);
  });
});

describe("unchanged behaviour outside SDXL 50×70", () => {
  it("a typical 1024×1024 non-SDXL source still routes to Normal", () => {
    const r = preflightUpscale({
      sourceWidth: 1024,
      sourceHeight: 1024,
      scale: 4,
    });
    expect(r.ok).toBe(true);
    expect(r.upscalerId).toBe("realesrgan_normal");
    expect(r.autoSelected).toBe(true);
  });
});
