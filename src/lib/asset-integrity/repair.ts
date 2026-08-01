/**
 * Turn 4A — narrowly scoped, dry-run-first repair operations.
 *
 * Nothing here executes by default. `planAssetRepairs` returns the exact
 * proposed changes; `executeAssetRepairs` refuses to run unless the caller
 * explicitly opts in AND supplies an executor. Ambiguous cases are never
 * repaired automatically.
 */
import { assetIssue, type AssetIssue } from "./errors";
import type { AssetGraph, AssetRecord } from "./model";
import { canonicalCandidates } from "./resolver";
import { assetOperationKey, type AssetOperationIdentity } from "./idempotency";
import { validateLineage } from "./promotion";
import {
  normalizeStorageObjectReference,
  redactStorageReference,
} from "./storage-reference";

export type RepairAction =
  | "clear_transient_url"
  | "relink_verified_object"
  | "select_only_canonical_candidate"
  | "archive_incomplete_duplicate"
  | "retry_unreferenced_object_cleanup";

export interface RepairProposal {
  action: RepairAction;
  assetId: string | null;
  bucket?: string | null;
  path?: string | null;
  /** Human-readable before → after, with tokens redacted. */
  before: string;
  after: string;
  destructive: boolean;
  reason: string;
}

export interface RepairPlan {
  dryRun: true;
  proposals: RepairProposal[];
  /** Cases deliberately left alone. */
  skipped: AssetIssue[];
}

export interface PlanRepairsInput {
  graph: AssetGraph;
  /** Objects confirmed to exist, as `bucket/path`. */
  verifiedObjects?: string[];
  /** Objects confirmed to have no live row reference. */
  confirmedUnreferencedObjects?: string[];
  /** Duplicate rows for the same operation, keyed by the surviving asset id. */
  duplicates?: { keepAssetId: string; duplicateAssetIds: string[] }[];
  /**
   * Verified operation identity per asset. Duplicate archiving is refused
   * unless keeper and duplicate resolve to the SAME identity.
   */
  identityOf?: (a: AssetRecord) => AssetOperationIdentity | null;
  /** Collection ids for which the root image is a Matching Collection anchor. */
  anchorAssetIds?: string[];
}

function identityOf(a: AssetRecord): string | null {
  return a.path ? `${a.bucket ?? "generated-images"}/${a.path}` : null;
}

