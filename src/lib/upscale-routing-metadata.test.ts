import { describe, it, expect } from "vitest";
import { buildUpscaleRoutingMetadata } from "./upscale-routing-metadata";

const AVAILABLE = ["realesrgan_4x", "tile_4x", "tile_8x"] as const;

describe("buildUpscaleRoutingMetadata", () => {
  it("records recommended-mode metadata for a normal upscale", () => {
    const md = buildUpscaleRoutingMetadata(
      {
        sourceWidth: 1488,
        sourceHeight: 1984,
        posterFormatId: "print_30x40",
        alreadyUpscaled: false,
        availableModes: [...AVAILABLE],
      },
      "realesrgan_4x",
    );
    expect(md.selectedMode).toBe("realesrgan_4x");
    expect(md.recommendedMode).toBe("realesrgan_4x");
    expect(md.matchedRecommendation).toBe(true);
    expect(md.manualOverride).toBe(false);
    expect(md.alreadyUpscaled).toBe(false);
    expect(md.requiredScale).not.toBeNull();
    expect(md.targetWidth).toBeGreaterThan(0);
    expect(md.expectedOutput?.width).toBeGreaterThan(md.sourceWidth!);
  });

  it("flags manual override when selected differs from recommendation", () => {
    const md = buildUpscaleRoutingMetadata(
      {
        sourceWidth: 1488,
        sourceHeight: 1984,
        posterFormatId: "print_30x40",
        availableModes: [...AVAILABLE],
      },
      "tile_8x",
    );
    expect(md.manualOverride).toBe(true);
    expect(md.matchedRecommendation).toBe(false);
    expect(md.recommendedMode).toBe("realesrgan_4x");
    expect(md.selectedMode).toBe("tile_8x");
  });

  it("records alreadyUpscaled on a repeat upscale", () => {
    const md = buildUpscaleRoutingMetadata(
      {
        sourceWidth: 1488,
        sourceHeight: 1984,
        posterFormatId: "print_30x40",
        alreadyUpscaled: true,
        availableModes: [...AVAILABLE],
      },
      "realesrgan_4x",
    );
    expect(md.alreadyUpscaled).toBe(true);
    expect(md.routingReason).toBe("needs-repeat-upscale");
    expect(md.routingWarning).toMatch(/already been upscaled/i);
  });

  it("captures a warning when the selected mode does not clear target", () => {
    const md = buildUpscaleRoutingMetadata(
      {
        sourceWidth: 600,
        sourceHeight: 800,
        posterFormatId: "print_50x70",
        availableModes: ["realesrgan_4x"],
      },
      "realesrgan_4x",
    );
    expect(md.selectedClearsTarget).toBe(false);
    expect(md.selectedWarning).toMatch(/does not fully reach/i);
  });

  it("safely handles unknown source dimensions", () => {
    const md = buildUpscaleRoutingMetadata(
      {
        sourceWidth: null,
        sourceHeight: null,
        posterFormatId: "print_30x40",
        availableModes: [...AVAILABLE],
      },
      "realesrgan_4x",
    );
    expect(md.sourceWidth).toBeNull();
    expect(md.requiredScale).toBeNull();
    expect(md.routingReason).toBe("unknown-dimensions-fallback");
  });
});

describe("buildUpscaleRoutingMetadata — source trail (Plan #2d)", () => {
  it("includes sourceChoice/resolvedSource/sourceWasAlreadyUpscaled when provided", () => {
    const md = buildUpscaleRoutingMetadata(
      {
        sourceWidth: 5952,
        sourceHeight: 7936,
        posterFormatId: "print_30x40",
        alreadyUpscaled: true,
        availableModes: ["realesrgan_4x", "tile_4x", "tile_8x"],
      },
      "realesrgan_4x",
      {
        sourceChoice: "auto",
        resolvedSource: "enhanced",
        sourceWasAlreadyUpscaled: true,
      },
    );
    expect(md.sourceChoice).toBe("auto");
    expect(md.resolvedSource).toBe("enhanced");
    expect(md.sourceWasAlreadyUpscaled).toBe(true);
  });

  it("omits source trail when not provided (backward compatible)", () => {
    const md = buildUpscaleRoutingMetadata(
      {
        sourceWidth: 1488,
        sourceHeight: 1984,
        posterFormatId: "print_30x40",
        availableModes: ["realesrgan_4x", "tile_4x", "tile_8x"],
      },
      "realesrgan_4x",
    );
    expect(md.sourceChoice).toBeUndefined();
    expect(md.resolvedSource).toBeUndefined();
  });
});
