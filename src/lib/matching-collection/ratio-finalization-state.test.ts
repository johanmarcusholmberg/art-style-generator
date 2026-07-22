import { describe, it, expect } from "vitest";
import {
  canTransitionRatioState,
  isRatioFinalizationPrintEligible,
  isRatioFinalizationTerminal,
  RATIO_FINALIZATION_STATES,
  type RatioFinalizationState,
} from "./ratio-finalization-state";

describe("ratio finalization terminal + print eligibility", () => {
  it("terminal set is {not_required, completed, failed}", () => {
    expect(RATIO_FINALIZATION_STATES.filter(isRatioFinalizationTerminal).sort()).toEqual(
      ["completed", "failed", "not_required"],
    );
  });
  it("completed → print eligible", () => {
    expect(isRatioFinalizationPrintEligible("completed")).toBe(true);
  });
  it("not_required → eligible only when asset already matches ratio", () => {
    expect(isRatioFinalizationPrintEligible("not_required")).toBe(false);
    expect(
      isRatioFinalizationPrintEligible("not_required", { assetMatchesRequiredRatio: true }),
    ).toBe(true);
  });
  it("pending / processing / failed → not print eligible", () => {
    for (const s of ["pending", "processing", "failed"] as RatioFinalizationState[]) {
      expect(isRatioFinalizationPrintEligible(s)).toBe(false);
    }
  });
});

describe("ratio-finalization transition matrix", () => {
  const allowed = new Set<string>([
    "not_required->not_required",
    "pending->pending",
    "pending->processing",
    "pending->failed",
    "processing->processing",
    "processing->completed",
    "processing->failed",
    "failed->failed",
    "failed->pending",
    "completed->completed",
  ]);
  for (const from of RATIO_FINALIZATION_STATES) {
    for (const to of RATIO_FINALIZATION_STATES) {
      const key = `${from}->${to}`;
      it(key, () => {
        expect(canTransitionRatioState(from, to)).toBe(allowed.has(key));
      });
    }
  }

  it("direct pending → completed is disallowed", () => {
    expect(canTransitionRatioState("pending", "completed")).toBe(false);
  });
  it("failed → pending only via explicit retry (allowed here)", () => {
    expect(canTransitionRatioState("failed", "pending")).toBe(true);
    expect(canTransitionRatioState("completed", "pending")).toBe(false);
    expect(canTransitionRatioState("not_required", "pending")).toBe(false);
  });
});
