import { describe, it, expect, vi } from "vitest";
import { planAssetRepairs, executeAssetRepairs, type RepairPlan } from "./repair";
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

const actions = (p: RepairPlan) => p.proposals.map((x) => x.action);

describe("planAssetRepairs — proposals only", () => {
  it("always returns a dry-run plan", () => {
    const plan = planAssetRepairs({ graph: graph([asset({ id: ROOT, isCanonical: true })]) });
    expect(plan.dryRun).toBe(true);
  });

  it("proposes clearing a transient URL when a canonical path exists", () => {
    const plan = planAssetRepairs({
      graph: graph([
        asset({
          id: ROOT,
          isCanonical: true,
          url: `${BASE}/storage/v1/object/sign/generated-images/a.png?token=SECRET`,
        }),
      ]),
    });
    const p = plan.proposals.find((x) => x.action === "clear_transient_url")!;
    expect(p.destructive).toBe(false);
    expect(JSON.stringify(plan)).not.toContain("SECRET");
  });

  it("refuses to guess a replacement when a transient URL has no storage path", () => {
    const plan = planAssetRepairs({
      graph: graph([asset({ id: ROOT, path: null, url: "blob:http://localhost/x" })]),
    });
    expect(actions(plan)).not.toContain("clear_transient_url");
    expect(plan.skipped.some((s) => s.code === "ASSET_TRANSIENT_URL_REJECTED")).toBe(true);
  });

  it("relinks a row only when the exact object is verified", () => {
    const g = graph([asset({ id: ROOT, isCanonical: true, storageObjectExists: false })]);
    expect(actions(planAssetRepairs({ graph: g }))).not.toContain("relink_verified_object");
    expect(
      actions(planAssetRepairs({ graph: g, verifiedObjects: [`generated-images/${ROOT}.png`] })),
    ).toContain("relink_verified_object");
  });

  it("selects a canonical master only when exactly one candidate exists", () => {
    const single = planAssetRepairs({ graph: graph([asset({ id: ROOT, role: "original" })]) });
    expect(actions(single)).toContain("select_only_canonical_candidate");

    const many = planAssetRepairs({
      graph: graph([
        asset({ id: "a", role: "original" }),
        asset({ id: "b", role: "upscaled_master" }),
      ]),
    });
    expect(actions(many)).not.toContain("select_only_canonical_candidate");
    expect(many.skipped.some((s) => s.code === "ASSET_CANONICAL_CONFLICT")).toBe(true);
  });

  it("never proposes cleanup for an object a live row still references", () => {
    const plan = planAssetRepairs({
      graph: graph([asset({ id: ROOT, isCanonical: true, path: "kept.png" })]),
      confirmedUnreferencedObjects: ["generated-images/kept.png"],
    });
    expect(actions(plan)).not.toContain("retry_unreferenced_object_cleanup");
    expect(plan.skipped.some((s) => s.code === "ASSET_STORAGE_CLEANUP_FAILED")).toBe(true);
  });

  it("marks orphan object cleanup as destructive", () => {
    const plan = planAssetRepairs({
      graph: graph([asset({ id: ROOT, isCanonical: true })]),
      confirmedUnreferencedObjects: ["generated-images/orphan.png"],
    });
    const p = plan.proposals.find((x) => x.action === "retry_unreferenced_object_cleanup")!;
    expect(p.destructive).toBe(true);
    expect(p.path).toBe("orphan.png");
  });
});

