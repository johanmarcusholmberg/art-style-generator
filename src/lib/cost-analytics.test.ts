import { describe, it, expect } from "vitest";
import {
  summarize,
  groupByProvider,
  groupByMode,
  groupByEventType,
  groupByDay,
  formatCost,
  type CostEventRow,
} from "./cost-analytics";

const row = (over: Partial<CostEventRow>): CostEventRow => ({
  id: crypto.randomUUID(),
  generated_image_id: "img-1",
  event_type: "generation",
  provider: "openai",
  model: null,
  mode: "popart",
  estimated_cost: 0.01,
  currency: "USD",
  status: "succeeded",
  created_at: "2026-06-01T10:00:00Z",
  ...over,
});

describe("cost-analytics", () => {
  it("summarize totals known cost and tracks unknowns + distinct images", () => {
    const rows = [
      row({ generated_image_id: "a", estimated_cost: 0.05 }),
      row({ generated_image_id: "b", estimated_cost: 0.10 }),
      row({ generated_image_id: "a", estimated_cost: null }),
    ];
    const s = summarize(rows);
    expect(s.eventCount).toBe(3);
    expect(s.totalKnownCost).toBeCloseTo(0.15);
    expect(s.unknownCount).toBe(1);
    expect(s.distinctImages).toBe(2);
    expect(s.knownPct).toBeCloseTo(2 / 3);
  });

  it("summarize empty input is safe", () => {
    const s = summarize([]);
    expect(s).toEqual({
      totalKnownCost: 0,
      unknownCount: 0,
      eventCount: 0,
      distinctImages: 0,
      currency: "USD",
      knownPct: 0,
    });
  });

  it("groupByProvider sums + averages known costs", () => {
    const rows = [
      row({ provider: "openai", estimated_cost: 0.10 }),
      row({ provider: "openai", estimated_cost: 0.30 }),
      row({ provider: "openai", estimated_cost: null }),
      row({ provider: "gemini", estimated_cost: 0.05 }),
    ];
    const g = groupByProvider(rows);
    const openai = g.find((r) => r.key === "openai")!;
    expect(openai.events).toBe(3);
    expect(openai.knownCost).toBeCloseTo(0.40);
    expect(openai.unknownCount).toBe(1);
    expect(openai.avgCost).toBeCloseTo(0.20);
    // Sorted by knownCost desc
    expect(g[0].key).toBe("openai");
  });

  it("groupByMode + groupByEventType bucket as expected", () => {
    const rows = [
      row({ mode: "popart", event_type: "generation" }),
      row({ mode: "popart", event_type: "upscale", estimated_cost: 0.5 }),
      row({ mode: "lineart", event_type: "generation" }),
    ];
    expect(groupByMode(rows).map((g) => g.key).sort()).toEqual(["lineart", "popart"]);
    expect(groupByEventType(rows).map((g) => g.key).sort()).toEqual(["generation", "upscale"]);
  });

  it("groupByDay buckets by UTC date and sorts ascending", () => {
    const rows = [
      row({ created_at: "2026-06-01T23:00:00Z", estimated_cost: 0.1 }),
      row({ created_at: "2026-06-02T01:00:00Z", estimated_cost: 0.2 }),
      row({ created_at: "2026-06-02T05:00:00Z", estimated_cost: null }),
    ];
    const g = groupByDay(rows);
    expect(g.map((r) => r.date)).toEqual(["2026-06-01", "2026-06-02"]);
    expect(g[1].events).toBe(2);
    expect(g[1].knownCost).toBeCloseTo(0.2);
    expect(g[1].unknownCount).toBe(1);
  });

  it("groups handle null keys as (unknown)", () => {
    expect(groupByProvider([row({ provider: null })])[0].key).toBe("(unknown)");
  });

  it("formatCost renders currency", () => {
    expect(formatCost(1.2345, "USD")).toMatch(/1\.234/);
  });
});
