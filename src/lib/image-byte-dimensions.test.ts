import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decodeImageDimensions,
  isValidPixelDimension,
} from "./image-byte-dimensions";
import {
  findMetadataDefects,
  isMetadataComplete,
  assertMetadataComplete,
  canonicalAspectRatio,
  isPrintReadyGeneration,
  printFormatRatioDecimal,
  MetadataIncompleteError,
} from "./generation-metadata-invariant";
import {
  needsMetadataRepair,
  repairedAspectRatio,
} from "./image-metadata-repair";

function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  b.set([(w >> 24) & 255, (w >> 16) & 255, (w >> 8) & 255, w & 255], 16);
  b.set([(h >> 24) & 255, (h >> 16) & 255, (h >> 8) & 255, h & 255], 20);
  return b;
}

function jpeg(w: number, h: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0xff, 0xd8], 0);
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08], 2); // SOF0, len 17, precision 8
  b.set([(h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255], 7);
  return b;
}

function webpVp8x(w: number, h: number): Uint8Array {
  const b = new Uint8Array(32);
  const put = (s: string, o: number) => {
    for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i);
  };
  put("RIFF", 0);
  put("WEBP", 8);
  put("VP8X", 12);
  const wm = w - 1, hm = h - 1;
  b.set([wm & 255, (wm >> 8) & 255, (wm >> 16) & 255], 24);
  b.set([hm & 255, (hm >> 8) & 255, (hm >> 16) & 255], 27);
  return b;
}

describe("decodeImageDimensions", () => {
  it("reads PNG dimensions from the IHDR chunk", () => {
    expect(decodeImageDimensions(png(1344, 1888))).toEqual({
      width: 1344,
      height: 1888,
      format: "png",
    });
  });

  it("reads JPEG dimensions from the SOF0 marker", () => {
    expect(decodeImageDimensions(jpeg(1600, 2240))).toEqual({
      width: 1600,
      height: 2240,
      format: "jpeg",
    });
  });

  it("reads WebP VP8X dimensions", () => {
    expect(decodeImageDimensions(webpVp8x(2048, 2048))).toEqual({
      width: 2048,
      height: 2048,
      format: "webp",
    });
  });

  it("reads GIF dimensions", () => {
    const b = new Uint8Array(16);
    "GIF89a".split("").forEach((c, i) => (b[i] = c.charCodeAt(0)));
    b[6] = 0x20; b[7] = 0x03; // 800
    b[8] = 0x58; b[9] = 0x02; // 600
    expect(decodeImageDimensions(b)).toEqual({ width: 800, height: 600, format: "gif" });
  });

  it("returns null for unsupported / truncated bytes", () => {
    expect(decodeImageDimensions(new Uint8Array(4))).toBeNull();
    expect(decodeImageDimensions(new Uint8Array(64))).toBeNull();
  });

  it("guards pixel dimensions", () => {
    expect(isValidPixelDimension(1024)).toBe(true);
    expect(isValidPixelDimension(0)).toBe(false);
    expect(isValidPixelDimension(-5)).toBe(false);
    expect(isValidPixelDimension(10.5)).toBe(false);
    expect(isValidPixelDimension(null)).toBe(false);
    expect(isValidPixelDimension(undefined)).toBe(false);
  });
});

