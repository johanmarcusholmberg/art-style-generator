import { describe, it, expect } from "vitest";
import { scanAssetIntegrity } from "./scanner";
import type { AssetGraph, AssetRecord } from "./model";

const ROOT = "root-1";
const BASE = "https://proj.supabase.co";

function asset(over: Partial<AssetRecord> & { id: string }): AssetRecord {
  return {
    rootImageId: ROOT,
    parentAssetId: null,
    role: "original",
    bucket: "generated-images",
    path: `${over.id}.png`,
    width: 4000,
    height: 5000,
    ...over,
  } as AssetRecord;
}

function graph(assets: AssetRecord[], extra: Partial<AssetGraph> = {}): AssetGraph {
  return { rootImageId: ROOT, assets, ...extra };
}

const codes = (r: { findings: { code: string }[] }) => r.findings.map((f) => f.code);

describe("scanAssetIntegrity — read-only guarantees", () => {
  it("never mutates the input graphs", () => {
    const g = graph([asset({ id: ROOT, isCanonical: true, url: "blob:http://x/1" })]);
    const before = JSON.stringify(g);
    scanAssetIntegrity({ graphs: [g], storageObjects: ["generated-images/other.png"] });
    expect(JSON.stringify(g)).toBe(before);
  });

  it("reports counts consistent with the findings list", () => {
    const g = graph([asset({ id: ROOT, isCanonical: true, storageObjectExists: false })]);
    const r = scanAssetIntegrity({ graphs: [g] });
    expect(r.scannedGraphs).toBe(1);
    expect(r.scannedAssets).toBe(1);
    expect(r.errorCount).toBe(r.findings.filter((f) => f.severity === "error").length);
    expect(r.warningCount).toBe(r.findings.filter((f) => f.severity === "warning").length);
  });
});

describe("scanAssetIntegrity — defect detection", () => {
  it("flags a row whose storage object is missing", () => {
    const r = scanAssetIntegrity({
      graphs: [graph([asset({ id: ROOT, isCanonical: true, storageObjectExists: false })])],
    });
    expect(codes(r)).toContain("ASSET_STORAGE_OBJECT_MISSING");
  });

  it("flags persisted render/image display URLs", () => {
    const r = scanAssetIntegrity({
      graphs: [
        graph([
          asset({
            id: ROOT,
            isCanonical: true,
            url: `${BASE}/storage/v1/render/image/public/generated-images/a.png?width=500`,
          }),
        ]),
      ],
    });
    expect(codes(r)).toContain("ASSET_TRANSIENT_URL_REJECTED");
  });

  it("flags blob, signed and external persisted URLs", () => {
    const r = scanAssetIntegrity({
      graphs: [
        graph([
          asset({ id: "a", url: "blob:http://localhost/x" }),
          asset({ id: "b", url: `${BASE}/storage/v1/object/sign/generated-images/a.png?token=SECRET` }),
          asset({ id: "c", url: "https://replicate.delivery/pbxt/x.png" }),
        ]),
      ],
    });
    expect(r.findings.filter((f) => f.code === "ASSET_TRANSIENT_URL_REJECTED")).toHaveLength(3);
    expect(JSON.stringify(r.findings)).not.toContain("SECRET");
  });

  it("flags an archived asset that is still canonical", () => {
    const r = scanAssetIntegrity({
      graphs: [graph([asset({ id: ROOT, isCanonical: true, archivedAt: "2026-01-01" })])],
    });
    expect(codes(r)).toContain("ASSET_ARCHIVED_CANONICAL");
  });

  it("flags invalid canonical dimensions", () => {
    const r = scanAssetIntegrity({
      graphs: [graph([asset({ id: ROOT, isCanonical: true, width: 0, height: null })])],
    });
    expect(codes(r)).toContain("ASSET_DIMENSIONS_INVALID");
  });

  it("flags format derivatives with no target format or an invalid crop box", () => {
    const r = scanAssetIntegrity({
      graphs: [
        graph([
          asset({ id: ROOT, isCanonical: true }),
          asset({
            id: "d",
            role: "format_derivative",
            parentAssetId: ROOT,
            cropBox: { x: 0, y: 0, width: 9000, height: 10 },
            sourceWidth: 100,
            sourceHeight: 100,
          }),
        ]),
      ],
    });
    expect(codes(r)).toContain("ASSET_FORMAT_TARGET_MISSING");
    expect(codes(r)).toContain("ASSET_CROP_BOX_INVALID");
  });

  it("flags lineage cycles and self-parenting", () => {
    const cyclic = scanAssetIntegrity({
      graphs: [
        graph([
          asset({ id: ROOT, parentAssetId: "up" }),
          asset({ id: "up", role: "upscaled_master", parentAssetId: ROOT }),
        ]),
      ],
    });
    expect(codes(cyclic)).toContain("ASSET_LINEAGE_CYCLE");

    const selfParent = scanAssetIntegrity({
      graphs: [graph([asset({ id: ROOT, parentAssetId: ROOT })])],
    });
    expect(codes(selfParent)).toContain("ASSET_LINEAGE_INVALID");
  });

  it("flags duplicate operation identities and shared storage objects", () => {
    const g = graph([
      asset({ id: "a", path: "same.png" }),
      asset({ id: "b", path: "same.png" }),
    ]);
    const r = scanAssetIntegrity({
      graphs: [g],
      identityOf: (a) => ({ type: "generation", generationJobItemId: "item-1" }),
    });
    const dupes = r.findings.filter((f) => f.code === "ASSET_DUPLICATE_OPERATION");
    expect(dupes.length).toBeGreaterThanOrEqual(2);
    expect(dupes.every((f) => f.severity === "warning")).toBe(true);
  });

  it("reports unreferenced storage objects but never referenced ones", () => {
    const g = graph([asset({ id: ROOT, isCanonical: true, path: "kept.png" })]);
    const r = scanAssetIntegrity({
      graphs: [g],
      storageObjects: ["generated-images/kept.png", "generated-images/orphan.png"],
    });
    const orphans = r.findings.filter((f) => f.code === "ASSET_STORAGE_CLEANUP_FAILED");
    expect(orphans).toHaveLength(1);
    expect(orphans[0].path).toBe("orphan.png");
    expect(orphans[0].severity).toBe("warning");
  });

  it("returns no findings for a healthy lineage", () => {
    const g = graph([
      asset({ id: ROOT, role: "original", storageObjectExists: true }),
      asset({
        id: "up",
        role: "upscaled_master",
        parentAssetId: ROOT,
        isCanonical: true,
        width: 8000,
        height: 10000,
        storageObjectExists: true,
      }),
    ]);
    const r = scanAssetIntegrity({ graphs: [g], storageObjects: [] });
    expect(r.findings).toEqual([]);
  });
});
