import { describe, it, expect } from "vitest";
import { planAssetDeletion, planCollectionMembershipRemoval } from "./deletion-planner";
import type { AssetGraph, AssetRecord } from "./model";

const ROOT = "root-1";

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

describe("planAssetDeletion — safe single-asset deletion", () => {
  it("deletes a leaf row before its storage object", () => {
    const g = graph([
      asset({ id: ROOT, role: "original", isCanonical: true }),
      asset({ id: "d1", role: "upscaled_master", parentAssetId: null, isCanonical: false }),
    ]);
    const plan = planAssetDeletion({ graph: g, assetId: "d1" });
    expect(plan.blocked).toBe(false);
    expect(plan.mode).toBe("delete");
    expect(plan.steps.map((s) => s.action)).toEqual(["soft_delete_row", "delete_storage_object"]);
  });

  it("blocks deletion when live dependants exist", () => {
    const g = graph([
      asset({ id: ROOT, isCanonical: true }),
      asset({ id: "a", parentAssetId: null }),
      asset({ id: "b", parentAssetId: "a", role: "format_derivative", targetFormat: "50x70" }),
    ]);
    const plan = planAssetDeletion({ graph: g, assetId: "a" });
    expect(plan.blocked).toBe(true);
    expect(plan.blockers[0].code).toBe("ASSET_DELETE_BLOCKED_DEPENDANTS");
    expect(plan.steps.some((s) => s.action === "delete_storage_object")).toBe(false);
  });

  it("returns a blocked plan for an unknown asset", () => {
    const plan = planAssetDeletion({ graph: graph([asset({ id: ROOT })]), assetId: "nope" });
    expect(plan.blocked).toBe(true);
    expect(plan.blockers[0].code).toBe("ASSET_CANONICAL_MISSING");
  });

  it("archives instead of deleting when lineage is uncertain", () => {
    const g = graph([
      asset({ id: ROOT, isCanonical: true }),
      asset({ id: "orphan", parentAssetId: "missing-parent" }),
    ]);
    const plan = planAssetDeletion({ graph: g, assetId: "orphan" });
    expect(plan.mode).toBe("archive");
    expect(plan.blocked).toBe(false);
    expect(plan.steps.map((s) => s.action)).toEqual(["archive_row"]);
  });

  it("keeps a shared storage object and warns instead of deleting it", () => {
    const g = graph([
      asset({ id: ROOT, isCanonical: true, path: "shared.png" }),
      asset({ id: "twin", path: "shared.png" }),
    ]);
    const plan = planAssetDeletion({ graph: g, assetId: "twin" });
    expect(plan.storageObjectReferenceCount).toBe(2);
    expect(plan.steps.some((s) => s.action === "delete_storage_object")).toBe(false);
    expect(plan.warnings[0].code).toBe("ASSET_STORAGE_CLEANUP_FAILED");
  });
});

describe("planAssetDeletion — canonical protection", () => {
  it("promotes a validated replacement before removing the canonical master", () => {
    const g = graph([
      asset({ id: ROOT, role: "original", isCanonical: true, width: 4000, height: 5000 }),
      asset({ id: "up", role: "upscaled_master", width: 4000, height: 5000 }),
    ]);
    const plan = planAssetDeletion({ graph: g, assetId: ROOT });
    expect(plan.isCanonical).toBe(true);
    expect(plan.replacementCanonicalAssetId).toBe("up");
    expect(plan.steps[0].action).toBe("promote_replacement_canonical");
  });

  it("blocks canonical deletion when no replacement exists", () => {
    const g = graph([asset({ id: ROOT, isCanonical: true })]);
    const plan = planAssetDeletion({ graph: g, assetId: ROOT });
    expect(plan.blocked).toBe(true);
    expect(plan.blockers.some((b) => b.code === "ASSET_DELETE_BLOCKED_CANONICAL")).toBe(true);
  });

  it("rejects a lower-resolution replacement", () => {
    const g = graph([
      asset({ id: ROOT, role: "upscaled_master", isCanonical: true, width: 8000, height: 10000 }),
      asset({ id: "small", role: "ratio_corrected_master", width: 800, height: 1000 }),
    ]);
    const plan = planAssetDeletion({ graph: g, assetId: ROOT });
    expect(plan.blocked).toBe(true);
    expect(plan.replacementCanonicalAssetId).toBeNull();
    expect(plan.blockers.some((b) => b.code === "ASSET_PROMOTION_REJECTED")).toBe(true);
  });

  it("rejects a format derivative as a replacement canonical master", () => {
    const g = graph([
      asset({ id: ROOT, role: "upscaled_master", isCanonical: true }),
      asset({
        id: "deriv",
        role: "format_derivative",
        targetFormat: "30x40",
        width: 4000,
        height: 5000,
      }),
    ]);
    const plan = planAssetDeletion({ graph: g, assetId: ROOT });
    expect(plan.blocked).toBe(true);
    expect(plan.replacementCanonicalAssetId).toBeNull();
  });
});

