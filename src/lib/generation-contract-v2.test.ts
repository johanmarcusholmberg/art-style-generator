/**
 * Contract tests for `GenerationRequestV2`.
 *
 *   - Version stamped correctly on every produced request.
 *   - Legacy payload normalization fills every V2 field with a stable
 *     default and never invents provider choices.
 *   - Deno mirror stays byte-for-byte aligned on the field list — a
 *     mismatch here means the server will silently drop a field.
 *   - Executable-provider gating rejects OpenAI at the client boundary.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GENERATION_REQUEST_VERSION,
  GENERATION_REQUEST_V2_FIELDS,
  normalizeLegacyGenerationRequest,
  validateGenerationRequestV2,
  type GenerationRequestV2,
} from "./generation-contract-v2";
import {
  checkDurableExecutability,
  DURABLY_EXECUTABLE_PROVIDERS,
  isDurablyExecutable,
} from "./generation-executable-providers";

describe("GenerationRequestV2 normalization", () => {
  it("stamps version and fills every field for an empty legacy payload", () => {
    const v2 = normalizeLegacyGenerationRequest({});
    expect(v2.version).toBe(GENERATION_REQUEST_VERSION);
    for (const key of GENERATION_REQUEST_V2_FIELDS) {
      expect(v2, `missing field ${key}`).toHaveProperty(key);
    }
    expect(v2.providerPreference).toBe("auto");
    expect(v2.kind).toBe("single");
    expect(v2.aspectRatio).toBe("5:7");
  });

  it("preserves an existing V2 payload", () => {
    const input: GenerationRequestV2 = {
      version: GENERATION_REQUEST_VERSION,
      kind: "single",
      styleKey: "ukiyoe",
      mode: "ukiyoe",
      prompt: "koi in a river",
      posterFormatHint: null,
      sourceImageUrl: null,
      sourceImageId: null,
      referenceStrength: null,
      providerPreference: "gemini",
      requestedModelId: "gemini:gemini-2.5-flash-image",
      qualityProfile: "strict",
      generationStrategy: "artistic",
      strictness: "strict",
      aspectRatio: "3:4",
      backgroundStyle: "cream",
      generationMode: "print-ready",
      printFormatId: "fmt-50x70",
      printSize: "50x70cm",
      qualityMode: "quality",
      targetPpi: 300,
      targetWidthPx: 5906,
      targetHeightPx: 8268,
      requestedWidth: null,
      requestedHeight: null,
      sizeIntent: "print",
      providerLabel: "Gemini Nano Banana",
      matching: null,
    };
    const v2 = normalizeLegacyGenerationRequest(input);
    expect(v2).toEqual(input);
  });

  it("hydrates matching-collection context from a legacy payload", () => {
    const legacy = {
      kind: "matching_collection",
      styleKey: "botanical",
      mode: "botanical",
      prompt: "a fern",
      anchorImageUrl: "https://example.com/a.png",
      anchorImageId: "img-1",
      matchingCollectionId: "col-1",
      subject: "fern",
      rawSubject: "a fern",
      consistencyStrength: "strict",
      providerPreference: "gemini",
    };
    const v2 = normalizeLegacyGenerationRequest(legacy);
    expect(v2.kind).toBe("matching_collection");
    expect(v2.matching).not.toBeNull();
    expect(v2.matching?.anchorImageUrl).toBe("https://example.com/a.png");
    expect(v2.matching?.collectionId).toBe("col-1");
    expect(v2.matching?.consistencyStrength).toBe("strict");
    // Anchor URL is promoted into sourceImageUrl for downstream provider execution.
    expect(v2.sourceImageUrl).toBe("https://example.com/a.png");
  });

  it("never invents provider choices from unknown values", () => {
    const v2 = normalizeLegacyGenerationRequest({ providerPreference: "midjourney" });
    expect(v2.providerPreference).toBe("auto");
  });
});

describe("GenerationRequestV2 validator", () => {
  it("rejects non-object input", () => {
    const r = validateGenerationRequestV2(null);
    expect(r.ok).toBe(false);
  });
  it("rejects wrong version", () => {
    const v2 = normalizeLegacyGenerationRequest({});
    const r = validateGenerationRequestV2({ ...v2, version: 1 });
    expect(r.ok).toBe(false);
  });
  it("accepts a normalized legacy payload", () => {
    const v2 = normalizeLegacyGenerationRequest({ styleKey: "ukiyoe", prompt: "x" });
    const r = validateGenerationRequestV2(v2);
    expect(r.ok).toBe(true);
  });
  it("requires matching context for matching_collection kind", () => {
    const v2 = normalizeLegacyGenerationRequest({ kind: "matching_collection", prompt: "x" });
    const bad = { ...v2, matching: null };
    const r = validateGenerationRequestV2(bad);
    expect(r.ok).toBe(false);
  });
});

describe("Executable-provider gating", () => {
  it("gemini and sdxl are executable, openai is not", () => {
    expect(isDurablyExecutable("gemini")).toBe(true);
    expect(isDurablyExecutable("sdxl")).toBe(true);
    expect(isDurablyExecutable("openai")).toBe(false);
    expect(DURABLY_EXECUTABLE_PROVIDERS).toEqual(["gemini", "sdxl"]);
  });
  it("auto is always safe for durable dispatch", () => {
    expect(checkDurableExecutability("auto").ok).toBe(true);
  });
  it("openai is rejected with a suggestion", () => {
    const r = checkDurableExecutability("openai");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/OpenAI/);
    expect(r.suggestion).toBe("gemini");
  });
});

describe("Deno mirror parity", () => {
  // The Vitest process reads the Deno file as text; we assert that its
  // exported field-list literal matches the client's tuple exactly.
  it("field lists are byte-for-byte identical", () => {
    const denoFile = readFileSync(
      resolve(__dirname, "../../supabase/functions/_shared/generation-contract-v2.ts"),
      "utf8",
    );
    // Extract the fields array literal.
    const match = denoFile.match(
      /GENERATION_REQUEST_V2_FIELDS[^=]*=\s*\[([\s\S]*?)\]\s*as const;/,
    );
    expect(match, "Deno mirror missing GENERATION_REQUEST_V2_FIELDS export").toBeTruthy();
    const denoFields = (match![1]
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter((s) => s.length > 0));
    expect(denoFields).toEqual([...GENERATION_REQUEST_V2_FIELDS]);
  });

  it("version constants agree", () => {
    const denoFile = readFileSync(
      resolve(__dirname, "../../supabase/functions/_shared/generation-contract-v2.ts"),
      "utf8",
    );
    const m = denoFile.match(/GENERATION_REQUEST_VERSION\s*=\s*(\d+)\s+as const;/);
    expect(m).toBeTruthy();
    expect(parseInt(m![1], 10)).toBe(GENERATION_REQUEST_VERSION);
  });
});
