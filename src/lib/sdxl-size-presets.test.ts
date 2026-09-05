import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  SDXL_SIZE_PRESETS,
  isExactFiveBySeven,
  resolveSdxlRequestSize,
  sdxlPresetApplies,
} from "@/lib/sdxl-size-presets";
import { normalizeToV2 } from "@/lib/generation-contract-v2";
import { preflightUpscale, selectAutoUpscaler } from "@/lib/upscale-preflight";

const FALLBACK = { width: 1344, height: 1888, source: "provider_map", exact: false };

describe("SDXL size presets", () => {
  it("uses the approved exact dimensions", () => {
    expect(SDXL_SIZE_PRESETS.small.width).toBe(1200);
    expect(SDXL_SIZE_PRESETS.small.height).toBe(1680);
    expect(SDXL_SIZE_PRESETS.large.width).toBe(1440);
    expect(SDXL_SIZE_PRESETS.large.height).toBe(2016);
  });

  it("is exact 5:7, multiple of 8, inside the 2048 clamp", () => {
    for (const p of Object.values(SDXL_SIZE_PRESETS)) {
      expect(isExactFiveBySeven(p.width, p.height)).toBe(true);
      expect(Math.max(p.width, p.height)).toBeLessThanOrEqual(2048);
    }
  });

  it("mirrors the Deno resolver dimensions", () => {
    const deno = readFileSync("supabase/functions/_shared/sdxl-size-presets.ts", "utf8");
    expect(deno).toContain("width: 1200");
    expect(deno).toContain("height: 1680");
    expect(deno).toContain("width: 1440");
    expect(deno).toContain("height: 2016");
  });
});

describe("resolveSdxlRequestSize precedence", () => {
  it("preset wins when explicitly allowed on 50x70", () => {
    const r = resolveSdxlRequestSize({
      preset: "large",
      presetAllowed: true,
      posterFormatId: "print_50x70",
      requestedWidth: 1024,
      requestedHeight: 1024,
      fallback: FALLBACK,
    });
    expect(r).toMatchObject({
      width: 1440,
      height: 2016,
      sizeSource: "sdxl_preset_large",
      preset: "large",
      exact: true,
      adjusted: false,
    });
  });

  it("ignores a stale preset when not explicitly allowed", () => {
    const r = resolveSdxlRequestSize({
      preset: "large",
      presetAllowed: false,
      posterFormatId: "print_50x70",
      fallback: FALLBACK,
    });
    expect(r.preset).toBeNull();
    expect(r.sizeSource).toBe("provider_map");
  });

  it("ignores a preset on other formats", () => {
    const r = resolveSdxlRequestSize({
      preset: "small",
      presetAllowed: true,
      posterFormatId: "print_a3",
      fallback: FALLBACK,
    });
    expect(r.preset).toBeNull();
  });

  it("recomputes exactness for explicit overrides instead of inheriting it", () => {
    const r = resolveSdxlRequestSize({
      presetAllowed: false,
      requestedWidth: 1200,
      requestedHeight: 1680,
      targetRatio: 5 / 7,
      fallback: { ...FALLBACK, exact: true },
    });
    expect(r.sizeSource).toBe("override");
    expect(r.exact).toBe(true);
    expect(r.adjusted).toBe(false);
  });

  it("falls back to the existing resolver", () => {
    const r = resolveSdxlRequestSize({ fallback: FALLBACK });
    expect(r).toMatchObject({ width: 1344, height: 1888, sizeSource: "provider_map" });
  });

  it("gates the selector to explicit SDXL + 50x70", () => {
    expect(sdxlPresetApplies("sdxl", "print_50x70")).toBe(true);
    expect(sdxlPresetApplies("auto", "print_50x70")).toBe(false);
    expect(sdxlPresetApplies("sdxl", "print_a3")).toBe(false);
  });
});

describe("contract normalization clears ineligible presets", () => {
  const base = { version: 2, kind: "single", styleKey: "line-art", mode: "line-art", prompt: "x" };

  it("keeps the preset for explicit SDXL + 50x70", () => {
    const r = normalizeToV2({ ...base, providerPreference: "sdxl", printFormatId: "print_50x70", sdxlSizePreset: "large" });
    expect(r.sdxlSizePreset).toBe("large");
  });

  it("clears it for auto", () => {
    const r = normalizeToV2({ ...base, providerPreference: "auto", printFormatId: "print_50x70", sdxlSizePreset: "large" });
    expect(r.sdxlSizePreset).toBeNull();
  });

  it("clears it for other formats", () => {
    const r = normalizeToV2({ ...base, providerPreference: "sdxl", printFormatId: "print_a3", sdxlSizePreset: "small" });
    expect(r.sdxlSizePreset).toBeNull();
  });
});

describe("upscale preflight", () => {
  it("allows a Small preset source through the Normal engine", () => {
    const r = preflightUpscale({ sourceWidth: 1200, sourceHeight: 1680, scale: 4 });
    expect(r.ok).toBe(true);
    expect(r.upscalerId).toBe("realesrgan_normal");
  });

  it("blocks a Large preset source while Large stays unverified", () => {
    const r = preflightUpscale({ sourceWidth: 1440, sourceHeight: 2016, scale: 4 });
    expect(r.ok).toBe(false);
    expect(r.upscalerId).toBeNull();
  });

  it("never auto-selects Clarity", () => {
    expect(selectAutoUpscaler(2_900_000).upscalerId).not.toBe("clarity");
  });
});
