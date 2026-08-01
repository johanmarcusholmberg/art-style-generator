/**
 * Turn 4A — shared asset identity resolver.
 *
 * Pure. Given a lineage graph (and optionally a focused asset), it returns the
 * single authoritative answer for "what is the canonical master, where does it
 * live, and is this lineage trustworthy?".
 *
 * Frozen contracts respected here:
 *   - render/image URLs are display-only and never a canonical source
 *   - signed / blob: / data: / external provider URLs are never identity
 *   - stable IDs + storage paths beat URL string comparison
 *   - a valid canonical master is never silently downgraded
 */
import { assetIssue, type AssetIssue } from "./errors";
import {
  hasValidDimensions,
  isUsableAsset,
  type AssetGraph,
  type AssetLifecycleRole,
  type AssetRecord,
} from "./model";
import {
  normalizeStorageObjectReference,
  isTransientAssetReference,
} from "./storage-reference";
import { detectCycles } from "./promotion";

export interface AssetIdentityResolution {
  galleryAssetId: string | null;
  currentAssetId: string | null;
  canonicalMasterAssetId: string | null;
  canonicalMasterUrl: string | null;
  canonicalBucket: string | null;
  canonicalPath: string | null;
  originalAssetId: string | null;
  parentAssetId: string | null;
  rootAssetId: string | null;
  generationJobId: string | null;
  generationJobItemId: string | null;
  sourceFormat: string | null;
  targetFormat: string | null;
  sourceType: "persisted" | "temporary" | "display" | "unknown";
  lifecycleRole: AssetLifecycleRole | null;
  persisted: boolean;
  lineageValid: boolean;
  warnings: AssetIssue[];
  errors: AssetIssue[];
}

export interface ResolveAssetIdentityInput {
  graph: AssetGraph;
  /** Which asset the caller is acting on; defaults to the canonical master. */
  focusAssetId?: string | null;
  /** Build a public URL from bucket + path. Injected so this stays pure. */
  publicUrlFor?: (bucket: string, path: string) => string;
}

const CANONICAL_PRIORITY: Record<AssetLifecycleRole, number> = {
  upscaled_master: 40,
  ratio_corrected_master: 30,
  canonical_master: 35,
  original: 20,
  format_derivative: 0,
  temporary: -1,
  display_derivative: -1,
  archived: -1,
  deleted: -1,
};

function isPromotableRole(role: AssetLifecycleRole): boolean {
  return CANONICAL_PRIORITY[role] > 0;
}

/** Candidate assets that could serve as canonical master, best first. */
export function canonicalCandidates(graph: AssetGraph): AssetRecord[] {
  return graph.assets
    .filter((a) => isUsableAsset(a) && isPromotableRole(a.role))
    .filter((a) => !!a.path && hasValidDimensions(a))
    .filter((a) => a.storageObjectExists !== false)
    .filter(
      (a) =>
        a.transformationStatus == null ||
        a.transformationStatus === "completed" ||
        a.transformationStatus === "not_required",
    )
    .sort((a, b) => {
      const p = CANONICAL_PRIORITY[b.role] - CANONICAL_PRIORITY[a.role];
      if (p !== 0) return p;
      const area = (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0);
      if (area !== 0) return area;
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });
}

