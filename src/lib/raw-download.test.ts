/**
 * Tests for the raw / "Original" download helper.
 *
 * Canvas rendering itself is not exercised here — jsdom does not provide
 * a working 2D context. Instead we lock down the pure pieces (filename
 * suffixing) and the print-format delegation path that wraps
 * `preparePrintExport` so its bleed metadata is returned verbatim.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/print-export", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/print-export")>("@/lib/print-export");
  return {
    ...actual,
    // Stubbed below per-test.
    preparePrintExport: vi.fn(),
    loadImageForExport: vi.fn(),
  };
});

import { renderRawWithBleed, withBleedSuffix } from "./raw-download";
import { preparePrintExport } from "@/lib/print-export";
import { DEFAULT_BLEED_MM } from "@/lib/bleed-config";

const mockedPreparePrintExport = preparePrintExport as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedPreparePrintExport.mockReset();
});

describe("raw-download · withBleedSuffix", () => {
  it("appends the standard suffix to a bare name", () => {
    expect(withBleedSuffix("art.png")).toBe(`art_bleed${DEFAULT_BLEED_MM}mm.png`);
  });

  it("respects a custom bleed value", () => {
    expect(withBleedSuffix("art.jpg", 5)).toBe("art_bleed5mm.jpg");
  });

  it("handles names with no extension", () => {
    expect(withBleedSuffix("art")).toBe(`art_bleed${DEFAULT_BLEED_MM}mm`);
  });

  it("preserves uppercase extensions", () => {
    expect(withBleedSuffix("ART.PNG")).toBe(`ART_bleed${DEFAULT_BLEED_MM}mm.PNG`);
  });
});

describe("raw-download · renderRawWithBleed (print-format path)", () => {
  it("delegates to preparePrintExport and returns its bleed metadata", async () => {
    const fakeBlob = new Blob(["x"], { type: "image/png" });
    mockedPreparePrintExport.mockResolvedValueOnce({
      blob: fakeBlob,
      width: 5976,
      height: 8338,
      trimWidth: 5906,
      trimHeight: 8268,
      exportWidth: 5976,
      exportHeight: 8338,
      bleedMm: 3,
      safeMm: 10,
      bleedPx: 35,
      dpi: 300,
      tier: "preferred",
      upscaleApplied: false,
      upscaleFactor: 1,
      normalization: {} as never,
      printFormatId: "print_50x70",
    });

    const result = await renderRawWithBleed("https://example.com/img.png", {
      printFormatId: "print_50x70",
      exportFormat: "png",
    });

    expect(mockedPreparePrintExport).toHaveBeenCalledTimes(1);
    const args = mockedPreparePrintExport.mock.calls[0][0];
    expect(args).toMatchObject({
      imageUrl: "https://example.com/img.png",
      printFormatId: "print_50x70",
      exportFormat: "png",
    });

    expect(result.blob).toBe(fakeBlob);
    expect(result.bleedMm).toBe(3);
    expect(result.bleedPx).toBe(35);
    expect(result.trimWidth).toBe(5906);
    expect(result.exportWidth).toBe(5976);
    expect(result.format).toBe("png");
  });

  it("forwards custom bleed and safe overrides", async () => {
    mockedPreparePrintExport.mockResolvedValueOnce({
      blob: new Blob(),
      width: 0, height: 0, trimWidth: 0, trimHeight: 0,
      exportWidth: 0, exportHeight: 0,
      bleedMm: 5, safeMm: 12, bleedPx: 0, dpi: 300,
      tier: "preferred", upscaleApplied: false, upscaleFactor: 1,
      normalization: {} as never, printFormatId: "print_50x70",
    });

    await renderRawWithBleed("u", {
      printFormatId: "print_50x70",
      bleedMm: 5,
      safeMm: 12,
      exportFormat: "jpeg",
    });

    expect(mockedPreparePrintExport).toHaveBeenCalledWith(
      expect.objectContaining({ bleedMm: 5, safeMm: 12, exportFormat: "jpeg" }),
    );
  });

  it("rejects when no image URL is provided", async () => {
    await expect(renderRawWithBleed("", { printFormatId: "print_50x70" })).rejects.toThrow(
      /No image URL/,
    );
    expect(mockedPreparePrintExport).not.toHaveBeenCalled();
  });
});
