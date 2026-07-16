import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DURABLE_RESULT_METADATA_FIELDS,
  DURABLE_RESULT_METADATA_VERSION,
  isDurableResultMetadataV1,
  reconstructNormalizedResponse,
  type DurableResultMetadataV1,
} from "./durable-result-metadata";

/**
 * Load the Deno mirror as text and extract its FIELDS array so we can
 * assert parity without cross-importing Deno files into vitest.
 */
function loadServerFields(): string[] {
  const src = readFileSync(
    resolve(__dirname, "../../supabase/functions/_shared/durable-result-metadata.ts"),
    "utf-8",
  );
  const match = src.match(
    /DURABLE_RESULT_METADATA_FIELDS[^\[]*\[([\s\S]*?)\]\s*as const/,
  );
  if (!match) throw new Error("Could not locate FIELDS in server mirror");
  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((m) => m[1]);
}

describe("durable-result-metadata contract", () => {
  it("client and server field lists are identical (parity)", () => {
    const server = loadServerFields();
    expect(server).toEqual([...DURABLE_RESULT_METADATA_FIELDS]);
  });

  it("server version constant matches client", () => {
    const src = readFileSync(
      resolve(__dirname, "../../supabase/functions/_shared/durable-result-metadata.ts"),
      "utf-8",
    );
    expect(src).toMatch(
      new RegExp(`DURABLE_RESULT_METADATA_VERSION\\s*=\\s*${DURABLE_RESULT_METADATA_VERSION}`),
    );
  });

  it("isDurableResultMetadataV1 accepts a well-formed payload", () => {
    const meta: DurableResultMetadataV1 = {
      version: 1,
      generationProvider: "gemini",
      generationModel: "google/gemini-3-pro-image-preview",
      executionRoute: "lovable_gateway",
      providerStrategy: "auto",
      fallbackUsed: false,
    };
    expect(isDurableResultMetadataV1(meta)).toBe(true);
  });

  it("isDurableResultMetadataV1 rejects malformed payloads", () => {
    expect(isDurableResultMetadataV1(null)).toBe(false);
    expect(isDurableResultMetadataV1({})).toBe(false);
    expect(
      isDurableResultMetadataV1({
        version: 1,
        generationProvider: "gemini",
        generationModel: "x",
        executionRoute: "lovable_gateway",
        providerStrategy: "invalid",
        fallbackUsed: false,
      }),
    ).toBe(false);
  });

  it("reconstructNormalizedResponse rebuilds a representative response", () => {
    const meta: DurableResultMetadataV1 = {
      version: 1,
      generationProvider: "sdxl",
      generationModel: "stability-ai/sdxl",
      executionRoute: "replicate_direct",
      providerStrategy: "manual",
      fallbackUsed: false,
      attempted: [{ providerId: "sdxl", ok: true }],
      actualWidthPx: 1024,
      actualHeightPx: 1024,
      requestedWidth: 1024,
      requestedHeight: 1024,
      requestedAspectRatio: "1:1",
      providerExactMatch: true,
      providerAdjusted: false,
      printFormatId: "square_50x50",
      aspectRatio: "1:1",
      sizeIntent: "print",
      storagePath: "sdxl-123.png",
      galleryImageId: "gal-1",
      bytes: 100_000,
      attemptCount: 1,
    };
    const res = reconstructNormalizedResponse(
      "https://example.com/img.png",
      "a cat",
      "minimalism",
      meta,
    );
    expect(res.imageUrl).toBe("https://example.com/img.png");
    expect(res.generationProvider).toBe("sdxl");
    expect(res.strategy).toBe("manual");
    expect(res.width).toBe(1024);
    expect(res.providerExactMatch).toBe(true);
    expect(res.executionRoute).toBe("replicate_direct");
    expect((res.metadata as Record<string, unknown>).storagePath).toBe(
      "sdxl-123.png",
    );
    expect((res.metadata as Record<string, unknown>).galleryImageId).toBe(
      "gal-1",
    );
  });
});
