import { describe, it, expect } from "vitest";
import {
  buildAssetGraph,
  storageReferenceCounts,
  type RawGraphData,
  type RawRootRow,
} from "./graph-loader";
import { planAssetDeletion } from "./deletion-planner";
import { rpcModeFor, describePreview } from "./mutation-service";
import type { AssetMutationPreview } from "./mutation-service";

const root = (over: Partial<RawRootRow> = {}): RawRootRow => ({
  id: "root-1",
  storage_path: "u/base.png",
  master_storage_path: "u/master.png",
  enhanced_storage_path: null,
  original_storage_path: null,
  master_width: 4000,
  master_height: 5600,
  actual_width_px: 4000,
  actual_height_px: 5600,
  admin_status: "approved",
  deleted_at: null,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const raw = (over: Partial<RawGraphData> = {}): RawGraphData => ({
  root: root(),
  assets: [
    {
      id: "a-orig",
      generated_image_id: "root-1",
      asset_type: "original",
      version_index: 0,
      source_asset_id: null,
      storage_bucket: "generated-images",
      storage_path: "u/base.png",
      width_px: 2000,
      height_px: 2800,
      deleted_at: null,
    },
    {
      id: "a-up",
      generated_image_id: "root-1",
      asset_type: "upscale",
      version_index: 1,
      source_asset_id: "a-orig",
      storage_bucket: "generated-images",
      storage_path: "u/master.png",
      width_px: 4000,
      height_px: 5600,
      deleted_at: null,
    },
  ],
  memberships: [],
  anchorCollectionIds: [],
  ...over,
});

describe("buildAssetGraph", () => {
  it("includes the root as an asset and hangs top-level versions off it", () => {
    const g = buildAssetGraph(raw());
    expect(g.rootImageId).toBe("root-1");
    expect(g.assets.map((a) => a.id)).toEqual(["root-1", "a-orig", "a-up"]);
    expect(g.assets.find((a) => a.id === "a-orig")!.parentAssetId).toBe("root-1");
    expect(g.assets.find((a) => a.id === "a-up")!.parentAssetId).toBe("a-orig");
  });

  it("marks the version owning master_storage_path as canonical", () => {
    const g = buildAssetGraph(raw());
    expect(g.assets.filter((a) => a.isCanonical).map((a) => a.id)).toEqual(["a-up"]);
  });

  it("falls back to the root record when no version owns the master object", () => {
    const g = buildAssetGraph(raw({ root: root({ master_storage_path: "u/orphan.png" }) }));
    expect(g.assets.find((a) => a.isCanonical)!.id).toBe("root-1");
  });

  it("ignores soft-deleted versions when selecting canonical", () => {
    const r = raw();
    r.assets[1].deleted_at = "2026-02-01T00:00:00Z";
    const g = buildAssetGraph(r);
    expect(g.assets.find((a) => a.isCanonical)!.id).toBe("root-1");
  });

  it("maps memberships and anchors only for the root", () => {
    const g = buildAssetGraph(
      raw({ memberships: [{ id: "m1", collection_id: "c1" }], anchorCollectionIds: ["c2"] }),
    );
    expect(g.collectionMemberships).toEqual([{ collectionId: "c1", membershipId: "m1" }]);
    expect(g.anchorReferences).toEqual([{ collectionId: "c2" }]);
  });

  it("propagates archived and deleted state onto the root record", () => {
    const g = buildAssetGraph(
      raw({ root: root({ admin_status: "archived", deleted_at: "2026-03-01T00:00:00Z" }) }),
    );
    const r = g.assets[0];
    expect(r.archivedAt).toBeTruthy();
    expect(r.deletedAt).toBe("2026-03-01T00:00:00Z");
  });
});

describe("graph feeds the planner correctly", () => {
  it("blocks a non-cascade root delete because versions depend on it", () => {
    const g = buildAssetGraph(raw());
    const plan = planAssetDeletion({ graph: g, assetId: "root-1" });
    expect(plan.blocked).toBe(true);
    expect(plan.blockers[0].code).toBe("ASSET_DELETE_BLOCKED_DEPENDANTS");
  });

  it("allows a confirmed root cascade and orders storage cleanup last", () => {
    const g = buildAssetGraph(raw());
    const plan = planAssetDeletion({ graph: g, assetId: "root-1", cascadeRoot: true, confirmed: true });
    expect(plan.blocked).toBe(false);
    const first = plan.steps.findIndex((s) => s.action === "delete_storage_object");
    const lastRow = plan.steps.map((s) => s.action).lastIndexOf("soft_delete_row");
    expect(first).toBeGreaterThan(lastRow);
  });

  it("refuses an unconfirmed root cascade", () => {
    const g = buildAssetGraph(raw());
    const plan = planAssetDeletion({ graph: g, assetId: "root-1", cascadeRoot: true });
    expect(plan.blocked).toBe(true);
  });

  it("promotes a valid replacement before deleting the canonical version", () => {
    const g = buildAssetGraph(raw());
    const plan = planAssetDeletion({ graph: g, assetId: "a-up" });
    expect(plan.isCanonical).toBe(true);
    expect(plan.replacementCanonicalAssetId).toBeTruthy();
    expect(plan.steps[0].action).toBe("promote_replacement_canonical");
  });

  it("archives instead of deleting when the root anchors a matching collection", () => {
    const r = raw({ anchorCollectionIds: ["c9"] });
    // Only the canonical upscale survives, and it does not hang off the root,
    // so the root itself has no live dependants.
    r.assets = [{ ...r.assets[1], source_asset_id: "missing-parent" }];
    const g = buildAssetGraph(r);
    expect(g.assets.find((a) => a.isCanonical)!.id).toBe("a-up");
    const plan = planAssetDeletion({ graph: g, assetId: "root-1" });
    expect(plan.mode).toBe("archive");
    expect(plan.steps.every((s) => s.action !== "delete_storage_object")).toBe(true);
  });
});

describe("storageReferenceCounts", () => {
  it("counts every live row pointing at an object", () => {
    const counts = storageReferenceCounts(raw());
    expect(counts["u/base.png"]).toBe(2); // root.storage_path + original version
    expect(counts["u/master.png"]).toBe(2); // root.master + upscale version
  });

  it("ignores soft-deleted rows", () => {
    const r = raw({ root: root({ deleted_at: "2026-02-02T00:00:00Z" }) });
    const counts = storageReferenceCounts(r);
    expect(counts["u/base.png"]).toBe(1);
  });
});

describe("rpcModeFor", () => {
  const base: AssetMutationPreview = {
    mode: "delete",
    blocked: false,
    blockers: [],
    warnings: [],
    steps: [],
    affectedAssetIds: [],
    affectedCollectionIds: [],
    storageObjectsToRemove: [],
    replacementCanonicalAssetId: null,
    rootImageId: "root-1",
    targetAssetId: "root-1",
    isRoot: true,
    cascade: true,
    isCanonical: true,
    anchorCollectionIds: [],
    expectedLiveAssetIds: [],
    expectedCanonicalAssetId: null,
  };

  it("maps each shape to the right transactional mode", () => {
    expect(rpcModeFor(base)).toBe("delete_root_cascade");
    expect(rpcModeFor({ ...base, isRoot: false, targetAssetId: "a-up" })).toBe("delete_asset");
    expect(rpcModeFor({ ...base, mode: "archive" })).toBe("archive_root");
    expect(rpcModeFor({ ...base, mode: "archive", isRoot: false })).toBe("archive_asset");
    expect(rpcModeFor({ ...base, membershipId: "m1" })).toBe("remove_membership");
  });

  it("describes archive as non-destructive", () => {
    expect(describePreview({ ...base, mode: "archive" })).toMatch(/No files will be deleted/);
  });
});
