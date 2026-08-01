/**
 * Turn 4A — dependent deletion protection.
 *
 * `planAssetDeletion` is pure and read-only: it produces an ordered plan and
 * an explicit blocked/allowed verdict. Nothing here performs I/O, so the
 * dangerous decisions are fully unit-testable.
 *
 * Defaults are conservative: when lineage is uncertain we archive.
 */
import { assetIssue, type AssetIssue } from "./errors";
import { isUsableAsset, type AssetGraph, type AssetRecord } from "./model";
import { canonicalCandidates } from "./resolver";
import { detectCycles, evaluateCanonicalPromotion } from "./promotion";

export type DeletionStepAction =
  | "archive_row"
  | "soft_delete_row"
  | "delete_storage_object"
  | "remove_collection_membership"
  | "promote_replacement_canonical";

export interface DeletionStep {
  action: DeletionStepAction;
  assetId?: string | null;
  bucket?: string | null;
  path?: string | null;
  reason: string;
}

export interface AssetDeletionPlan {
  assetId: string;
  /** Requested mode after safety analysis. */
  mode: "delete" | "archive" | "blocked";
  blocked: boolean;
  isCanonical: boolean;
  replacementCanonicalAssetId: string | null;
  childAssetIds: string[];
  collectionMembershipIds: string[];
  anchorCollectionIds: string[];
  generationJobItemIds: string[];
  referencingRowCount: number;
  /** How many live rows share the same storage object. */
  storageObjectReferenceCount: number;
  steps: DeletionStep[];
  blockers: AssetIssue[];
  warnings: AssetIssue[];
}

export interface PlanAssetDeletionInput {
  graph: AssetGraph;
  assetId: string;
  /** Explicitly cascade the root image and every dependant. */
  cascadeRoot?: boolean;
  /** Required for cascade — an explicit user confirmation. */
  confirmed?: boolean;
}

function childrenOf(graph: AssetGraph, id: string): AssetRecord[] {
  return graph.assets.filter((a) => a.parentAssetId === id && isUsableAsset(a));
}

function descendantsOf(graph: AssetGraph, id: string): AssetRecord[] {
  const out: AssetRecord[] = [];
  const stack = [id];
  const seen = new Set<string>([id]);
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of childrenOf(graph, cur)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
      stack.push(c.id);
    }
  }
  return out;
}