describe("planAssetDeletion — collections, anchors and cascade", () => {
  it("does not touch root collection membership when deleting a child asset", () => {
    const g = graph(
      [
        asset({ id: ROOT, isCanonical: true }),
        asset({ id: "child", parentAssetId: null }),
      ],
      {
        collectionMemberships: [{ collectionId: "c1", membershipId: "m1" }],
        anchorReferences: [{ collectionId: "c1" }],
      },
    );
    const plan = planAssetDeletion({ graph: g, assetId: "child" });
    expect(plan.collectionMembershipIds).toEqual([]);
    expect(plan.anchorCollectionIds).toEqual([]);
    expect(plan.mode).toBe("delete");
    expect(plan.steps.some((s) => s.action === "remove_collection_membership")).toBe(false);
  });

  it("archives the root when it is a Matching Collection anchor", () => {
    const g = graph(
      [
        asset({ id: ROOT, isCanonical: false }),
        asset({ id: "up", role: "upscaled_master", isCanonical: true }),
      ],
      { anchorReferences: [{ collectionId: "c1" }] },
    );
    const plan = planAssetDeletion({ graph: g, assetId: ROOT });
    expect(plan.mode).toBe("archive");
    expect(plan.steps.map((s) => s.action)).toEqual(["archive_row"]);
  });

  it("requires explicit confirmation for a root cascade", () => {
    const g = graph([
      asset({ id: ROOT, isCanonical: true }),
      asset({ id: "up", role: "upscaled_master", parentAssetId: ROOT }),
    ]);
    const plan = planAssetDeletion({ graph: g, assetId: ROOT, cascadeRoot: true });
    expect(plan.blocked).toBe(true);
    expect(plan.steps).toEqual([]);
  });

  it("cascades dependants first and storage objects last", () => {
    const g = graph(
      [
        asset({ id: ROOT, isCanonical: true }),
        asset({ id: "up", role: "upscaled_master", parentAssetId: ROOT }),
        asset({ id: "deriv", role: "format_derivative", targetFormat: "A2", parentAssetId: "up" }),
      ],
      { collectionMemberships: [{ collectionId: "c1", membershipId: "m1" }] },
    );
    const plan = planAssetDeletion({ graph: g, assetId: ROOT, cascadeRoot: true, confirmed: true });
    const actions = plan.steps.map((s) => s.action);
    expect(plan.blocked).toBe(false);
    expect(actions[0]).toBe("remove_collection_membership");
    const softDeletes = plan.steps.filter((s) => s.action === "soft_delete_row").map((s) => s.assetId);
    expect(softDeletes).toEqual(["deriv", "up", ROOT]);
    expect(actions.lastIndexOf("soft_delete_row")).toBeLessThan(actions.indexOf("delete_storage_object"));
  });

  it("refuses a cascade from an asset that is not the identified graph root", () => {
    const g = graph([
      asset({ id: ROOT, isCanonical: true }),
      asset({ id: "up", role: "upscaled_master", parentAssetId: ROOT }),
    ]);
    const plan = planAssetDeletion({ graph: g, assetId: "up", cascadeRoot: true, confirmed: true });
    expect(plan.blocked).toBe(true);
    expect(plan.steps).toEqual([]);
  });

  it("never produces a destructive plan for a lineage containing a cycle", () => {
    const g = graph([
      asset({ id: ROOT, isCanonical: true, parentAssetId: "up" }),
      asset({ id: "up", role: "upscaled_master", parentAssetId: ROOT }),
    ]);
    for (const target of [ROOT, "up"]) {
      const plan = planAssetDeletion({ graph: g, assetId: target });
      expect(plan.blocked).toBe(true);
      expect(plan.blockers.some((b) => b.code === "ASSET_LINEAGE_CYCLE")).toBe(true);
      expect(plan.steps).toEqual([]);
    }
  });

  it("membership removal never deletes the asset or its object", () => {
    const plan = planCollectionMembershipRemoval("m-9");
    expect(plan.steps.map((s) => s.action)).toEqual(["remove_collection_membership"]);
    expect(plan.blocked).toBe(false);
  });

  it("is pure — the input graph is never mutated", () => {
    const g = graph([
      asset({ id: ROOT, isCanonical: true }),
      asset({ id: "up", role: "upscaled_master" }),
    ]);
    const before = JSON.stringify(g);
    planAssetDeletion({ graph: g, assetId: ROOT, cascadeRoot: true, confirmed: true });
    planAssetDeletion({ graph: g, assetId: "up" });
    expect(JSON.stringify(g)).toBe(before);
  });
});
