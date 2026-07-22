import { describe, it, expect } from "vitest";
import { assessRatioReadiness } from "./ratio-readiness";

describe("assessRatioReadiness", () => {
  it("pending is not print ready", () => {
    const r = assessRatioReadiness("pending");
    expect(r.isPrintReady).toBe(false);
    expect(r.label).toMatch(/Preparing/);
  });
  it("processing is not print ready", () => {
    expect(assessRatioReadiness("processing").isPrintReady).toBe(false);
  });
  it("failed is not print ready", () => {
    const r = assessRatioReadiness("failed");
    expect(r.isPrintReady).toBe(false);
    expect(r.tone).toBe("danger");
  });
  it("unknown legacy value is not validated", () => {
    expect(assessRatioReadiness(null).isPrintReady).toBe(false);
    expect(assessRatioReadiness(undefined).isPrintReady).toBe(false);
    expect(assessRatioReadiness("weird").isPrintReady).toBe(false);
  });
  it("completed is print ready", () => {
    expect(assessRatioReadiness("completed").isPrintReady).toBe(true);
  });
  it("not_required requires verified ratio match", () => {
    expect(assessRatioReadiness("not_required").isPrintReady).toBe(false);
    expect(
      assessRatioReadiness("not_required", { ratioMatchesFormat: true }).isPrintReady,
    ).toBe(true);
  });
});
