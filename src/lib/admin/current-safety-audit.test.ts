import { describe, expect, it } from "vitest";
import {
  mapSafetyAuditRows,
  type RawSafetyAuditRow,
} from "./current-safety-audit";

const stale = (detail: Record<string, unknown>): RawSafetyAuditRow => ({
  category: "expired_ratio_finalization_processing",
  entity_id: String(detail.item_id ?? "i1"),
  detected_at: "2026-07-01T00:00:00Z",
  detail,
});

const canonical = (detail: Record<string, unknown>): RawSafetyAuditRow => ({
  category: "completed_item_missing_canonical_asset",
  entity_id: String(detail.item_id ?? "i1"),
  detail,
});

describe("mapSafetyAuditRows", () => {
  it("returns a clean report for empty input", () => {
    for (const input of [null, undefined, []]) {
      const r = mapSafetyAuditRows(input as RawSafetyAuditRow[] | null);
      expect(r.isClean).toBe(true);
      expect(r.total).toBe(0);
      expect(r.nullProfileCollections).toEqual([]);
      expect(r.staleFinalizations).toEqual([]);
      expect(r.incompleteCanonicalAssets).toEqual([]);
      expect(r.malformedRows).toEqual([]);
    }
  });

  it("lists null-profile collections", () => {
    const r = mapSafetyAuditRows([
      {
        category: "legacy_null_profile_collection",
        entity_id: "c1",
        detail: { collection_id: "c1" },
      },
    ]);
    expect(r.nullProfileCollections).toEqual([{ collectionId: "c1" }]);
  });

  it("reports a missing processing lease", () => {
    const r = mapSafetyAuditRows([
      stale({ item_id: "i1", job_id: "j1", reason: "missing_lease", lease_expires_at: null }),
    ]);
    expect(r.staleFinalizations).toEqual([
      { itemId: "i1", jobId: "j1", reason: "missing_lease", leaseExpiresAt: null },
    ]);
  });

  it("reports an expired processing lease", () => {
    const r = mapSafetyAuditRows([
      stale({
        item_id: "i2",
        job_id: "j2",
        reason: "expired_lease",
        lease_expires_at: "2026-07-01T00:00:00Z",
      }),
    ]);
    expect(r.staleFinalizations[0]).toEqual({
      itemId: "i2",
      jobId: "j2",
      reason: "expired_lease",
      leaseExpiresAt: "2026-07-01T00:00:00Z",
    });
  });

  it("surfaces malformed stale rows instead of silently degrading them", () => {
    const r = mapSafetyAuditRows([
      stale({ item_id: "i3", reason: "missing_lease" }), // no job_id
      stale({ item_id: "i4", job_id: "j4", reason: "who_knows" }),
      stale({ item_id: "i5", job_id: "j5", reason: "expired_lease", lease_expires_at: null }),
      { category: "legacy_null_profile_collection", entity_id: "c9", detail: [1, 2] },
    ]);
    expect(r.staleFinalizations).toEqual([]);
    expect(r.malformedRows).toHaveLength(4);
    expect(r.isClean).toBe(false);
  });

  it("reports exact missing canonical fields", () => {
    const r = mapSafetyAuditRows([
      canonical({ item_id: "a1", gallery_image_id: null, missing_fields: ["gallery_image_id"] }),
      canonical({
        item_id: "a2",
        gallery_image_id: "g2",
        missing_fields: ["canonical_storage_path"],
      }),
      canonical({
        item_id: "a3",
        gallery_image_id: "g3",
        missing_fields: ["canonical_width", "canonical_height"],
      }),
    ]);
    expect(r.incompleteCanonicalAssets).toEqual([
      { itemId: "a1", galleryImageId: null, missingFields: ["gallery_image_id"] },
      { itemId: "a2", galleryImageId: "g2", missingFields: ["canonical_storage_path"] },
      {
        itemId: "a3",
        galleryImageId: "g3",
        missingFields: ["canonical_width", "canonical_height"],
      },
    ]);
  });

  it("treats a complete canonical asset (no missing fields) as malformed, never as a finding", () => {
    const r = mapSafetyAuditRows([
      canonical({ item_id: "ok", gallery_image_id: "g", missing_fields: [] }),
    ]);
    expect(r.incompleteCanonicalAssets).toEqual([]);
    expect(r.malformedRows).toHaveLength(1);
  });

  it("drops unknown categories and flags known rows without an id", () => {
    const r = mapSafetyAuditRows([
      { category: "something_else", entity_id: "x" },
      { category: "legacy_null_profile_collection", entity_id: "" },
    ] as RawSafetyAuditRow[]);
    expect(r.nullProfileCollections).toEqual([]);
    expect(r.malformedRows).toHaveLength(1);
    expect(r.malformedRows[0].reason).toBe("missing entity_id");
  });

  it("counts every finding bucket in total", () => {
    const r = mapSafetyAuditRows([
      { category: "legacy_null_profile_collection", entity_id: "c1", detail: {} },
      stale({ item_id: "i1", job_id: "j1", reason: "missing_lease" }),
      canonical({ item_id: "a1", missing_fields: ["canonical_width"] }),
    ]);
    expect(r.total).toBe(3);
    expect(r.isClean).toBe(false);
  });
});
