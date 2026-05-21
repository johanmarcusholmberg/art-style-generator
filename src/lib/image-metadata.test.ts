/**
 * Smoke tests for image-metadata fallback behaviour used by the gallery
 * dimension probe in saveToGallery / replaceInGallery.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { classifyPrintReadiness, loadImageDimensions } from "./image-metadata";

describe("image-metadata · classifyPrintReadiness", () => {
  it("returns 'unknown' when dimensions are missing/null", () => {
    expect(classifyPrintReadiness(null, null)).toBe("unknown");
    expect(classifyPrintReadiness(undefined, undefined)).toBe("unknown");
    expect(classifyPrintReadiness(0, 1000)).toBe("unknown");
    expect(classifyPrintReadiness(1000, 0)).toBe("unknown");
  });

  it("returns a defined status when dimensions are present", () => {
    const status = classifyPrintReadiness(4000, 5600, "print_50x70");
    expect(status).toBeTypeOf("string");
    expect(status).not.toBe("unknown");
  });
});

describe("image-metadata · loadImageDimensions", () => {
  type ImageLike = {
    crossOrigin: string;
    onload: (() => void) | null;
    onerror: (() => void) | null;
    src: string;
    naturalWidth: number;
    naturalHeight: number;
  };

  let lastImage: ImageLike | null = null;
  const RealImage = globalThis.Image;

  beforeEach(() => {
    lastImage = null;
    // Replace global Image with a controllable stub so onload/onerror fire
    // synchronously after `src` is assigned.
    (globalThis as unknown as { Image: unknown }).Image = class {
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;
      private _src = "";
      get src() { return this._src; }
      set src(v: string) {
        this._src = v;
        lastImage = this as unknown as ImageLike;
      }
    } as unknown as typeof Image;
  });

  afterEach(() => {
    (globalThis as unknown as { Image: typeof Image }).Image = RealImage;
  });

  it("resolves with natural dimensions on load", async () => {
    const p = loadImageDimensions("https://example.com/x.png");
    // Flush microtask so the Image instance has been constructed.
    await Promise.resolve();
    expect(lastImage).not.toBeNull();
    lastImage!.naturalWidth = 1234;
    lastImage!.naturalHeight = 5678;
    lastImage!.onload?.();
    await expect(p).resolves.toEqual({ width: 1234, height: 5678 });
  });

  it("rejects with a descriptive error on failure", async () => {
    const p = loadImageDimensions("https://example.com/missing.png");
    await Promise.resolve();
    lastImage!.onerror?.();
    await expect(p).rejects.toThrow(/Failed to load image dimensions/);
  });

  it("requests anonymous CORS so storage public URLs probe cleanly", async () => {
    const p = loadImageDimensions("https://example.com/y.png");
    await Promise.resolve();
    expect(lastImage!.crossOrigin).toBe("anonymous");
    lastImage!.naturalWidth = 10;
    lastImage!.naturalHeight = 10;
    lastImage!.onload?.();
    await p;
  });
});
