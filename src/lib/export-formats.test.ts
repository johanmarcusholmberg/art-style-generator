/**
 * Unit tests for the multi-format export module.
 *
 * Browser-canvas operations (jsPDF, canvas.toBlob) can't run in jsdom,
 * so these tests focus on the pure helpers: filename construction,
 * MIME / extension mapping, default persistence, and format guards.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_EXPORT_FORMAT,
  EXPORT_FORMATS,
  EXPORT_FORMAT_META,
  buildExportFilename,
  getExportFormatMeta,
  getStoredExportFormat,
  isExportFormat,
  setStoredExportFormat,
  type ExportFormat,
} from "./export-formats";
import { DEFAULT_BLEED_MM } from "./bleed-config";

describe("export-formats · defaults & metadata", () => {
  it("exposes png/jpeg/pdf with correct MIME and extension", () => {
    expect(EXPORT_FORMATS).toEqual(["png", "jpeg", "pdf"]);
    expect(EXPORT_FORMAT_META.png.mimeType).toBe("image/png");
    expect(EXPORT_FORMAT_META.png.extension).toBe("png");
    expect(EXPORT_FORMAT_META.jpeg.mimeType).toBe("image/jpeg");
    expect(EXPORT_FORMAT_META.jpeg.extension).toBe("jpg");
    expect(EXPORT_FORMAT_META.pdf.mimeType).toBe("application/pdf");
    expect(EXPORT_FORMAT_META.pdf.extension).toBe("pdf");
  });

  it("uses lossless quality for PNG and 0.95 for JPEG/PDF", () => {
    expect(EXPORT_FORMAT_META.png.quality).toBe(1.0);
    expect(EXPORT_FORMAT_META.jpeg.quality).toBe(0.95);
    expect(EXPORT_FORMAT_META.pdf.quality).toBe(0.95);
  });

  it("defaults to PNG", () => {
    expect(DEFAULT_EXPORT_FORMAT).toBe("png");
  });

  it("getExportFormatMeta returns the same record", () => {
    for (const f of EXPORT_FORMATS) {
      expect(getExportFormatMeta(f)).toBe(EXPORT_FORMAT_META[f]);
    }
  });
});

describe("export-formats · isExportFormat", () => {
  it("accepts known values, rejects everything else", () => {
    expect(isExportFormat("png")).toBe(true);
    expect(isExportFormat("jpeg")).toBe(true);
    expect(isExportFormat("pdf")).toBe(true);
    expect(isExportFormat("webp")).toBe(false);
    expect(isExportFormat("jpg")).toBe(false);
    expect(isExportFormat(null)).toBe(false);
    expect(isExportFormat(undefined)).toBe(false);
    expect(isExportFormat(42)).toBe(false);
  });
});

describe("export-formats · buildExportFilename", () => {
  const suffix = `_bleed${DEFAULT_BLEED_MM}mm`;

  it("appends bleed suffix + format extension when missing", () => {
    expect(buildExportFilename("malaga-rooftop_50x70", "png")).toBe(
      `malaga-rooftop_50x70${suffix}.png`,
    );
    expect(buildExportFilename("malaga-rooftop_50x70", "jpeg")).toBe(
      `malaga-rooftop_50x70${suffix}.jpg`,
    );
    expect(buildExportFilename("malaga-rooftop_50x70", "pdf")).toBe(
      `malaga-rooftop_50x70${suffix}.pdf`,
    );
  });

  it("strips a pre-existing extension and rewrites it to the format", () => {
    expect(buildExportFilename("art.png", "jpeg")).toBe(`art${suffix}.jpg`);
    expect(buildExportFilename("art.jpg", "pdf")).toBe(`art${suffix}.pdf`);
    expect(buildExportFilename("art.pdf", "png")).toBe(`art${suffix}.png`);
  });

  it("is idempotent — does not double-append the bleed suffix", () => {
    const once = buildExportFilename("art", "png");
    const twice = buildExportFilename(once, "png");
    expect(twice).toBe(once);
  });

  it("preserves an existing bleed suffix when switching formats", () => {
    expect(buildExportFilename("art_bleed3mm.png", "pdf")).toBe("art_bleed3mm.pdf");
  });

  it("honours a custom bleed value", () => {
    expect(buildExportFilename("art", "jpeg", 5)).toBe("art_bleed5mm.jpg");
  });
});

describe("export-formats · localStorage persistence", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") window.localStorage.clear();
  });

  it("returns the default when nothing is stored", () => {
    expect(getStoredExportFormat()).toBe(DEFAULT_EXPORT_FORMAT);
  });

  it("round-trips each format", () => {
    for (const f of EXPORT_FORMATS) {
      setStoredExportFormat(f as ExportFormat);
      expect(getStoredExportFormat()).toBe(f);
    }
  });

  it("ignores garbage stored values and returns the default", () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("lovable.exportFormat.v1", "tiff");
    expect(getStoredExportFormat()).toBe(DEFAULT_EXPORT_FORMAT);
  });
});