describe("planAssetRepairs — duplicate archiving gates", () => {
  const identity = () => ({ type: "generation" as const, generationJobItemId: "item-1" });
  const base = () =>
    graph([
      asset({ id: ROOT, isCanonical: true }),
      asset({ id: "keep", parentAssetId: null }),
      asset({ id: "dup", parentAssetId: null }),
    ]);

  const dupProposals = (plan: RepairPlan) =>
    plan.proposals.filter((p) => p.action === "archive_incomplete_duplicate");

  it("archives a duplicate only with a verified identical operation identity", () => {
    const plan = planAssetRepairs({
      graph: base(),
      duplicates: [{ keepAssetId: "keep", duplicateAssetIds: ["dup"] }],
      identityOf: identity,
    });
    expect(dupProposals(plan).map((p) => p.assetId)).toEqual(["dup"]);
    expect(dupProposals(plan)[0].destructive).toBe(false);
  });

  it("refuses when no operation identity is supplied", () => {
    const plan = planAssetRepairs({
      graph: base(),
      duplicates: [{ keepAssetId: "keep", duplicateAssetIds: ["dup"] }],
    });
    expect(dupProposals(plan)).toHaveLength(0);
    expect(plan.skipped.some((s) => s.code === "ASSET_DUPLICATE_OPERATION")).toBe(true);
  });

  it("refuses when keeper and duplicate are different operations", () => {
    const plan = planAssetRepairs({
      graph: base(),
      duplicates: [{ keepAssetId: "keep", duplicateAssetIds: ["dup"] }],
      identityOf: (a) => ({ type: "generation", generationJobItemId: a.id }),
    });
    expect(dupProposals(plan)).toHaveLength(0);
  });

  it("refuses when either row is missing", () => {
    const missingKeeper = planAssetRepairs({
      graph: base(),
      duplicates: [{ keepAssetId: "ghost", duplicateAssetIds: ["dup"] }],
      identityOf: identity,
    });
    const missingDup = planAssetRepairs({
      graph: base(),
      duplicates: [{ keepAssetId: "keep", duplicateAssetIds: ["ghost"] }],
      identityOf: identity,
    });
    expect(dupProposals(missingKeeper)).toHaveLength(0);
    expect(dupProposals(missingDup)).toHaveLength(0);
  });

  it("never archives a canonical master, the root, an anchor, or a row with live dependants", () => {
    const canonical = planAssetRepairs({
      graph: base(),
      duplicates: [{ keepAssetId: "keep", duplicateAssetIds: [ROOT] }],
      identityOf: identity,
    });
    const withChild = planAssetRepairs({
      graph: graph([
        asset({ id: ROOT, isCanonical: true }),
        asset({ id: "keep" }),
        asset({ id: "dup" }),
        asset({ id: "child", parentAssetId: "dup" }),
      ]),
      duplicates: [{ keepAssetId: "keep", duplicateAssetIds: ["dup"] }],
      identityOf: identity,
    });
    const anchored = planAssetRepairs({
      graph: base(),
      duplicates: [{ keepAssetId: "keep", duplicateAssetIds: ["dup"] }],
      identityOf: identity,
      anchorAssetIds: ["dup"],
    });
    expect(dupProposals(canonical)).toHaveLength(0);
    expect(dupProposals(withChild)).toHaveLength(0);
    expect(dupProposals(anchored)).toHaveLength(0);
  });
});

describe("executeAssetRepairs", () => {
  const plan = (): RepairPlan => ({
    dryRun: true,
    proposals: [
      {
        action: "clear_transient_url",
        assetId: "a",
        before: "blob:http://x",
        after: "generated-images/a.png",
        destructive: false,
        reason: "test",
      },
      {
        action: "retry_unreferenced_object_cleanup",
        assetId: null,
        bucket: "generated-images",
        path: "orphan.png",
        before: "orphaned storage object",
        after: "removed",
        destructive: true,
        reason: "test",
      },
    ],
    skipped: [],
  });

  it("executes nothing by default", async () => {
    const apply = vi.fn();
    const r = await executeAssetRepairs(plan(), { execute: false, apply });
    expect(apply).not.toHaveBeenCalled();
    expect(r.executed).toEqual([]);
    expect(r.refused.every((x) => x.reason === "dry_run")).toBe(true);
  });

  it("refuses everything when no apply adapter is supplied", async () => {
    const r = await executeAssetRepairs(plan(), { execute: true });
    expect(r.executed).toEqual([]);
    expect(r.refused.every((x) => x.reason === "no_apply_adapter")).toBe(true);
  });

  it("refuses destructive proposals unless explicitly allowed", async () => {
    const r = await executeAssetRepairs(plan(), { execute: true, apply: async () => {} });
    expect(r.executed.map((p) => p.action)).toEqual(["clear_transient_url"]);
    expect(r.refused).toEqual([
      { proposal: plan().proposals[1], reason: "destructive_not_allowed" },
    ]);
  });

  it("records a failure and never reports later proposals as executed", async () => {
    const r = await executeAssetRepairs(plan(), {
      execute: true,
      allowDestructive: true,
      apply: async () => {
        throw new Error("storage down token=SECRET");
      },
    });
    expect(r.executed).toEqual([]);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0].error).not.toContain("SECRET");
    expect(r.notAttempted).toHaveLength(1);
  });

  it("redacts tokens in the execution log", async () => {
    const lines: string[] = [];
    await executeAssetRepairs(
      {
        dryRun: true,
        skipped: [],
        proposals: [
          {
            action: "clear_transient_url",
            assetId: "a",
            before: `${BASE}/storage/v1/object/sign/generated-images/a.png?token=SECRET`,
            after: "generated-images/a.png",
            destructive: false,
            reason: "test",
          },
        ],
      },
      { execute: true, apply: async () => {}, log: (l) => lines.push(l) },
    );
    expect(lines.join("\n")).not.toContain("SECRET");
    expect(lines.join("\n")).toContain("token=[redacted]");
  });
});
