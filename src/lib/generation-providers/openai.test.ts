/**
 * Tests for the Direct OpenAI adapter (gpt-image-2) — image-to-image
 * reference-strength wiring + exact poster sizing.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

type InvokeArgs = { name: string; body: Record<string, unknown> };
const invokeCalls: InvokeArgs[] = [];
let invokeResponse: { data: Record<string, unknown> | null; error: unknown } = {
  data: {
    imageUrl: "https://stub.local/result.png",
    model: "gpt-image-2",
    width: 1600,
    height: 2240,
    requestedWidth: 1600,
    requestedHeight: 2240,
    requestedSize: "1600x2240",
    apiRoute: "edits",
    providerExactMatch: true,
    providerAdjusted: false,
    sizeSource: "format-map",
  },
  error: null,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async (name: string, init: { body: Record<string, unknown> }) => {
        invokeCalls.push({ name, body: init.body });
        return invokeResponse;
      }),
    },
  },
}));

import { generateWithOpenAIAdapter } from "./openai";
import type { NormalizedGenerationRequest } from "@/lib/generation-types";

function baseRequest(
  overrides: Partial<NormalizedGenerationRequest> = {},
): NormalizedGenerationRequest {
  return {
    prompt: "A serene mountain lake",
    styleKey: "modern_minimalist",
    aspectRatio: "5:7",
    posterFormatId: "50x70",
    orientation: "portrait",
    sizeIntent: "print",
    printMode: true,
    ...overrides,
  } as NormalizedGenerationRequest;
}

beforeEach(() => {
  invokeCalls.length = 0;
});

describe("generateWithOpenAIAdapter — image-to-image", () => {
  it("forwards reference image, isEdit, and referenceStrength to the edge function", async () => {
    await generateWithOpenAIAdapter(
      baseRequest({
        referenceImageUrl: "https://example.com/ref.png",
        referenceStrength: "strong_reference",
        isEdit: true,
      }),
    );
    expect(invokeCalls).toHaveLength(1);
    const body = invokeCalls[0].body;
    expect(invokeCalls[0].name).toBe("generate-image-direct-openai");
    expect(body.sourceImageUrl).toBe("https://example.com/ref.png");
    expect(body.isEdit).toBe(true);
    expect(body.referenceStrength).toBe("strong_reference");
  });

  it("does NOT include reference fields for plain text-to-image", async () => {
    await generateWithOpenAIAdapter(baseRequest());
    const body = invokeCalls[0].body;
    expect(body.sourceImageUrl).toBeUndefined();
    expect(body.isEdit).toBeUndefined();
    expect(body.referenceStrength).toBeUndefined();
  });

  it("threads each reference-strength selection through to the request body", async () => {
    const strengths = [
      "inspiration",
      "balanced",
      "strong_reference",
      "near_original",
    ] as const;
    for (const s of strengths) {
      invokeCalls.length = 0;
      await generateWithOpenAIAdapter(
        baseRequest({
          referenceImageUrl: "https://example.com/ref.png",
          referenceStrength: s,
          isEdit: true,
        }),
      );
      expect(invokeCalls[0].body.referenceStrength).toBe(s);
    }
  });

  it("exposes the reference-strength in returned debug metadata", async () => {
    const res = await generateWithOpenAIAdapter(
      baseRequest({
        referenceImageUrl: "https://example.com/ref.png",
        referenceStrength: "inspiration",
        isEdit: true,
      }),
    );
    expect(res.metadata?.isEdit).toBe(true);
    expect(res.metadata?.referenceStrength).toBe("inspiration");
    expect(res.metadata?.apiRoute).toBe("edits");
  });
});

describe("generateWithOpenAIAdapter — exact gpt-image-2 poster sizing", () => {
  const cases: Array<{
    formatId: string;
    orientation: "portrait" | "landscape";
    expected: string;
  }> = [
    { formatId: "50x70", orientation: "portrait", expected: "1600x2240" },
    { formatId: "50x70", orientation: "landscape", expected: "2240x1600" },
    { formatId: "a4", orientation: "portrait", expected: "1120x1584" },
    { formatId: "a4", orientation: "landscape", expected: "1584x1120" },
    { formatId: "a3", orientation: "portrait", expected: "1584x2240" },
    { formatId: "a3", orientation: "landscape", expected: "2240x1584" },
    { formatId: "a2", orientation: "portrait", expected: "2240x3168" },
    { formatId: "a2", orientation: "landscape", expected: "3168x2240" },
  ];

  for (const c of cases) {
    it(`maps ${c.formatId} ${c.orientation} → ${c.expected}`, async () => {
      await generateWithOpenAIAdapter(
        baseRequest({
          posterFormatId: c.formatId,
          orientation: c.orientation,
          referenceImageUrl: "https://example.com/ref.png",
          referenceStrength: "balanced",
          isEdit: true,
        }),
      );
      const body = invokeCalls[0].body;
      expect(body.requestedSize).toBe(c.expected);
      expect(body.posterFormatId).toBe(c.formatId);
    });
  }

  it("never sends legacy OpenAI sizes (1024x1024 / 1024x1536) for mapped formats", async () => {
    for (const c of cases) {
      invokeCalls.length = 0;
      await generateWithOpenAIAdapter(
        baseRequest({ posterFormatId: c.formatId, orientation: c.orientation }),
      );
      const size = invokeCalls[0].body.requestedSize as string;
      expect(size).not.toBe("1024x1024");
      expect(size).not.toBe("1024x1536");
      expect(size).not.toBe("1536x1024");
      expect(size).not.toBe("auto");
    }
  });
});
