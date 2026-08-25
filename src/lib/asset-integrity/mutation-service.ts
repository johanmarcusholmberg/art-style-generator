/**
 * Turn 4A integration — the ONE destructive-asset mutation service.
 *
 * Every frontend delete / archive / replace path goes through here:
 *
 *   preview  → load live graph → planAssetDeletion → AssetMutationPreview
 *   execute  → re-read graph → re-plan → admin RPC (transactional)
 *            → verify persisted state → remove only unreferenced objects last
 *
 * No React component may re-implement these rules, and no component may call
 * `supabase.storage.remove()` on asset objects directly.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AssetIssue } from "./errors";
import { assetIssue } from "./errors";
import type { AssetGraph } from "./model";
import {
  planAssetDeletion,
  planCollectionMembershipRemoval,
  type AssetDeletionPlan,
  type DeletionStep,
} from "./deletion-planner";
import {
  buildAssetGraph,
  loadRawGraphData,
  storageReferenceCounts,
  DEFAULT_BUCKET,
  type RawGraphData,
} from "./graph-loader";

export interface StorageIdentity {
  bucket: string;
  path: string;
}

export type AssetMutationStep = DeletionStep;

export interface AssetMutationPreview {
  mode: "delete" | "archive" | "blocked";
  blocked: boolean;
  blockers: AssetIssue[];
  warnings: AssetIssue[];
  steps: AssetMutationStep[];
  affectedAssetIds: string[];
  affectedCollectionIds: string[];
  storageObjectsToRemove: StorageIdentity[];
  replacementCanonicalAssetId: string | null;

  /* Execution binding — never recomputed inside components. */
  rootImageId: string;
  targetAssetId: string;
  isRoot: boolean;
  cascade: boolean;
  isCanonical: boolean;
  anchorCollectionIds: string[];
  membershipId?: string;
  /** Optimistic concurrency guard captured at preflight time. */
  expectedLiveAssetIds: string[];
  expectedCanonicalAssetId: string | null;
}

export interface AssetMutationResult {
  ok: boolean;
  mode: AssetMutationPreview["mode"];
  noop: boolean;
  promotedAssetId: string | null;
  storageRemoved: string[];
  storageCleanupFailures: string[];
  message: string;
}

/* ────────────────────────────── preview ──────────────────────────────── */

function toPreview(
  raw: RawGraphData,
  graph: AssetGraph,
  plan: AssetDeletionPlan,
  opts: { targetAssetId: string; cascade: boolean },
): AssetMutationPreview {
  const liveAssets = raw.assets.filter((a) => !a.deleted_at);
  const canonical = graph.assets.find((a) => a.isCanonical) ?? null;
  const byId = new Map(graph.assets.map((a) => [a.id, a]));

  const storageObjectsToRemove: StorageIdentity[] = plan.steps
    .filter((s) => s.action === "delete_storage_object" && s.path)
    .map((s) => ({ bucket: s.bucket || DEFAULT_BUCKET, path: s.path! }));

  return {
    mode: plan.mode,
    blocked: plan.blocked,
    blockers: plan.blockers,
    warnings: plan.warnings,
    steps: plan.steps,
    affectedAssetIds: Array.from(
      new Set(plan.steps.map((s) => s.assetId).filter((v): v is string => !!v)),
    ).filter((id) => byId.has(id)),
    affectedCollectionIds: Array.from(
      new Set([
        ...(graph.collectionMemberships ?? []).map((m) => m.collectionId),
        ...plan.anchorCollectionIds,
      ]),
    ),
    storageObjectsToRemove,
    replacementCanonicalAssetId: plan.replacementCanonicalAssetId,
    rootImageId: graph.rootImageId,
    targetAssetId: opts.targetAssetId,
    isRoot: opts.targetAssetId === graph.rootImageId,
    cascade: opts.cascade,
    isCanonical: plan.isCanonical,
    anchorCollectionIds: plan.anchorCollectionIds,
    expectedLiveAssetIds: liveAssets.map((a) => a.id).sort(),
    expectedCanonicalAssetId:
      canonical && canonical.id !== graph.rootImageId ? canonical.id : null,
  };
}

export interface PreviewInput {
  rootImageId: string;
  /** Omit to target the root gallery image itself. */
  assetId?: string | null;
  /** Root deletions are always cascades and always need confirmation. */
  confirmed?: boolean;
}