describe("metadata completeness invariant", () => {
  const complete = {
    widthPx: 1344,
    heightPx: 1888,
    printFormatId: "print_50x70",
    aspectRatio: "5:7",
    generationMode: "print-ready",
  };

  it("accepts a complete print-ready candidate", () => {
    expect(findMetadataDefects(complete)).toEqual([]);
    expect(isMetadataComplete(complete)).toBe(true);
    expect(() => assertMetadataComplete(complete)).not.toThrow();
  });

  it("rejects a Gemini result with missing dimensions", () => {
    const defects = findMetadataDefects({ ...complete, widthPx: null, heightPx: null });
    expect(defects).toContain("missing_dimensions");
    expect(() =>
      assertMetadataComplete({ ...complete, widthPx: null, heightPx: null }),
    ).toThrow(MetadataIncompleteError);
  });

  it("rejects a print-ready generation with no print format", () => {
    expect(findMetadataDefects({ ...complete, printFormatId: null })).toContain(
      "missing_print_format",
    );
  });

  it("allows non-print generations without a print format", () => {
    expect(
      findMetadataDefects({ ...complete, printFormatId: null, generationMode: "standard" }),
    ).toEqual([]);
  });

  it("rejects a missing aspect ratio", () => {
    expect(findMetadataDefects({ ...complete, aspectRatio: null })).toContain(
      "missing_aspect_ratio",
    );
  });

  it("derives the canonical aspect ratio from the print format, not the caller", () => {
    expect(canonicalAspectRatio("print_50x70", "16:9")).toBe("5:7");
    expect(canonicalAspectRatio("print_50x50", null)).toBe("1:1");
    expect(canonicalAspectRatio(null, "4:5")).toBe("4:5");
    expect(canonicalAspectRatio(null, null)).toBeNull();
  });

  it("recognises print-ready modes", () => {
    expect(isPrintReadyGeneration("print-ready")).toBe(true);
    expect(isPrintReadyGeneration("print_ready")).toBe(true);
    expect(isPrintReadyGeneration("standard")).toBe(false);
    expect(isPrintReadyGeneration(null)).toBe(false);
  });

  it("exposes format ratio decimals for ratio-mismatch detection", () => {
    expect(printFormatRatioDecimal("print_50x70")).toBeCloseTo(50 / 70, 6);
    expect(printFormatRatioDecimal("nope")).toBeNull();
    expect(printFormatRatioDecimal(null)).toBeNull();
  });
});

describe("self-heal helpers", () => {
  it("flags rows missing dimensions", () => {
    expect(needsMetadataRepair({ id: "a", actual_width_px: null, actual_height_px: null })).toBe(true);
    expect(needsMetadataRepair({ id: "a", actual_width_px: 100, actual_height_px: null })).toBe(true);
    expect(needsMetadataRepair({ id: "a", actual_width_px: 100, actual_height_px: 100 })).toBe(false);
  });

  it("repairs the aspect ratio from the print format", () => {
    expect(
      repairedAspectRatio({ id: "a", print_format_id: "print_30x40", aspect_ratio: "1:1" }),
    ).toBe("3:4");
  });
});

describe("Deno mirror parity", () => {
  const serverDir = resolve(__dirname, "../../supabase/functions/_shared");

  it("image dimension decoder mirrors the client implementation", () => {
    const client = readFileSync(resolve(__dirname, "image-byte-dimensions.ts"), "utf-8");
    const server = readFileSync(resolve(serverDir, "image-dimensions.ts"), "utf-8");
    const body = (src: string) =>
      src
        .slice(src.indexOf("export function decodeImageDimensions"))
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\s+/g, " ")
        .trim();
    expect(body(server)).toBe(body(client));

  });

  it("invariant mirror exposes the same API surface", () => {
    const server = readFileSync(resolve(serverDir, "generation-metadata-invariant.ts"), "utf-8");
    for (const name of [
      "findMetadataDefects",
      "isMetadataComplete",
      "assertMetadataComplete",
      "canonicalAspectRatio",
      "isPrintReadyGeneration",
      "printFormatRatioDecimal",
      "MetadataIncompleteError",
    ]) {
      expect(server).toContain(name);
    }
  });

  it("server persistence measures bytes and enforces the invariant", () => {
    const persist = readFileSync(resolve(serverDir, "persist-generation-result.ts"), "utf-8");
    expect(persist).toContain("decodeImageDimensions(bytes)");
    expect(persist).toContain("assertMetadataComplete");
    expect(persist).toContain("generated_image_assets");
    expect(persist).toContain("measuredWidthPx");
  });
});