export function resolveAssetIdentity(
  input: ResolveAssetIdentityInput,
): AssetIdentityResolution {
  const { graph } = input;
  const warnings: AssetIssue[] = [];
  const errors: AssetIssue[] = [];

  const assets = graph.assets;
  const original =
    assets.find((a) => a.role === "original" && isUsableAsset(a)) ??
    assets.find((a) => a.role === "original") ??
    null;

  // ── Flagged canonical rows ────────────────────────────────────────────
  const flagged = assets.filter((a) => a.isCanonical);
  const liveFlagged = flagged.filter(isUsableAsset);
  if (liveFlagged.length > 1) {
    errors.push(
      assetIssue("ASSET_CANONICAL_CONFLICT", "error", {
        assetId: liveFlagged[0].id,
        relatedAssetIds: liveFlagged.slice(1).map((a) => a.id),
        suggestedAction: "Review manually and keep a single canonical master.",
      }),
    );
  }
  for (const f of flagged) {
    if (!isUsableAsset(f)) {
      errors.push(
        assetIssue("ASSET_ARCHIVED_CANONICAL", "error", {
          assetId: f.id,
          suggestedAction: "Promote a valid live candidate as canonical master.",
        }),
      );
    }
  }

  const candidates = canonicalCandidates(graph);
  const flaggedValid = liveFlagged.length === 1 ? candidates.find((c) => c.id === liveFlagged[0].id) : undefined;
  const canonical = flaggedValid ?? candidates[0] ?? null;

  if (!canonical) {
    errors.push(
      assetIssue("ASSET_CANONICAL_MISSING", "error", {
        assetId: graph.rootImageId,
        suggestedAction: "Re-persist the original or repair the storage path.",
      }),
    );
  }

  // ── Canonical reference validation ────────────────────────────────────
  let canonicalUrl: string | null = null;
  let canonicalBucket: string | null = null;
  let canonicalPath: string | null = null;
  if (canonical) {
    const ref = normalizeStorageObjectReference(
      canonical.path,
      canonical.bucket ?? "generated-images",
    );
    if (!ref.isStoredObject || !ref.path) {
      errors.push(
        assetIssue("ASSET_STORAGE_PATH_INVALID", "error", {
          assetId: canonical.id,
          bucket: canonical.bucket,
          path: canonical.path,
        }),
      );
    } else {
      canonicalBucket = canonical.bucket ?? ref.bucket;
      canonicalPath = ref.path;
      canonicalUrl = input.publicUrlFor
        ? input.publicUrlFor(canonicalBucket!, canonicalPath)
        : null;
    }
    if (canonical.storageObjectExists === false) {
      errors.push(
        assetIssue("ASSET_STORAGE_OBJECT_MISSING", "error", {
          assetId: canonical.id,
          bucket: canonical.bucket,
          path: canonical.path,
          suggestedAction: "Relink to a verified object or re-render the master.",
        }),
      );
    }
    if (canonical.url && isTransientAssetReference(canonical.url)) {
      errors.push(
        assetIssue("ASSET_TRANSIENT_URL_REJECTED", "error", {
          assetId: canonical.id,
          suggestedAction: "Clear the stored URL and rely on the storage path.",
        }),
      );
    }
  }

  const focus =
    (input.focusAssetId && assets.find((a) => a.id === input.focusAssetId)) ||
    canonical ||
    null;

  // ── Lineage (delegated deeply in lineage.ts; local sanity here) ────────
  let lineageValid = true;

  // A cycle anywhere in the lineage invalidates the whole graph.
  // Self-parenting is invalid lineage anywhere in the graph, not only on focus.
  for (const a of assets) {
    if (a.parentAssetId && a.parentAssetId === a.id && a.id !== input.focusAssetId) {
      lineageValid = false;
      errors.push(
        assetIssue("ASSET_LINEAGE_INVALID", "error", {
          assetId: a.id,
          message: "Asset is its own parent.",
        }),
      );
    }
  }

  const cycleIds = detectCycles(assets);
  if (cycleIds.length > 0) {
    lineageValid = false;
    errors.push(
      assetIssue("ASSET_LINEAGE_CYCLE", "error", {
        assetId: cycleIds[0],
        relatedAssetIds: cycleIds.slice(1),
        message: "Lineage contains a cycle.",
        suggestedAction: "Repair parent references before trusting this lineage.",
      }),
    );
  }

  if (focus) {
    if (focus.parentAssetId === focus.id) {
      lineageValid = false;
      errors.push(assetIssue("ASSET_LINEAGE_INVALID", "error", { assetId: focus.id, message: "Asset is its own parent." }));
    } else if (focus.parentAssetId && !assets.some((a) => a.id === focus.parentAssetId)) {
      lineageValid = false;
      errors.push(
        assetIssue("ASSET_LINEAGE_INVALID", "error", {
          assetId: focus.id,
          relatedAssetIds: [focus.parentAssetId],
          message: "Parent asset is missing from this lineage.",
        }),
      );
    }
    if (focus.rootImageId && graph.rootImageId && focus.rootImageId !== graph.rootImageId) {
      lineageValid = false;
      errors.push(
        assetIssue("ASSET_LINEAGE_INVALID", "error", {
          assetId: focus.id,
          message: "Asset belongs to a different gallery image.",
        }),
      );
    }
    if (focus.role === "format_derivative" && !focus.targetFormat) {
      warnings.push(assetIssue("ASSET_FORMAT_TARGET_MISSING", "warning", { assetId: focus.id }));
    }
  }

  const sourceType: AssetIdentityResolution["sourceType"] = focus
    ? focus.role === "temporary"
      ? "temporary"
      : focus.role === "display_derivative"
        ? "display"
        : focus.path
          ? "persisted"
          : "unknown"
    : "unknown";

  if (focus && sourceType === "temporary") {
    warnings.push(assetIssue("ASSET_SOURCE_NOT_PERSISTED", "warning", { assetId: focus.id }));
  }

  return {
    galleryAssetId: graph.rootImageId ?? null,
    currentAssetId: focus?.id ?? null,
    canonicalMasterAssetId: canonical?.id ?? null,
    canonicalMasterUrl: canonicalUrl,
    canonicalBucket,
    canonicalPath,
    originalAssetId: original?.id ?? null,
    parentAssetId: focus?.parentAssetId ?? null,
    rootAssetId: graph.rootImageId ?? null,
    generationJobId: focus?.generationJobId ?? canonical?.generationJobId ?? null,
    generationJobItemId: focus?.generationJobItemId ?? canonical?.generationJobItemId ?? null,
    sourceFormat: focus?.sourceFormat ?? null,
    targetFormat: focus?.targetFormat ?? null,
    sourceType,
    lifecycleRole: focus?.role ?? null,
    persisted: sourceType === "persisted",
    lineageValid:
      lineageValid &&
      errors.every(
        (e) =>
          e.code !== "ASSET_LINEAGE_CYCLE" &&
          e.code !== "ASSET_LINEAGE_INVALID" &&
          e.code !== "ASSET_CANONICAL_CONFLICT",
      ),
    warnings,
    errors,
  };
}
