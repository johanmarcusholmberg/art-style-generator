import { describe, it, expect } from "vitest";
import { assessFormatReadiness } from "./ratio-readiness";

const OK_MASTER = {
  correctedMasterStoragePath: "gen/x.png",
  correctedMasterWidth: 2400,
  correctedMasterHeight: 3360,
};
const OK_SOURCE = {
  sourceStoragePath: "gen/src.png",
  sourceWidth: 1200,
  sourceHeight: 1680,
};

describe("assessFormatReadiness (strict)", () => {
  it("pending / processing / failed / unknown are not ready", () => {
    expect(assessFormatReadiness("pending").isFormatReady).toBe(false);
    expect(assessFormatReadiness("processing").isFormatReady).toBe(false);
    expect(assessFormatReadiness("failed").isFormatReady).toBe(false);
    expect(assessFormatReadiness(null).isFormatReady).toBe(false);
    expect(assessFormatReadiness(undefined).isFormatReady).toBe(false);
    expect(assessFormatReadiness("weird").isFormatReady).toBe(false);
  });

  it("completed WITHOUT explicit master identity is NOT ready", () => {
    const r = assessFormatReadiness("completed");
    expect(r.isFormatReady).toBe(false);
    expect(r.reason).toBe("completed-missing-master");
  });

  it("completed WITH master identity is ready", () => {
    const r = assessFormatReadiness("completed", OK_MASTER);
    expect(r.isFormatReady).toBe(true);
    expect(r.reason).toBe("completed");
  });

  it("completed with zero/neg dims is NOT ready", () => {
    const r = assessFormatReadiness("completed", { ...OK_MASTER, correctedMasterWidth: 0 });
    expect(r.isFormatReady).toBe(false);
    expect(r.reason).toBe("completed-missing-master");
  });

  it("not_required requires persisted source AND verified match", () => {
    // No source persisted at all.
    expect(assessFormatReadiness("not_required").reason).toBe("not_required-missing-source");
    // Source but no verification.
    expect(assessFormatReadiness("not_required", OK_SOURCE).reason).toBe("not_required-mismatch");
    // Source + verified.
    const r = assessFormatReadiness("not_required", { ...OK_SOURCE, ratioMatchesFormat: true });
    expect(r.isFormatReady).toBe(true);
    expect(r.reason).toBe("not_required-match");
  });
});
