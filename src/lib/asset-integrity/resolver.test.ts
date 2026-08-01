import { describe, it, expect } from "vitest";
import type { AssetGraph, AssetRecord } from "./model";
import { resolveAssetIdentity, canonicalCandidates } from "./resolver";
import { evaluateCanonicalPromotion, validateLineage, detectCycles } from "./promotion";

function asset(p: Partial<AssetRecord> & { id: string }): AssetRecord {
  return {
    rootImageId: "img-1",
    parentAssetId: null,
    role: "original",
    bucket: "generated-images",
    path: `${p.id}.png`,
    width: 1000,
    height: 1400,
    ...p,
  };
}

function graph(assets: AssetRecord[]): AssetGraph {
  return { rootImageId: "img-1", assets };
}

describe("resolveAssetIdentity", () => {
  it("9. resolves the canonical master from a complete lineage", () => {
    const g = graph([
      asset({ id: "a", role: "original" }),
      asset({ id: "b", role: "ratio_corrected_master", parentAssetId: "a", isCanonical: true }),
    ]);
    const r = resolveAssetIdentity({ graph: g });
    expect(r.canonicalAssetId).toBe("b");
    expect(r.canonicalPath).toBe("b.png");
    expect(r.lineageValid).toBe(true);
    expect(r.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("10. reports a missing canonical master instead of inventing one", () => {
    const g = graph([asset({ id: "a", role: "temporary", path: null, url: "blob:x" })]);
    const r = resolveAssetIdentity({ graph: g });
    expect(r.canonicalAssetId).toBeNull();
    expect(r.issues.some((i) => i.code === "ASSET_CANONICAL_MISSING")).toBe(true);
  });

  it("11. flags conflicting canonical flags as ambiguous", () => {
    const g = graph([
      asset({ id: "a", isCanonical: true }),
      asset({ id: "b", isCanonical: true, role: "upscaled_master" }),
    ]);
    const r = resolveAssetIdentity({ graph: g });
    expect(r.issues.some((i) => i.code === "ASSET_CANONICAL_CONFLICT")).toBe(true);
  });

  it("12. never returns a display render URL as canonical", () => {
    const g = graph([
      asset({
        id: "a",
        isCanonical: true,
        path: null,
        url: "https://p.supabase.co/storage/v1/render/image/public/generated-images/a.png?width=500",
      }),
    ]);
    const r = resolveAssetIdentity({ graph: g });
    expect(r.canonicalUrl ?? "").not.toContain("render/image");
    expect(r.canonicalAssetId).toBeNull();
  });

  it("13. excludes archived and deleted assets from candidates", () => {
    const g = graph([
      asset({ id: "a", archivedAt: "2026-01-01" }),
      asset({ id: "b", deletedAt: "2026-01-01" }),
    ]);
    expect(canonicalCandidates(g)).toHaveLength(0);
  });

  it("14. excludes assets with invalid dimensions", () => {
    const g = graph([asset({ id: "a", width: 0, height: null })]);
    expect(canonicalCandidates(g)).toHaveLength(0);
  });
});

describe("evaluateCanonicalPromotion", () => {
  const current = asset({ id: "cur", isCanonical: true, width: 2000, height: 2800 });

  it("15. promotes a completed higher-resolution upscale", () => {
    const d = evaluateCanonicalPromotion({
      graph: graph([current]),
      candidate: asset({
        id: "new",
        role: "upscaled_master",
        parentAssetId: "cur",
        width: 4000,
        height: 5600,
        transformationStatus: "completed",
      }),
      current,
    });
    expect(d.promote).toBe(true);
  });

  it("16. refuses to promote a lower-resolution asset over the master", () => {
    const d = evaluateCanonicalPromotion({
      graph: graph([current]),
      candidate: asset({ id: "small", width: 800, height: 1120, transformationStatus: "completed" }),
      current,
    });
    expect(d.promote).toBe(false);
    expect(d.issues.some((i) => i.code === "ASSET_PROMOTION_REJECTED")).toBe(true);
  });

  it("17. refuses to promote an unfinished transformation", () => {
    const d = evaluateCanonicalPromotion({
      graph: graph([current]),
      candidate: asset({
        id: "wip",
        role: "ratio_corrected_master",
        width: 4000,
        height: 5600,
        transformationStatus: "processing",
      }),
      current,
    });
    expect(d.promote).toBe(false);
  });

  it("18. refuses to promote an unpersisted or transient asset", () => {
    const d = evaluateCanonicalPromotion({
      graph: graph([current]),
      candidate: asset({
        id: "blobby",
        path: null,
        url: "blob:http://localhost/x",
        width: 6000,
        height: 8000,
        transformationStatus: "completed",
      }),
      current,
    });
    expect(d.promote).toBe(false);
    expect(d.issues.some((i) => i.code === "ASSET_TRANSIENT_URL_REJECTED")).toBe(true);
  });

  it("19. never promotes a format derivative to canonical master", () => {
    const d = evaluateCanonicalPromotion({
      graph: graph([current]),
      candidate: asset({
        id: "deriv",
        role: "format_derivative",
        parentAssetId: "cur",
        width: 9000,
        height: 9000,
        transformationStatus: "completed",
        targetFormat: "print_50x70",
      }),
      current,
    });
    expect(d.promote).toBe(false);
  });

  it("promotes when there is no existing canonical master", () => {
    const d = evaluateCanonicalPromotion({
      graph: graph([]),
      candidate: asset({ id: "first", transformationStatus: "completed" }),
      current: null,
    });
    expect(d.promote).toBe(true);
  });
});

describe("validateLineage", () => {
  it("20. accepts original → corrected → upscale → derivative", () => {
    const g = graph([
      asset({ id: "o", role: "original" }),
      asset({ id: "c", role: "ratio_corrected_master", parentAssetId: "o" }),
      asset({ id: "u", role: "upscaled_master", parentAssetId: "c", isCanonical: true }),
      asset({ id: "d", role: "format_derivative", parentAssetId: "u", targetFormat: "print_50x70" }),
    ]);
    expect(validateLineage(g).valid).toBe(true);
  });

  it("21. detects a missing parent", () => {
    const g = graph([asset({ id: "c", parentAssetId: "ghost" })]);
    expect(validateLineage(g).issues.some((i) => i.code === "ASSET_LINEAGE_INVALID")).toBe(true);
  });

  it("22. detects lineage cycles", () => {
    const a = asset({ id: "a", parentAssetId: "b" });
    const b = asset({ id: "b", parentAssetId: "a" });
    expect(detectCycles([a, b]).length).toBeGreaterThan(0);
    expect(validateLineage(graph([a, b])).issues.some((i) => i.code === "ASSET_LINEAGE_CYCLE")).toBe(true);
  });

  it("23. detects a cross-root parent link", () => {
    const g = graph([
      asset({ id: "a" }),
      asset({ id: "x", rootImageId: "img-OTHER", parentAssetId: "a" }),
    ]);
    expect(validateLineage(g).issues.some((i) => i.code === "ASSET_LINEAGE_CROSS_ROOT")).toBe(true);
  });

  it("24. detects self-parenting", () => {
    const g = graph([asset({ id: "a", parentAssetId: "a" })]);
    expect(validateLineage(g).valid).toBe(false);
  });
});
