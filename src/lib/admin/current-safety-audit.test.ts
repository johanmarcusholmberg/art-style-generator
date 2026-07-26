import { describe, expect, it } from "vitest";
import {
  mapSafetyAuditRows,
  SAFETY_AUDIT_CATEGORIES,
  type RawSafetyAuditRow,
} from "./current-safety-audit";

describe("mapSafetyAuditRows", () => {
  it("returns a clean report for empty input", () => {
    for (const input of [null, undefined, []]) {
      const report = mapSafetyAuditRows(input as RawSafetyAuditRow[] | null);
      expect(report.isClean).toBe(true);
      expect(report.total).toBe(0);
      for (const c of SAFETY_AUDIT_CATEGORIES) {
        expect(report.countsByCategory[c]).toBe(0);
      }
    }
  });

  it("normalizes rows and counts per category", () => {
    const report = mapSafetyAuditRows([
      {
        category: "legacy_null_profile_collection",
        entity_id: "c1",
        detected_at: "2026-01-01T00:00:00Z",
        detail: { name: "Legacy" },
      },
      {
        category: "expired_ratio_finalization_processing",
        entity_id: "i1",
        detected_at: null,
        detail: { attempts: 3 },
      },
      {
        category: "expired_ratio_finalization_processing",
        entity_id: "i2",
        detail: null,
      },
    ]);

    expect(report.total).toBe(3);
    expect(report.isClean).toBe(false);
    expect(report.countsByCategory.legacy_null_profile_collection).toBe(1);
    expect(report.countsByCategory.expired_ratio_finalization_processing).toBe(2);
    expect(report.countsByCategory.completed_item_missing_canonical_asset).toBe(0);
    expect(report.rows[0].detail).toEqual({ name: "Legacy" });
    expect(report.rows[1].detectedAt).toBeNull();
    expect(report.rows[2].detail).toEqual({});
  });

  it("drops unknown categories and rows without an id", () => {
    const report = mapSafetyAuditRows([
      { category: "something_else", entity_id: "x" },
      { category: "legacy_null_profile_collection", entity_id: "" },
      { category: "legacy_null_profile_collection" },
      {
        category: "completed_item_missing_canonical_asset",
        entity_id: "ok",
        detail: { has_gallery_row: false },
      },
    ] as RawSafetyAuditRow[]);

    expect(report.total).toBe(1);
    expect(report.rows[0].entityId).toBe("ok");
  });

  it("ignores array details (not an object map)", () => {
    const report = mapSafetyAuditRows([
      {
        category: "legacy_null_profile_collection",
        entity_id: "c1",
        detail: [1, 2, 3],
      },
    ]);
    expect(report.rows[0].detail).toEqual({});
  });
});
