/**
 * Smoke tests for print-export canvas safety guards.
 *
 * These run on every build to prevent regressions where a future change
 * could allow allocating an oversized canvas that crashes the browser tab.
 */
import { describe, it, expect } from "vitest";
import {
  assertCanvasWithinLimits,
  MAX_CANVAS_DIMENSION,
  MAX_CANVAS_PIXELS,
} from "./print-export";

describe("print-export · assertCanvasWithinLimits", () => {
  it("accepts a normal A3-ish 300dpi canvas", () => {
    expect(() => assertCanvasWithinLimits(3508, 4961)).not.toThrow();
  });

  it("rejects zero / negative / non-finite dimensions", () => {
    expect(() => assertCanvasWithinLimits(0, 1000)).toThrow(/Invalid export dimensions/);
    expect(() => assertCanvasWithinLimits(1000, -1)).toThrow(/Invalid export dimensions/);
    expect(() => assertCanvasWithinLimits(NaN, 1000)).toThrow(/Invalid export dimensions/);
    expect(() => assertCanvasWithinLimits(1000, Infinity)).toThrow(/Invalid export dimensions/);
  });

  it("rejects dimensions above the per-axis browser cap", () => {
    expect(() => assertCanvasWithinLimits(MAX_CANVAS_DIMENSION + 1, 1000)).toThrow(
      /maximum canvas dimension/,
    );
    expect(() => assertCanvasWithinLimits(1000, MAX_CANVAS_DIMENSION + 1)).toThrow(
      /maximum canvas dimension/,
    );
  });

  it("rejects total pixel area above the ~200MP guard", () => {
    // Stay within the per-axis cap but exceed total pixel budget.
    const w = MAX_CANVAS_DIMENSION;
    const h = Math.ceil(MAX_CANVAS_PIXELS / w) + 1;
    expect(h).toBeLessThanOrEqual(MAX_CANVAS_DIMENSION);
    expect(() => assertCanvasWithinLimits(w, h)).toThrow(/too large for browser rendering/);
  });

  it("accepts a large area that stays under both caps", () => {
    const w = 12500;
    const h = Math.floor(MAX_CANVAS_PIXELS / w); // = 16000, < 16384
    expect(h).toBeLessThanOrEqual(MAX_CANVAS_DIMENSION);
    expect(() => assertCanvasWithinLimits(w, h)).not.toThrow();
  });
});
