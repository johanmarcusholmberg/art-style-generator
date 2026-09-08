import { describe, it, expect } from "vitest";
import {
  OPENAI_POSTER_SIZE_OPTIONS,
  defaultPosterSizeOption,
  getPosterSizeOptions,
  isAllowedOpenAIPosterWireSize,
  openaiPosterWireSize,
} from "./poster-size-options";
import { gptImage2SizeForFormat, formatOpenAISize } from "./openai-gpt-image-2-sizes";
import { normalizeLegacyGenerationRequest as normalizeToV2 } from "./generation-contract-v2";

describe("50×70 generator size options", () => {
  it("offers exactly two OpenAI options: Small 1200×1680 and Large 1440×2016", () => {
    expect(OPENAI_POSTER_SIZE_OPTIONS.map((o) => o.wireSize)).toEqual([
      "1200x1680",
      "1440x2016",
    ]);
  });

  it("marks Large as recommended and default for OpenAI", () => {
    expect(OPENAI_POSTER_SIZE_OPTIONS.find((o) => o.recommended)?.id).toBe("large");
    expect(defaultPosterSizeOption("openai")).toBe("large");
  });

  it("keeps SDXL default at Small (unchanged behaviour)", () => {
    expect(defaultPosterSizeOption("sdxl")).toBe("small");
  });

  it("never offers 1600×2240", () => {
    for (const o of OPENAI_POSTER_SIZE_OPTIONS) {
      expect(o.wireSize).not.toBe("1600x2240");
    }
    expect(isAllowedOpenAIPosterWireSize("1600x2240")).toBe(false);
  });

  it("both options are exact 5:7 and multiples of 16", () => {
    for (const o of OPENAI_POSTER_SIZE_OPTIONS) {
      expect(o.width * 7).toBe(o.height * 5);
      expect(o.width % 16).toBe(0);
      expect(o.height % 16).toBe(0);
    }
  });

  it("only applies to 50×70 and the two providers", () => {
    expect(getPosterSizeOptions("openai", "print_a3")).toHaveLength(0);
    expect(getPosterSizeOptions("gemini", "print_50x70")).toHaveLength(0);
    expect(getPosterSizeOptions("openai", "print_50x70")).toHaveLength(2);
  });

  it("wire size maps each option verbatim", () => {
    expect(openaiPosterWireSize("small")).toBe("1200x1680");
    expect(openaiPosterWireSize("large")).toBe("1440x2016");
  });

  it("gpt-image-2 default 50×70 size is Large, not 1600×2240", () => {
    expect(formatOpenAISize(gptImage2SizeForFormat("print_50x70")!)).toBe("1440x2016");
  });
});

describe("openaiSizePreset contract propagation", () => {
  const base = {
    kind: "single" as const,
    styleKey: "minimalism",
    mode: "minimalism",
    prompt: "a mountain",
    aspectRatio: "5:7",
  };

  it("survives normalization for explicit OpenAI + 50×70", () => {
    const r = normalizeToV2({
      ...base,
      providerPreference: "openai",
      printFormatId: "print_50x70",
      openaiSizePreset: "small",
    });
    expect(r.openaiSizePreset).toBe("small");
  });

  it("is cleared for Auto / other providers", () => {
    const r = normalizeToV2({
      ...base,
      providerPreference: "auto",
      printFormatId: "print_50x70",
      openaiSizePreset: "small",
    });
    expect(r.openaiSizePreset).toBeNull();
  });

  it("is cleared for other formats", () => {
    const r = normalizeToV2({
      ...base,
      providerPreference: "openai",
      printFormatId: "print_a3",
      openaiSizePreset: "large",
    });
    expect(r.openaiSizePreset).toBeNull();
  });
});