export function planAssetDeletion(input: PlanAssetDeletionInput): AssetDeletionPlan {
  const { graph, assetId } = input;
  const blockers: AssetIssue[] = [];
  const warnings: AssetIssue[] = [];
  const steps: DeletionStep[] = [];

  const asset = graph.assets.find((a) => a.id === assetId) ?? null;
  const children = asset ? childrenOf(graph, assetId) : [];
  const descendants = asset ? descendantsOf(graph, assetId) : [];
  /**
   * Collection memberships and Matching Collection anchors always reference
   * the ROOT gallery image, never a child asset. Scoping them here keeps a
   * child deletion from touching root-level references.
   */
  const isRoot = !!asset && !!graph.rootImageId && asset.id === graph.rootImageId;
  const memberships = isRoot ? (graph.collectionMemberships ?? []) : [];
  const anchors = isRoot ? (graph.anchorReferences ?? []) : [];

  const base: AssetDeletionPlan = {
    assetId,
    mode: "blocked",
    blocked: true,
    isCanonical: false,
    replacementCanonicalAssetId: null,
    childAssetIds: children.map((c) => c.id),
    collectionMembershipIds: memberships.map((m) => m.membershipId),
    anchorCollectionIds: anchors.map((a) => a.collectionId),
    generationJobItemIds: asset?.generationJobItemId ? [asset.generationJobItemId] : [],
    referencingRowCount: children.length + memberships.length + anchors.length,
    storageObjectReferenceCount: 0,
    steps,
    blockers,
    warnings,
  };

  if (!asset) {
    blockers.push(
      assetIssue("ASSET_CANONICAL_MISSING", "error", { assetId, message: "Asset not found." }),
    );
    return base;
  }

  // A lineage cycle makes dependants unknowable — never destroy anything.
  const cycleIds = detectCycles(graph.assets);
  if (cycleIds.includes(asset.id) || (input.cascadeRoot && cycleIds.length > 0)) {
    blockers.push(
      assetIssue("ASSET_LINEAGE_CYCLE", "error", {
        assetId,
        relatedAssetIds: cycleIds.filter((id) => id !== assetId),
        message: "Lineage contains a cycle; dependants cannot be determined safely.",
        suggestedAction: "Repair the lineage before deleting anything.",
      }),
    );
    return base;
  }

  // How many live rows share this exact storage object?
  const identity = asset.path ? `${asset.bucket ?? "generated-images"}/${asset.path}` : null;
  const sharing = identity
    ? graph.assets.filter(
        (a) => isUsableAsset(a) && a.path && `${a.bucket ?? "generated-images"}/${a.path}` === identity,
      )
    : [];
  base.storageObjectReferenceCount = sharing.length;

  const canonical = graph.assets.find((a) => a.isCanonical && isUsableAsset(a)) ?? null;
  base.isCanonical = canonical?.id === asset.id;

  /* ── Cascade root deletion ─────────────────────────────────────────── */
  if (input.cascadeRoot) {
    if (!isRoot) {
      blockers.push(
        assetIssue("ASSET_DELETE_BLOCKED_DEPENDANTS", "error", {
          assetId,
          message: "Cascade refused: the selected asset is not the identified graph root.",
          suggestedAction: "Cascade only from the root gallery image.",
        }),
      );
      return base;
    }

    if (!input.confirmed) {
      blockers.push(
        assetIssue("ASSET_DELETE_BLOCKED_DEPENDANTS", "error", {
          assetId,
          relatedAssetIds: descendants.map((d) => d.id),
          message: "Cascade deletion of a root asset requires explicit confirmation.",
          suggestedAction: "Re-run with confirmation.",
        }),
      );
      return base;
    }
    for (const m of memberships) {
      steps.push({
        action: "remove_collection_membership",
        assetId,
        reason: `Remove membership ${m.membershipId} (the asset itself is deleted separately).`,
      });
    }
    for (const d of [...descendants].reverse()) {
      steps.push({ action: "soft_delete_row", assetId: d.id, reason: "Dependant of the cascaded root." });
    }
    steps.push({ action: "soft_delete_row", assetId: asset.id, reason: "Root asset cascade delete." });
    // Storage cleanup last, and only for objects no live row still references.
    for (const a of [...descendants, asset]) {
      const id = a.path ? `${a.bucket ?? "generated-images"}/${a.path}` : null;
      if (!id) continue;
      const stillReferenced = graph.assets.some(
        (o) =>
          isUsableAsset(o) &&
          o.id !== a.id &&
          !descendants.some((d) => d.id === o.id) &&
          o.id !== asset.id &&
          o.path &&
          `${o.bucket ?? "generated-images"}/${o.path}` === id,
      );
      if (stillReferenced) {
        warnings.push(
          assetIssue("ASSET_STORAGE_CLEANUP_FAILED", "warning", {
            assetId: a.id,
            bucket: a.bucket,
            path: a.path,
            message: "Shared storage object kept — another live row references it.",
          }),
        );
        continue;
      }
      steps.push({
        action: "delete_storage_object",
        assetId: a.id,
        bucket: a.bucket,
        path: a.path,
        reason: "No live row references this object after the cascade.",
      });
    }
    return { ...base, mode: "delete", blocked: false, steps, blockers, warnings };
  }

  /* ── Single-asset deletion ─────────────────────────────────────────── */
  if (base.isCanonical) {
    // A replacement must independently pass the promotion gate — candidate
    // ranking alone is not enough (lower resolution, derivatives, transient
    // or missing objects must all be rejected here too).
    let replacementId: string | null = null;
    let lastBlockers: AssetIssue[] = [];
    for (const c of canonicalCandidates(graph)) {
      if (c.id === asset.id) continue;
      const decision = evaluateCanonicalPromotion({ graph, candidateAssetId: c.id });
      if (decision.allowed) {
        replacementId = c.id;
        break;
      }
      lastBlockers = decision.blockers;
    }
    base.replacementCanonicalAssetId = replacementId;
    if (!replacementId) {
      blockers.push(
        assetIssue("ASSET_DELETE_BLOCKED_CANONICAL", "error", {
          assetId,
          suggestedAction: "Promote another valid canonical master, or cascade-delete the root image.",
        }),
        ...lastBlockers,
      );
      return base;
    }
    steps.push({
      action: "promote_replacement_canonical",
      assetId: replacementId,
      reason: "A valid canonical master must exist before the current one is removed.",
    });
  }


  if (children.length > 0) {
    blockers.push(
      assetIssue("ASSET_DELETE_BLOCKED_DEPENDANTS", "error", {
        assetId,
        relatedAssetIds: children.map((c) => c.id),
        suggestedAction: "Delete or re-parent the dependent derivatives first, or cascade the root.",
      }),
    );
    return base;
  }

  if (anchors.length > 0) {
    warnings.push(
      assetIssue("ASSET_DELETE_BLOCKED_DEPENDANTS", "warning", {
        assetId,
        message: "Asset is referenced as a Matching Collection anchor; archiving instead of deleting.",
      }),
    );
    steps.push({ action: "archive_row", assetId, reason: "Anchor reference makes deletion unsafe." });
    return { ...base, mode: "archive", blocked: false, steps, blockers, warnings };
  }

  // Uncertain lineage → archive rather than destroy.
  const lineageUncertain =
    (!!asset.parentAssetId && !graph.assets.some((a) => a.id === asset.parentAssetId)) ||
    (asset.rootImageId != null && asset.rootImageId !== graph.rootImageId);
  if (lineageUncertain) {
    warnings.push(
      assetIssue("ASSET_LINEAGE_INVALID", "warning", {
        assetId,
        message: "Lineage is uncertain; defaulting to archive.",
      }),
    );
    steps.push({ action: "archive_row", assetId, reason: "Uncertain lineage." });
    return { ...base, mode: "archive", blocked: false, steps, blockers, warnings };
  }

  steps.push({ action: "soft_delete_row", assetId, reason: "No live dependants." });
  if (base.storageObjectReferenceCount > 1) {
    warnings.push(
      assetIssue("ASSET_STORAGE_CLEANUP_FAILED", "warning", {
        assetId,
        bucket: asset.bucket,
        path: asset.path,
        message: "Storage object is shared with another live row and will not be deleted.",
      }),
    );
  } else if (asset.path) {
    steps.push({
      action: "delete_storage_object",
      assetId,
      bucket: asset.bucket,
      path: asset.path,
      reason: "Object is referenced only by this row.",
    });
  }

  return { ...base, mode: "delete", blocked: false, steps, blockers, warnings };
}

/** Removing a collection membership must never touch the underlying asset. */
export function planCollectionMembershipRemoval(membershipId: string): AssetDeletionPlan {
  return {
    assetId: membershipId,
    mode: "delete",
    blocked: false,
    isCanonical: false,
    replacementCanonicalAssetId: null,
    childAssetIds: [],
    collectionMembershipIds: [membershipId],
    anchorCollectionIds: [],
    generationJobItemIds: [],
    referencingRowCount: 0,
    storageObjectReferenceCount: 0,
    steps: [
      {
        action: "remove_collection_membership",
        reason: "Membership removal never deletes the underlying asset or storage object.",
      },
    ],
    blockers: [],
    warnings: [],
  };
}
