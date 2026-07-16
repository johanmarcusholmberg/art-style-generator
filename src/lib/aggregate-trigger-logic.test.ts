import { describe, it, expect } from "vitest";
import { computeJobAggregate } from "./aggregate-trigger-logic";

describe("computeJobAggregate — mirrors public.update_generation_job_aggregate", () => {
  it("preserves cancelled status regardless of item mix", () => {
    expect(
      computeJobAggregate({
        currentJobStatus: "cancelled",
        itemStatuses: ["completed", "failed", "queued"],
      }),
    ).toEqual({ status: "cancelled", completed: 1, failed: 1 });
  });

  it("all-failed single-item job resolves to 'failed'", () => {
    expect(
      computeJobAggregate({ currentJobStatus: "processing", itemStatuses: ["failed"] }),
    ).toEqual({ status: "failed", completed: 0, failed: 1 });
  });

  it("mixed terminal outcomes with any success → 'completed'", () => {
    expect(
      computeJobAggregate({
        currentJobStatus: "processing",
        itemStatuses: ["completed", "failed", "failed"],
      }),
    ).toEqual({ status: "completed", completed: 1, failed: 2 });
  });

  it("outstanding items keep job at 'processing'", () => {
    expect(
      computeJobAggregate({
        currentJobStatus: "processing",
        itemStatuses: ["completed", "queued"],
      }),
    ).toEqual({ status: "processing", completed: 1, failed: 0 });
  });

  it("no terminal items yet → 'queued'", () => {
    expect(
      computeJobAggregate({
        currentJobStatus: "queued",
        itemStatuses: ["queued", "dispatching"],
      }),
    ).toEqual({ status: "queued", completed: 0, failed: 0 });
  });

  it("all-completed multi-item job → 'completed'", () => {
    expect(
      computeJobAggregate({
        currentJobStatus: "processing",
        itemStatuses: ["completed", "completed", "completed"],
      }),
    ).toEqual({ status: "completed", completed: 3, failed: 0 });
  });
});
