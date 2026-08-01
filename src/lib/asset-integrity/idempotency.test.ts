import { describe, it, expect } from "vitest";
import {
  assetOperationKey,
  decideIdempotentPersist,
  planCompensation,
  type AssetOperationIdentity,
} from "./idempotency";
import type { AssetRecord } from "./model";

const ROOT = "root-1";

function asset(over: Partial<AssetRecord> & { id: string }): AssetRecord {
  return {
    rootImageId: ROOT,
    parentAssetId: null,
    role: "upscaled_master",
    bucket: "generated-images",
    path: `${over.id}.png`,
    width: 4000,
    height: 5000,
    ...over,
  } as AssetRecord;
}

const OP: AssetOperationIdentity = {
  type: "upscale",
  generationJobItemId: "item-1",
  sourceAssetId: "src-1",
  upscaleRecipe: "esrgan-2x",
};

const decide = (existing: AssetRecord[], identityOf = () => OP) =>
  decideIdempotentPersist({ operation: OP, existing, identityOf });

describe("assetOperationKey", () => {
  it("is deterministic for identical operations", () => {
    expect(assetOperationKey(OP)).toBe(assetOperationKey({ ...OP }));
  });

  it("changes when any identity component changes", () => {
    const keys = new Set([
      assetOperationKey(OP),
      assetOperationKey({ ...OP, type: "generation" }),
      assetOperationKey({ ...OP, sourceAssetId: "src-2" }),
      assetOperationKey({ ...OP, upscaleRecipe: "esrgan-4x" }),
      assetOperationKey({ ...OP, outputVersion: 2 }),
      assetOperationKey({ ...OP, targetFormat: "50x70" }),
    ]);
    expect(keys.size).toBe(6);
  });

  it("distinguishes different crop boxes for format derivatives", () => {
    const a: AssetOperationIdentity = {
      type: "format_derivative",
      sourceAssetId: "s",
      targetFormat: "A2",
      cropBox: { x: 0, y: 0, width: 100, height: 200 },
    };
    const b = { ...a, cropBox: { x: 10, y: 0, width: 100, height: 200 } };
    expect(assetOperationKey(a)).not.toBe(assetOperationKey(b));
    // sub-pixel jitter is normalized, so it does not fork the identity
    expect(assetOperationKey({ ...a, cropBox: { x: 0.2, y: 0, width: 100, height: 200 } })).toBe(
      assetOperationKey(a),
    );
  });
});

describe("decideIdempotentPersist", () => {
  it("creates when nothing matches", () => {
    expect(decide([]).action).toBe("create");
    expect(decide([asset({ id: "x" })], () => null as never).action).toBe("create");
  });

  it("reuses a complete, verified asset", () => {
    const d = decide([asset({ id: "a", storageObjectExists: true })]);
    expect(d).toMatchObject({ action: "reuse", existingAssetId: "a" });
  });

  it("ignores soft-deleted matches", () => {
    expect(decide([asset({ id: "a", deletedAt: "2026-01-01" })]).action).toBe("create");
  });

  it("never reuses an asset whose storage object is known missing", () => {
    const d = decide([asset({ id: "a", storageObjectExists: false })]);
    expect(d.action).toBe("create");
    expect(d.issues[0].code).toBe("ASSET_STORAGE_OBJECT_MISSING");
  });

  it("never reuses an asset with zero, negative or partial dimensions", () => {
    expect(decide([asset({ id: "a", width: 0, height: 100 })]).action).toBe("create");
    expect(decide([asset({ id: "b", width: -10, height: 100 })]).action).toBe("create");
    expect(decide([asset({ id: "c", width: 100, height: null })]).action).toBe("create");
  });

  it("treats unknown dimensions as reusable only when existence is verified", () => {
    expect(decide([asset({ id: "a", width: null, height: null })]).action).toBe("create");
    expect(
      decide([asset({ id: "a", width: null, height: null, storageObjectExists: true })]).action,
    ).toBe("reuse");
  });

  it("never reuses a row without a storage path or an archived row", () => {
    expect(decide([asset({ id: "a", path: null })]).action).toBe("create");
    expect(decide([asset({ id: "a", archivedAt: "2026-01-01" })]).action).toBe("create");
  });

  it("warns about duplicates while still reusing one asset", () => {
    const d = decide([
      asset({ id: "a", storageObjectExists: true }),
      asset({ id: "b", storageObjectExists: true }),
    ]);
    expect(d.action).toBe("reuse");
    expect(d.issues.some((i) => i.code === "ASSET_DUPLICATE_OPERATION")).toBe(true);
  });
});

describe("planCompensation", () => {
  const stages = [
    "upload_ok_db_failed",
    "db_ok_object_missing",
    "parent_ok_child_link_failed",
    "canonical_promotion_failed",
  ] as const;

  it("never claims database/storage atomicity", () => {
    for (const stage of stages) {
      expect(planCompensation({ stage }).atomicityGuaranteed).toBe(false);
    }
  });

  it("deletes an uploaded object only when no row references it", () => {
    const safe = planCompensation({
      stage: "upload_ok_db_failed",
      bucket: "generated-images",
      path: "a.png",
      referencingRowCount: 0,
    });
    expect(safe.steps[0]).toMatchObject({ action: "delete_unreferenced_object", safe: true });

    const shared = planCompensation({
      stage: "upload_ok_db_failed",
      bucket: "generated-images",
      path: "a.png",
      referencingRowCount: 1,
    });
    expect(shared.steps[0]).toMatchObject({ action: "manual_review", safe: false });
    expect(shared.issues[0].code).toBe("ASSET_STORAGE_CLEANUP_FAILED");
  });

  it("reports a broken asset instead of silently falling back", () => {
    const p = planCompensation({ stage: "db_ok_object_missing", assetId: "a" });
    expect(p.recoverable).toBe(false);
    expect(p.steps.map((s) => s.action)).toEqual(["report_broken_asset"]);
    expect(p.issues[0].code).toBe("ASSET_STORAGE_OBJECT_MISSING");
  });

  it("keeps the previous canonical master when linkage or promotion fails", () => {
    const child = planCompensation({
      stage: "parent_ok_child_link_failed",
      assetId: "child",
      previousCanonicalAssetId: "prev",
    });
    expect(child.steps[0]).toMatchObject({ action: "keep_previous_canonical", assetId: "prev" });
    expect(child.recoverable).toBe(true);

    const promo = planCompensation({
      stage: "canonical_promotion_failed",
      previousCanonicalAssetId: "prev",
    });
    expect(promo.steps[0]).toMatchObject({ action: "keep_previous_canonical", assetId: "prev" });
  });
});
