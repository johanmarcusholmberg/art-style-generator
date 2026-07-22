import { describe, expect, it } from "vitest";
import {
  buildRatioFinalizedStoragePath,
  RATIO_FINALIZED_PREFIX,
} from "./storage-path";

const base = {
  galleryImageId: "gal-1",
  itemId: "itm-1",
  posterFormatId: "print_50x70",
  algorithmVersion: "v1",
  extension: "png",
};

describe("buildRatioFinalizedStoragePath", () => {
  it("is deterministic — same input → same path", () => {
    expect(buildRatioFinalizedStoragePath(base)).toBe(buildRatioFinalizedStoragePath(base));
  });
  it("path is prefixed under ratio-finalized/", () => {
    expect(buildRatioFinalizedStoragePath(base).startsWith(`${RATIO_FINALIZED_PREFIX}/`)).toBe(true);
  });
  it("differs when gallery image changes", () => {
    expect(buildRatioFinalizedStoragePath({ ...base, galleryImageId: "gal-2" }))
      .not.toBe(buildRatioFinalizedStoragePath(base));
  });
  it("differs when item changes", () => {
    expect(buildRatioFinalizedStoragePath({ ...base, itemId: "itm-2" }))
      .not.toBe(buildRatioFinalizedStoragePath(base));
  });
  it("differs when format changes", () => {
    expect(buildRatioFinalizedStoragePath({ ...base, posterFormatId: "print_30x40" }))
      .not.toBe(buildRatioFinalizedStoragePath(base));
  });
  it("differs when algorithm version changes", () => {
    expect(buildRatioFinalizedStoragePath({ ...base, algorithmVersion: "v2" }))
      .not.toBe(buildRatioFinalizedStoragePath(base));
  });
  it("sanitizes unsafe format characters", () => {
    const path = buildRatioFinalizedStoragePath({ ...base, posterFormatId: "../weird/id?!" });
    expect(path).not.toContain("..");
    expect(path).not.toContain("?");
    expect(path).not.toContain(" ");
  });
  it("handles missing format id gracefully", () => {
    const path = buildRatioFinalizedStoragePath({ ...base, posterFormatId: null });
    expect(path).toContain("/no-format/");
  });
  it("has no timestamp / randomness — two calls are byte-identical", () => {
    const a = buildRatioFinalizedStoragePath(base);
    const b = buildRatioFinalizedStoragePath(base);
    expect(a).toBe(b);
    expect(a).not.toMatch(/\d{13}/); // 13-digit ms timestamp
  });
  it("would never equal a caller-provided base path (fixed prefix)", () => {
    const naiveBase = "generated/original.png";
    expect(buildRatioFinalizedStoragePath(base)).not.toBe(naiveBase);
  });
  it("rejects empty gallery / item ids", () => {
    expect(() => buildRatioFinalizedStoragePath({ ...base, galleryImageId: "" })).toThrow();
    expect(() => buildRatioFinalizedStoragePath({ ...base, itemId: "   " })).toThrow();
  });
});
