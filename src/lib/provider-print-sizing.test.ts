/**
 * Tests for `resolvePrintSize` (corrected Plan #1).
 *
 * Each block asserts one rule from the user feedback:
 *   - print sizes preserve target format aspect ratio
 *   - OpenAI sizing branches by model capability
 *   - Gemini only sends imageSize when supported
 *   - preview intent stays on the legacy small map
 */
import { describe, it, expect, vi } from "vitest";

import { PROVIDER_MODEL_REGISTRY } from "@/lib/generation-providers/registry";

// Helper to flip a model's flexible/imageSize/seed flags inside one test.
function overrideModel(id: string, patch: Record<string, unknown>) {
  const original = PROVIDER_MODEL_REGISTRY.find((m) => m.id === id);
  if (!original) throw new Error(`unknown model ${id}`);
  Object.assign(original, patch);
}

import {
  resolvePrintSize,
  resolveAdapterSizingOverrides,
  supportsDeterministicSeedReplay,
} from "./provider-print-sizing";
import { PRINT_FORMATS } from "./print-formats";


describe("resolvePrintSize — preview/standard intent (legacy)", () => {
  it("returns today's small SDXL map for preview", () => {
    const r = resolvePrintSize({
      provider: "sdxl",
      formatId: "print_50x70",
      intent: "preview",
    });
    expect(r).toMatchObject({ provider: "sdxl", width: 1344, height: 1888 });
  });

  it("returns today's fixed OpenAI size for preview", () => {
    const r = resolvePrintSize({
      provider: "openai",
      formatId: "print_50x70",
      intent: "preview",
    });
    expect(r).toMatchObject({ provider: "openai", size: "1024x1536", flexible: false });
  });

  it("returns today's Gemini aspect token for preview (no imageSize)", () => {
    const r = resolvePrintSize({
      provider: "gemini",
      formatId: "print_30x40",
      intent: "preview",
    });
    expect(r).toMatchObject({ provider: "gemini", aspectRatio: "3:4" });
    expect((r as any).imageSize).toBeUndefined();
  });
});

describe("resolvePrintSize — print intent preserves aspect ratio", () => {
  for (const fmt of PRINT_FORMATS) {
    it(`SDXL: ${fmt.id} preserves ${fmt.aspectRatio} within 0.5%`, () => {
      const r = resolvePrintSize({
        provider: "sdxl",
        formatId: fmt.id,
        intent: "print",
      }) as any;
      expect(r).toBeTruthy();
      expect(r.aspectRatioPreserved).toBe(true);
      // Must use SDXL multiples of 8
      expect(r.width % 8).toBe(0);
      expect(r.height % 8).toBe(0);
      // Long edge must not exceed SDXL's nativeMaxLongEdge
      expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(1984);
      // Larger than today's preview map for portrait/landscape formats
      // (square 1:1 stays at 1024 in the legacy map).
      const legacy = resolvePrintSize({
        provider: "sdxl",
        formatId: fmt.id,
        intent: "preview",
      }) as any;
      expect(r.width * r.height).toBeGreaterThanOrEqual(legacy.width * legacy.height);
    });
  }
});

describe("resolvePrintSize — OpenAI branches by model capability", () => {
  it("gpt-image-1 stays on the three fixed sizes, even at print intent", () => {
    const r = resolvePrintSize({
      provider: "openai",
      modelId: "openai:gpt-image-2",
      formatId: "print_50x70",
      intent: "print",
    }) as any;
    expect(["1024x1024", "1024x1536", "1536x1024"]).toContain(r.size);
    expect(r.flexible).toBe(false);
  });

  it("a flex-enabled model uses ratio-preserving dimensions", () => {
    // Temporarily flag the OpenAI entry as flexible for this test.
    overrideModel("openai:gpt-image-2", { supportsFlexibleDimensions: true });
    try {
      const r = resolvePrintSize({
        provider: "openai",
        modelId: "openai:gpt-image-2",
        formatId: "print_50x70",
        intent: "print",
      }) as any;
      expect(r.flexible).toBe(true);
      // Should NOT be one of the three fixed sizes.
      expect(["1024x1024", "1024x1536", "1536x1024"]).not.toContain(r.size);
      // Should preserve 5:7 (0.7143).
      const ratio = r.width / r.height;
      const target = 5 / 7;
      expect(Math.abs(ratio - target) / target).toBeLessThan(0.005);
    } finally {
      overrideModel("openai:gpt-image-2", { supportsFlexibleDimensions: false });
    }
  });
});