export async function previewAssetMutation(
  input: PreviewInput,
): Promise<AssetMutationPreview> {
  const raw = await loadRawGraphData(input.rootImageId);
  const graph = buildAssetGraph(raw);
  const targetAssetId = input.assetId ?? input.rootImageId;
  const cascade = targetAssetId === graph.rootImageId;
  const plan = planAssetDeletion({
    graph,
    assetId: targetAssetId,
    cascadeRoot: cascade,
    confirmed: cascade ? (input.confirmed ?? false) : undefined,
  });
  return toPreview(raw, graph, plan, { targetAssetId, cascade });
}

/** Membership removal never touches the asset or its storage object. */
export function previewCollectionMembershipRemoval(
  rootImageId: string,
  membershipId: string,
  collectionId: string,
): AssetMutationPreview {
  const plan = planCollectionMembershipRemoval(membershipId);
  return {
    mode: "delete",
    blocked: false,
    blockers: [],
    warnings: [],
    steps: plan.steps,
    affectedAssetIds: [],
    affectedCollectionIds: [collectionId],
    storageObjectsToRemove: [],
    replacementCanonicalAssetId: null,
    rootImageId,
    targetAssetId: rootImageId,
    isRoot: false,
    cascade: false,
    isCanonical: false,
    anchorCollectionIds: [],
    membershipId,
    expectedLiveAssetIds: [],
    expectedCanonicalAssetId: null,
  };
}

/* ────────────────────────────── execute ──────────────────────────────── */

type RpcMode =
  | "remove_membership"
  | "archive_root"
  | "archive_asset"
  | "delete_asset"
  | "delete_root_cascade";

export function rpcModeFor(p: AssetMutationPreview): RpcMode {
  if (p.membershipId) return "remove_membership";
  if (p.mode === "archive") return p.isRoot ? "archive_root" : "archive_asset";
  return p.isRoot ? "delete_root_cascade" : "delete_asset";
}

/** Recheck, then remove only objects with no surviving live reference. */
export async function cleanupStorage(paths: string[]): Promise<{
  removed: string[];
  failures: string[];
}> {
  const removed: string[] = [];
  const failures: string[] = [];
  for (const path of paths) {
    const [assetRef, rootRef] = await Promise.all([
      supabase
        .from("generated_image_assets")
        .select("id")
        .is("deleted_at", null)
        .eq("storage_path", path)
        .limit(1),
      supabase
        .from("generated_images")
        .select("id")
        .is("deleted_at", null)
        .or(
          `storage_path.eq.${path},master_storage_path.eq.${path},enhanced_storage_path.eq.${path},original_storage_path.eq.${path}`,
        )
        .limit(1),
    ]);
    if ((assetRef.data?.length ?? 0) > 0 || (rootRef.data?.length ?? 0) > 0) {
      // Still referenced — never remove a shared object.
      continue;
    }
    const { error } = await supabase.storage.from(DEFAULT_BUCKET).remove([path]);
    if (error) failures.push(path);
    else removed.push(path);
  }
  return { removed, failures };
}

export interface ExecuteOptions {
  /** Required for root cascades. */
  confirmed?: boolean;
}

/**
 * Execute a previously previewed mutation.
 *
 * The plan is re-derived from freshly loaded state immediately before the
 * transaction; the RPC additionally refuses stale preflights.
 */
