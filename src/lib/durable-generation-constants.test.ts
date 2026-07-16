import { describe, it, expect } from "vitest";
import {
  RECENT_ADOPT_WINDOW_MS,
  PENDING_IDEMPOTENCY_KEY_PREFIX,
  CURRENT_JOB_KEY_PREFIX,
} from "./durable-generation-constants";

describe("durable-generation-constants", () => {
  it("RECENT_ADOPT_WINDOW_MS is a positive, human-scale window", () => {
    expect(RECENT_ADOPT_WINDOW_MS).toBeGreaterThan(0);
    // Bounded: 30s .. 15min. Prevents accidental drift into "forever" or "0".
    expect(RECENT_ADOPT_WINDOW_MS).toBeGreaterThanOrEqual(30_000);
    expect(RECENT_ADOPT_WINDOW_MS).toBeLessThanOrEqual(15 * 60_000);
  });

  it("storage-key prefixes are unique and non-empty", () => {
    expect(PENDING_IDEMPOTENCY_KEY_PREFIX.length).toBeGreaterThan(0);
    expect(CURRENT_JOB_KEY_PREFIX.length).toBeGreaterThan(0);
    expect(PENDING_IDEMPOTENCY_KEY_PREFIX).not.toEqual(CURRENT_JOB_KEY_PREFIX);
  });
});
