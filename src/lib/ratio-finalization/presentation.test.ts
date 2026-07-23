import { describe, it, expect } from "vitest";
import {
  deriveDurableResultPresentation,
  shouldEnqueueRatioFinalization,
} from "./presentation";

describe("deriveDurableResultPresentation", () => {
  it("idle for null snapshot", () => {
    expect(deriveDurableResultPresentation(null).phase).toBe("idle");
  });
  it("generating while active", () => {
    for (const status of ["queued", "dispatching", "processing"]) {
      expect(deriveDurableResultPresentation({ status, ratioStatus: null }).phase).toBe(
        "generating",
      );
    }
  });
  it("generation_failed exposes retry + message", () => {
    const r = deriveDurableResultPresentation({
      status: "failed", ratioStatus: null, errorMessage: "boom",
    });
    expect(r.phase).toBe("generation_failed");
    expect(r.canRetryGeneration).toBe(true);
    expect(r.errorMessage).toBe("boom");
  });
  it("completed + pending ratio → format_processing", () => {
    const r = deriveDurableResultPresentation({ status: "completed", ratioStatus: "pending" });
    expect(r.phase).toBe("format_processing");
    expect(r.showFinalizingSpinner).toBe(true);
  });
  it("completed + failed ratio → format_failed with retry", () => {
    const r = deriveDurableResultPresentation({
      status: "completed", ratioStatus: "failed", errorMessage: "bad",
    });
    expect(r.phase).toBe("format_failed");
    expect(r.canRetryFormat).toBe(true);
  });
  it("completed + completed ratio without master → unverified", () => {
    const r = deriveDurableResultPresentation({
      status: "completed", ratioStatus: "completed",
      imageUrl: "https://ex/img.png",
    });
    expect(r.phase).toBe("format_unverified");
    expect(r.hasReadyImage).toBe(false);
  });
  it("completed + completed ratio with master → format_ready_corrected", () => {
    const r = deriveDurableResultPresentation({
      status: "completed", ratioStatus: "completed",
      correctedMasterStoragePath: "gen/x.png",
      correctedMasterWidth: 2400, correctedMasterHeight: 3360,
      imageUrl: "https://ex/x.png",
    });
    expect(r.phase).toBe("format_ready_corrected");
    expect(r.hasReadyImage).toBe(true);
    expect(r.width).toBe(2400);
  });
  it("not_required requires match + persisted source", () => {
    expect(
      deriveDurableResultPresentation({
        status: "completed", ratioStatus: "not_required",
        storagePath: "gen/x.png", imageUrl: "u",
      }).phase,
    ).toBe("format_unverified");
    expect(
      deriveDurableResultPresentation({
        status: "completed", ratioStatus: "not_required",
        storagePath: "gen/x.png", imageUrl: "u", ratioMatchesFormat: true,
      }).phase,
    ).toBe("format_ready_not_required");
  });
});

describe("shouldEnqueueRatioFinalization", () => {
  const NOW = 1_700_000_000_000;
  it("only for completed items", () => {
    expect(shouldEnqueueRatioFinalization({
      itemStatus: "processing", ratioStatus: "pending", leaseExpiresAt: null, now: NOW,
    })).toBe(false);
  });
  it("pending → true", () => {
    expect(shouldEnqueueRatioFinalization({
      itemStatus: "completed", ratioStatus: "pending", leaseExpiresAt: null, now: NOW,
    })).toBe(true);
  });
  it("processing + no lease → true (recoverable)", () => {
    expect(shouldEnqueueRatioFinalization({
      itemStatus: "completed", ratioStatus: "processing", leaseExpiresAt: null, now: NOW,
    })).toBe(true);
  });
  it("processing + fresh lease → false", () => {
    const future = new Date(NOW + 60_000).toISOString();
    expect(shouldEnqueueRatioFinalization({
      itemStatus: "completed", ratioStatus: "processing", leaseExpiresAt: future, now: NOW,
    })).toBe(false);
  });
  it("processing + expired lease → true", () => {
    const past = new Date(NOW - 60_000).toISOString();
    expect(shouldEnqueueRatioFinalization({
      itemStatus: "completed", ratioStatus: "processing", leaseExpiresAt: past, now: NOW,
    })).toBe(true);
  });
  it("failed / completed / not_required → false (handled elsewhere)", () => {
    for (const s of ["failed", "completed", "not_required", null, "weird"]) {
      expect(shouldEnqueueRatioFinalization({
        itemStatus: "completed", ratioStatus: s, leaseExpiresAt: null, now: NOW,
      })).toBe(false);
    }
  });
});