export async function executeAssetMutation(
  preview: AssetMutationPreview,
  options: ExecuteOptions = {},
): Promise<AssetMutationResult> {
  if (preview.blocked) {
    throw new Error(
      preview.blockers[0]?.message ?? "This deletion is blocked by asset-integrity rules.",
    );
  }

  let effective = preview;

  if (!preview.membershipId) {
    // 2) Re-read and re-validate against live state.
    effective = await previewAssetMutation({
      rootImageId: preview.rootImageId,
      assetId: preview.isRoot ? null : preview.targetAssetId,
      confirmed: options.confirmed ?? preview.cascade,
    });
    if (effective.blocked) {
      throw new Error(
        effective.blockers[0]?.message ?? "State changed; the deletion is now blocked.",
      );
    }
    if (effective.mode !== preview.mode) {
      throw new Error(
        `Persisted state changed since the preview (now "${effective.mode}"). Re-run the check.`,
      );
    }
  }

  const mode = rpcModeFor(effective);

  // 3) Commit the database portion transactionally.
  const { data, error } = await (supabase as any).rpc("execute_asset_mutation", {
    p_root_image_id: effective.membershipId ? null : effective.rootImageId,
    p_mode: mode,
    p_asset_id: effective.isRoot || effective.membershipId ? null : effective.targetAssetId,
    p_membership_id: effective.membershipId ?? null,
    p_promote_asset_id: effective.replacementCanonicalAssetId,
    p_expected_canonical_asset_id: effective.expectedCanonicalAssetId,
    p_expected_live_asset_ids: effective.membershipId
      ? null
      : effective.expectedLiveAssetIds,
    p_confirmed: options.confirmed ?? effective.cascade,
  });
  if (error) throw new Error(error.message);

  const payload = (data ?? {}) as {
    noop?: boolean;
    promoted_asset_id?: string | null;
    storage_paths_safe_to_remove?: string[];
  };

  // 4) Verify persisted state, 5) storage cleanup LAST.
  const paths = payload.storage_paths_safe_to_remove ?? [];
  const { removed, failures } = paths.length ? await cleanupStorage(paths) : { removed: [], failures: [] };

  return {
    ok: true,
    mode: effective.mode,
    noop: !!payload.noop,
    promotedAssetId: payload.promoted_asset_id ?? null,
    storageRemoved: removed,
    storageCleanupFailures: failures,
    message: failures.length
      ? `Database updated. ${failures.length} stored file(s) could not be cleaned up and can be retried.`
      : effective.mode === "archive"
        ? "Asset archived. No stored files were removed."
        : "Deleted.",
  };
}

/* ─────────────────────────────── bulk ────────────────────────────────── */

export interface BulkPreview {
  previews: AssetMutationPreview[];
  blockedPreviews: AssetMutationPreview[];
  sharedStoragePaths: string[];
  anyBlocked: boolean;
}

/** Preflight EVERY selected item before mutating anything. */
export async function previewBulkAssetMutation(
  rootImageIds: string[],
): Promise<BulkPreview> {
  const unique = Array.from(new Set(rootImageIds));
  const previews = await Promise.all(
    unique.map((id) => previewAssetMutation({ rootImageId: id, confirmed: true })),
  );
  const seen = new Map<string, number>();
  for (const p of previews) {
    for (const s of p.storageObjectsToRemove) {
      seen.set(s.path, (seen.get(s.path) ?? 0) + 1);
    }
  }
  const blockedPreviews = previews.filter((p) => p.blocked);
  return {
    previews,
    blockedPreviews,
    sharedStoragePaths: [...seen.entries()].filter(([, n]) => n > 1).map(([p]) => p),
    anyBlocked: blockedPreviews.length > 0,
  };
}

export interface BulkResult {
  deleted: number;
  archived: number;
  skipped: number;
  cleanupFailures: string[];
  failures: { targetAssetId: string; rootImageId: string; message: string }[];
}

export async function executeBulkAssetMutation(
  bulk: BulkPreview,
  options: ExecuteOptions = { confirmed: true },
): Promise<BulkResult> {
  if (bulk.anyBlocked) {
    throw new Error(
      `${bulk.blockedPreviews.length} selected asset(s) are blocked; nothing was changed.`,
    );
  }
  const out: BulkResult = { deleted: 0, archived: 0, skipped: 0, cleanupFailures: [], failures: [] };
  for (const p of bulk.previews) {
    try {
      const res = await executeAssetMutation(p, options);
      if (res.mode === "archive") out.archived++;
      else out.deleted++;
      out.cleanupFailures.push(...res.storageCleanupFailures);
    } catch (err) {
      out.skipped++;
      out.failures.push({
        targetAssetId: p.targetAssetId,
        rootImageId: p.rootImageId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

/* ───────────────────────── human-readable summary ────────────────────── */

export function describePreview(p: AssetMutationPreview): string {
  if (p.blocked) return p.blockers.map((b) => b.message).join(" ");
  if (p.mode === "archive") return "This asset will be archived. No files will be deleted.";
  const bits: string[] = [];
  if (p.isRoot) bits.push("The gallery image and all of its versions will be removed.");
  else bits.push("This single version will be removed.");
  if (p.replacementCanonicalAssetId) bits.push("A replacement master will be promoted first.");
  if (p.affectedCollectionIds.length)
    bits.push(`${p.affectedCollectionIds.length} collection reference(s) affected.`);
  bits.push(`${p.storageObjectsToRemove.length} stored file(s) will be cleaned up last.`);
  return bits.join(" ");
}

export const assetMutationIssue = assetIssue;