export function planAssetRepairs(input: PlanRepairsInput): RepairPlan {
  const proposals: RepairProposal[] = [];
  const skipped: AssetIssue[] = [];
  const { graph } = input;

  // 1. Remove persisted transient/display URLs when a canonical path exists.
  for (const a of graph.assets) {
    if (!a.url) continue;
    const ref = normalizeStorageObjectReference(a.url, a.bucket ?? "generated-images");
    const transient = ref.isDisplayTransformation || ref.isLocal || ref.isSigned || ref.kind === "external";
    if (!transient) continue;
    if (!a.path) {
      skipped.push(
        assetIssue("ASSET_TRANSIENT_URL_REJECTED", "error", {
          assetId: a.id,
          message: "Transient URL persisted and no canonical storage path is known.",
          suggestedAction: "Manual review — do not guess a replacement object.",
        }),
      );
      continue;
    }
    proposals.push({
      action: "clear_transient_url",
      assetId: a.id,
      bucket: a.bucket,
      path: a.path,
      before: redactStorageReference(a.url).slice(0, 200),
      after: `${a.bucket ?? "generated-images"}/${a.path}`,
      destructive: false,
      reason: "Restore the canonical storage path as identity.",
    });
  }

  // 2. Relink a row whose object is missing to a verified object at its path.
  const verified = new Set(input.verifiedObjects ?? []);
  for (const a of graph.assets) {
    const id = identityOf(a);
    if (a.storageObjectExists === false && id && verified.has(id)) {
      proposals.push({
        action: "relink_verified_object",
        assetId: a.id,
        bucket: a.bucket,
        path: a.path,
        before: "storage object marked missing",
        after: id,
        destructive: false,
        reason: "Object exists and matches the recorded path.",
      });
    }
  }

  // 3. Select the ONLY valid canonical candidate when none is flagged.
  const flagged = graph.assets.filter((a) => a.isCanonical && !a.deletedAt && !a.archivedAt);
  if (flagged.length === 0) {
    const candidates = canonicalCandidates(graph);
    if (candidates.length === 1) {
      proposals.push({
        action: "select_only_canonical_candidate",
        assetId: candidates[0].id,
        bucket: candidates[0].bucket,
        path: candidates[0].path,
        before: "no canonical master",
        after: candidates[0].id,
        destructive: false,
        reason: "Exactly one valid candidate exists.",
      });
    } else if (candidates.length > 1) {
      skipped.push(
        assetIssue("ASSET_CANONICAL_CONFLICT", "error", {
          assetId: candidates[0].id,
          relatedAssetIds: candidates.slice(1).map((c) => c.id),
          message: "Several plausible masters — never guess.",
          suggestedAction: "Choose the canonical master manually.",
        }),
      );
    }
  } else if (flagged.length > 1) {
    skipped.push(...validateLineage(graph).ambiguous);
  }

  // 4. Archive incomplete duplicates (non-destructive) — heavily gated.
  const anchorIds = new Set(input.anchorAssetIds ?? []);
  const liveChildrenOf = (id: string) =>
    graph.assets.filter((a) => a.parentAssetId === id && !a.deletedAt && !a.archivedAt);

  for (const dup of input.duplicates ?? []) {
    const keeper = graph.assets.find((a) => a.id === dup.keepAssetId) ?? null;
    if (!keeper) {
      skipped.push(
        assetIssue("ASSET_DUPLICATE_OPERATION", "warning", {
          assetId: dup.keepAssetId,
          message: "Duplicate repair refused: the keeper asset does not exist.",
          suggestedAction: "Manual review.",
        }),
      );
      continue;
    }
    const keeperIdentity = input.identityOf?.(keeper) ?? null;

    for (const id of dup.duplicateAssetIds) {
      const duplicate = graph.assets.find((a) => a.id === id) ?? null;
      const refuse = (message: string) =>
        skipped.push(
          assetIssue("ASSET_DUPLICATE_OPERATION", "warning", {
            assetId: id,
            relatedAssetIds: [dup.keepAssetId],
            message,
            suggestedAction: "Manual review — never auto-archive.",
          }),
        );

      if (!duplicate) {
        refuse("Duplicate repair refused: the duplicate asset does not exist.");
        continue;
      }
      if (!input.identityOf || !keeperIdentity) {
        refuse("Duplicate repair refused: no verified operation identity was supplied.");
        continue;
      }
      const dupIdentity = input.identityOf(duplicate);
      if (!dupIdentity || assetOperationKey(dupIdentity) !== assetOperationKey(keeperIdentity)) {
        refuse("Duplicate repair refused: keeper and duplicate are different operations.");
        continue;
      }
      if (duplicate.isCanonical) {
        refuse("Duplicate repair refused: the asset is the canonical master.");
        continue;
      }
      if (graph.rootImageId && duplicate.id === graph.rootImageId) {
        refuse("Duplicate repair refused: the asset is the root image.");
        continue;
      }
      if (liveChildrenOf(duplicate.id).length > 0) {
        refuse("Duplicate repair refused: the asset has live dependants.");
        continue;
      }
      if (anchorIds.has(duplicate.id)) {
        refuse("Duplicate repair refused: the asset is a Matching Collection anchor.");
        continue;
      }

      proposals.push({
        action: "archive_incomplete_duplicate",
        assetId: id,
        before: "live duplicate row",
        after: "archived",
        destructive: false,
        reason: `Duplicate of ${dup.keepAssetId} for the same verified operation identity.`,
      });
    }
  }

  // 5. Retry cleanup of confirmed-unreferenced objects (destructive).
  for (const obj of input.confirmedUnreferencedObjects ?? []) {
    const stillReferenced = graph.assets.some((a) => !a.deletedAt && identityOf(a) === obj);
    if (stillReferenced) {
      const [bucket, ...rest] = obj.split("/");
      skipped.push(
        assetIssue("ASSET_STORAGE_CLEANUP_FAILED", "warning", {
          bucket,
          path: rest.join("/"),
          message: "Object is still referenced by a live row; cleanup refused.",
        }),
      );
      continue;
    }
    const [bucket, ...rest] = obj.split("/");
    proposals.push({
      action: "retry_unreferenced_object_cleanup",
      assetId: null,
      bucket,
      path: rest.join("/"),
      before: "orphaned storage object",
      after: "removed",
      destructive: true,
      reason: "Confirmed unreferenced by every live row.",
    });
  }

  return { dryRun: true, proposals, skipped };
}

export interface RepairExecutionOptions {
  /** Must be explicitly true; dry-run is the default everywhere. */
  execute: boolean;
  /** Required separately for destructive proposals. */
  allowDestructive?: boolean;
  apply?: (proposal: RepairProposal) => Promise<void>;
  log?: (line: string) => void;
}

export interface RepairExecutionResult {
  executed: RepairProposal[];
  refused: { proposal: RepairProposal; reason: string }[];
  failed: { proposal: RepairProposal; error: string }[];
  /** Proposals never attempted because an earlier one failed. */
  notAttempted: RepairProposal[];
}

export async function executeAssetRepairs(
  plan: RepairPlan,
  options: RepairExecutionOptions,
): Promise<RepairExecutionResult> {
  const executed: RepairProposal[] = [];
  const refused: { proposal: RepairProposal; reason: string }[] = [];
  const failed: { proposal: RepairProposal; error: string }[] = [];
  const notAttempted: RepairProposal[] = [];

  if (!options.execute) {
    return {
      executed,
      refused: plan.proposals.map((p) => ({ proposal: p, reason: "dry_run" })),
      failed,
      notAttempted: [...plan.proposals],
    };
  }
  if (!options.apply) {
    return {
      executed,
      refused: plan.proposals.map((p) => ({ proposal: p, reason: "no_apply_adapter" })),
      failed,
      notAttempted: [...plan.proposals],
    };
  }

  for (let i = 0; i < plan.proposals.length; i += 1) {
    const p = plan.proposals[i];
    if (p.destructive && !options.allowDestructive) {
      refused.push({ proposal: p, reason: "destructive_not_allowed" });
      continue;
    }
    try {
      await options.apply(p);
    } catch (err) {
      failed.push({ proposal: p, error: redactStorageReference(String(err)) });
      // Never report subsequent proposals as executed after a failure.
      notAttempted.push(...plan.proposals.slice(i + 1));
      return { executed, refused, failed, notAttempted };
    }
    executed.push(p);
    options.log?.(
      `[asset-repair] ${p.action} asset=${p.assetId ?? "-"} ` +
        `before=${redactStorageReference(p.before)} after=${redactStorageReference(p.after)}`,
    );
  }
  return { executed, refused, failed, notAttempted };
}