describe("resolvePrintSize — Gemini only sends imageSize when supported", () => {
  it("returns aspect-only by default (no imageSize)", () => {
    const r = resolvePrintSize({
      provider: "gemini",
      modelId: "gemini:nano-banana-pro",
      formatId: "print_30x40",
      intent: "print",
    }) as any;
    expect(r.aspectRatio).toBe("3:4");
    expect(r.imageSize).toBeUndefined();
  });

  it("emits imageSize only when the model opts in", () => {
    overrideModel("gemini:nano-banana-pro", { supportsImageSizeParameter: true });
    try {
      const r = resolvePrintSize({
        provider: "gemini",
        modelId: "gemini:nano-banana-pro",
        formatId: "print_30x40",
        intent: "print",
      }) as any;
      expect(r.imageSize).toBeDefined();
      expect(r.imageSize.width % 64).toBe(0);
      expect(r.imageSize.height % 64).toBe(0);
    } finally {
      overrideModel("gemini:nano-banana-pro", { supportsImageSizeParameter: false });
    }
  });
});

describe("supportsDeterministicSeedReplay", () => {
  it("returns false for every model today", () => {
    for (const m of PROVIDER_MODEL_REGISTRY) {
      expect(supportsDeterministicSeedReplay(m.id)).toBe(false);
    }
  });

  it("returns true once a model opts in", () => {
    overrideModel("openai:gpt-image-2", { supportsDeterministicSeedReplay: true });
    try {
      expect(supportsDeterministicSeedReplay("openai:gpt-image-2")).toBe(true);
    } finally {
      overrideModel("openai:gpt-image-2", { supportsDeterministicSeedReplay: false });
    }
  });

  it("returns false for unknown modelId", () => {
    expect(supportsDeterministicSeedReplay(undefined)).toBe(false);
    expect(supportsDeterministicSeedReplay("does-not-exist")).toBe(false);
  });
});

describe("resolveAdapterSizingOverrides — sizeIntent wire format", () => {
  it("preview intent emits no size overrides for any provider", () => {
    for (const provider of ["sdxl", "openai", "gemini"] as const) {
      const o = resolveAdapterSizingOverrides({
        provider,
        formatId: "print_50x70",
        intent: "preview",
      });
      expect(o?.sizeIntent).toBe("preview");
      expect((o as any)?.requestedWidth).toBeUndefined();
      expect((o as any)?.requestedSize).toBeUndefined();
      expect((o as any)?.imageSize).toBeUndefined();
    }
  });

  it("print intent emits SDXL width/height overrides preserving the ratio", () => {
    const o = resolveAdapterSizingOverrides({
      provider: "sdxl",
      formatId: "print_50x70",
      intent: "print",
    }) as any;
    expect(o.sizeIntent).toBe("print");
    expect(o.requestedWidth).toBeGreaterThanOrEqual(1408);
    expect(o.requestedHeight).toBeGreaterThanOrEqual(1408);
    expect(o.requestedWidth % 8).toBe(0);
    expect(o.requestedHeight % 8).toBe(0);
    expect(o.aspectRatioPreserved).toBe(true);
  });

  it("print intent + fixed-size OpenAI model emits NO requestedSize", () => {
    const o = resolveAdapterSizingOverrides({
      provider: "openai",
      modelId: "openai:gpt-image-2",
      formatId: "print_50x70",
      intent: "print",
    }) as any;
    expect(o.sizeIntent).toBe("print");
    expect(o.requestedSize).toBeUndefined();
  });

  it("print intent + flexible OpenAI model emits requestedSize", () => {
    overrideModel("openai:gpt-image-2", { supportsFlexibleDimensions: true });
    try {
      const o = resolveAdapterSizingOverrides({
        provider: "openai",
        modelId: "openai:gpt-image-2",
        formatId: "print_50x70",
        intent: "print",
      }) as any;
      expect(o.requestedSize).toMatch(/^\d+x\d+$/);
      expect(["1024x1024", "1024x1536", "1536x1024"]).not.toContain(o.requestedSize);
    } finally {
      overrideModel("openai:gpt-image-2", { supportsFlexibleDimensions: false });
    }
  });

  it("print intent + Gemini emits aspect ratio, no imageSize unless model opts in", () => {
    const o = resolveAdapterSizingOverrides({
      provider: "gemini",
      modelId: "gemini:nano-banana-pro",
      formatId: "print_30x40",
      intent: "print",
    }) as any;
    expect(o.requestedAspectRatio).toBe("3:4");
    expect(o.imageSize).toBeUndefined();

    overrideModel("gemini:nano-banana-pro", { supportsImageSizeParameter: true });
    try {
      const o2 = resolveAdapterSizingOverrides({
        provider: "gemini",
        modelId: "gemini:nano-banana-pro",
        formatId: "print_30x40",
        intent: "print",
      }) as any;
      expect(o2.imageSize).toBeDefined();
    } finally {
      overrideModel("gemini:nano-banana-pro", { supportsImageSizeParameter: false });
    }
  });
});
