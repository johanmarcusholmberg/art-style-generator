import { describe, it, expect } from "vitest";
import { resolveUpscaleSource } from "./upscale-source";

const AVAILABLE = ["realesrgan_4x", "tile_4x", "tile_8x"] as const;

const ORIGINAL = {
  url: "https://cdn.example/original.png",
  width: 1488,
  height: 1984,
};
const ENHANCED = {
  url: "https://cdn.example/enhanced.png",
  width: 5952,
  height: 7936,
};

describe("resolveUpscaleSource", () => {
  it("first upscale uses original when no enhanced exists", () => {
    const r = resolveUpscaleSource({
      original: ORIGINAL,
      enhanced: null,
      posterFormatId: "print_30x40",
      availableModes: [...AVAILABLE],
    });
    expect(r.resolved).toBe("original");
    expect(r.url).toBe(ORIGINAL.url);
    expect(r.sourceWasAlreadyUpscaled).toBe(false);
    expect(r.enhancedAvailable).toBe(false);
  });

  it("auto prefers enhanced when both exist and enhanced has dims", () => {
    const r = resolveUpscaleSource({
      original: ORIGINAL,
      enhanced: ENHANCED,
      posterFormatId: "print_30x40",
      availableModes: [...AVAILABLE],
    });
    expect(r.choice).toBe("auto");
    expect(r.resolved).toBe("enhanced");
    expect(r.url).toBe(ENHANCED.url);
    expect(r.sourceWasAlreadyUpscaled).toBe(true);
  });

  it("auto prefers enhanced when a gap to target remains", () => {
    // Tiny enhanced source vs huge 50×70 target
    const tinyEnhanced = { url: "e", width: 2000, height: 2800 };
    const r = resolveUpscaleSource({
      original: ORIGINAL,
      enhanced: tinyEnhanced,
      posterFormatId: "print_50x70",
      availableModes: [...AVAILABLE],
    });
    expect(r.resolved).toBe("enhanced");
    expect(r.url).toBe(tinyEnhanced.url);
  });

  it("explicit 'original' forces original even when enhanced exists", () => {
    const r = resolveUpscaleSource({
      original: ORIGINAL,
      enhanced: ENHANCED,
      choice: "original",
      posterFormatId: "print_30x40",
    });
    expect(r.resolved).toBe("original");
    expect(r.url).toBe(ORIGINAL.url);
    expect(r.sourceWasAlreadyUpscaled).toBe(false);
  });

  it("explicit 'enhanced' forces enhanced", () => {
    const r = resolveUpscaleSource({
      original: ORIGINAL,
      enhanced: ENHANCED,
      choice: "enhanced",
      posterFormatId: "print_30x40",
    });
    expect(r.resolved).toBe("enhanced");
    expect(r.url).toBe(ENHANCED.url);
    expect(r.sourceWasAlreadyUpscaled).toBe(true);
  });

  it("falls back to original when enhanced is missing dimensions (auto)", () => {
    const r = resolveUpscaleSource({
      original: ORIGINAL,
      enhanced: { url: "e", width: null, height: null },
      posterFormatId: "print_30x40",
    });
    expect(r.resolved).toBe("original");
    expect(r.url).toBe(ORIGINAL.url);
  });

  it("falls back to original when 'enhanced' chosen but enhanced source has no URL", () => {
    const r = resolveUpscaleSource({
      original: ORIGINAL,
      enhanced: { url: null, width: 5952, height: 7936 },
      choice: "enhanced",
      posterFormatId: "print_30x40",
    });
    expect(r.resolved).toBe("original");
    expect(r.enhancedAvailable).toBe(false);
  });
});
