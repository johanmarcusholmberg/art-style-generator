/**
 * Turn 4A — canonical promotion gate + lineage validation.
 *
 * Promotion is the single most dangerous lifecycle operation: it changes what
 * every print, export, PPI calculation and future derivation uses. It is
 * therefore expressed as a pure, fully-testable decision function.
 */
import { assetIssue, type AssetIssue } from "./errors";
import {
  hasValidDimensions,
  isUsableAsset,
  type AssetGraph,
  type AssetRecord,
} from "./model";
import {
  isTransientAssetReference,
  normalizeStorageObjectReference,
} from "./storage-reference";

/* ------------------------------------------------------------------ */
/* Canonical promotion                                                */
/* ------------------------------------------------------------------ */

export interface PromotionDecision {
  allowed: boolean;
  /** Asset that stays / becomes authoritative. */
  canonicalAssetId: string | null;
  /** Canonical master before this decision, kept recoverable. */
  previousCanonicalAssetId: string | null;
  blockers: AssetIssue[];
  warnings: AssetIssue[];
}

export interface PromotionInput {
  graph: AssetGraph;
  candidateAssetId: string;
  /** Expected aspect ratio (width/height) when the target format demands one. */
  expectedRatio?: number | null;
  ratioTolerance?: number;
  /** Set false when the DB linkage write has not been confirmed. */
  databaseLinkageConfirmed?: boolean;
}

export function evaluateCanonicalPromotion(input: PromotionInput): PromotionDecision {
  const { graph, candidateAssetId } = input;
  const blockers: AssetIssue[] = [];
  const warnings: AssetIssue[] = [];

  const previous =
    graph.assets.find((a) => a.isCanonical && isUsableAsset(a))?.id ?? null;
  const candidate = graph.assets.find((a) => a.id === candidateAssetId) ?? null;

  if (!candidate) {
    blockers.push(
      assetIssue("ASSET_CANONICAL_MISSING", "error", {
        assetId: candidateAssetId,
        message: "Promotion candidate does not exist.",
      }),
    );
    return { allowed: false, canonicalAssetId: previous, previousCanonicalAssetId: previous, blockers, warnings };
  }

  // 1. durable persisted storage object
  const ref = normalizeStorageObjectReference(candidate.path, candidate.bucket ?? "generated-images");
  if (!candidate.path || !ref.isStoredObject) {
    blockers.push(
      assetIssue("ASSET_SOURCE_NOT_PERSISTED", "error", {
        assetId: candidate.id,
        message: "Candidate has no durable storage object.",
      }),
    );
  }
  if (candidate.storageObjectExists === false) {
    blockers.push(
      assetIssue("ASSET_STORAGE_OBJECT_MISSING", "error", {
        assetId: candidate.id,
        bucket: candidate.bucket,
        path: candidate.path,
      }),
    );
  }
  // 2. no transient / display URL
  if (candidate.url && isTransientAssetReference(candidate.url)) {
    blockers.push(assetIssue("ASSET_TRANSIENT_URL_REJECTED", "error", { assetId: candidate.id }));
  }
  // 3. durable database row + linkage
  if (input.databaseLinkageConfirmed === false) {
    blockers.push(
      assetIssue("ASSET_LINEAGE_INVALID", "error", {
        assetId: candidate.id,
        message: "Database linkage for this asset was not confirmed.",
      }),
    );
  }
  // 4. valid dimensions
  if (!hasValidDimensions(candidate)) {
    blockers.push(assetIssue("ASSET_DIMENSIONS_INVALID", "error", { assetId: candidate.id }));
  }
  // 5. lineage to the root
  if (!candidate.rootImageId || candidate.rootImageId !== graph.rootImageId) {
    blockers.push(
      assetIssue("ASSET_LINEAGE_INVALID", "error", {
        assetId: candidate.id,
        message: "Candidate is not linked to this gallery image.",
      }),
    );
  }
  // 6. transformation completed
  if (
    candidate.transformationStatus &&
    candidate.transformationStatus !== "completed" &&
    candidate.transformationStatus !== "not_required"
  ) {
    blockers.push(
      assetIssue("ASSET_SOURCE_NOT_PERSISTED", "error", {
        assetId: candidate.id,
        message: `Transformation is ${candidate.transformationStatus}, not completed.`,
      }),
    );
  }
  // 7. archived / deleted
  if (!isUsableAsset(candidate)) {
    blockers.push(assetIssue("ASSET_ARCHIVED_CANONICAL", "error", { assetId: candidate.id }));
  }
  // 8. format/ratio validation
  if (
    input.expectedRatio &&
    hasValidDimensions(candidate) &&
    Math.abs(candidate.width! / candidate.height! - input.expectedRatio) >
      (input.ratioTolerance ?? 0.01)
  ) {
    blockers.push(
      assetIssue("ASSET_LINEAGE_INVALID", "error", {
        assetId: candidate.id,
        message: "Candidate does not match the expected poster ratio.",
      }),
    );
  }
  // 9. never silently downgrade an existing valid canonical
  const prevAsset = previous ? graph.assets.find((a) => a.id === previous) ?? null : null;
  if (
    prevAsset &&
    hasValidDimensions(prevAsset) &&
    hasValidDimensions(candidate) &&
    candidate.width! * candidate.height! < prevAsset.width! * prevAsset.height!
  ) {
    warnings.push(
      assetIssue("ASSET_CANONICAL_CONFLICT", "warning", {
        assetId: candidate.id,
        relatedAssetIds: [prevAsset.id],
        message: "Candidate is lower resolution than the current canonical master.",
        suggestedAction: "Confirm explicitly before replacing the higher-resolution master.",
      }),
    );
  }

  const allowed = blockers.length === 0;
  return {
    allowed,
    canonicalAssetId: allowed ? candidate.id : previous,
    previousCanonicalAssetId: previous,
    blockers,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Lineage validation                                                 */
/* ------------------------------------------------------------------ */

export interface LineageValidation {
  valid: boolean;
  issues: AssetIssue[];
  /** Cases that must NOT be auto-repaired. */
  ambiguous: AssetIssue[];
}

export function validateLineage(graph: AssetGraph): LineageValidation {
  const issues: AssetIssue[] = [];
  const ambiguous: AssetIssue[] = [];
  const byId = new Map(graph.assets.map((a) => [a.id, a]));

  for (const a of graph.assets) {
    // self-parenting
    if (a.parentAssetId && a.parentAssetId === a.id) {
      issues.push(
        assetIssue("ASSET_LINEAGE_INVALID", "error", { assetId: a.id, message: "Asset is its own parent." }),
      );
      continue;
    }
    // missing parent
    if (a.parentAssetId && !byId.has(a.parentAssetId)) {
      issues.push(
        assetIssue("ASSET_LINEAGE_INVALID", "error", {
          assetId: a.id,
          relatedAssetIds: [a.parentAssetId],
          message: "Parent asset is missing.",
        }),
      );
    }
    // cross-root parent
    const parent = a.parentAssetId ? byId.get(a.parentAssetId) : null;
    if (parent && parent.rootImageId && a.rootImageId && parent.rootImageId !== a.rootImageId) {
      issues.push(
        assetIssue("ASSET_LINEAGE_INVALID", "error", {
          assetId: a.id,
          relatedAssetIds: [parent.id],
          message: "Parent belongs to a different gallery image.",
        }),
      );
    }
    // child created before its source persisted
    if (parent?.createdAt && a.createdAt && a.createdAt < parent.createdAt) {
      issues.push(
        assetIssue("ASSET_LINEAGE_INVALID", "error", {
          assetId: a.id,
          relatedAssetIds: [parent.id],
          message: "Child asset predates its source.",
        }),
      );
    }
    // derivative referencing a display / transient URL
    if (a.url && isTransientAssetReference(a.url)) {
      issues.push(assetIssue("ASSET_TRANSIENT_URL_REJECTED", "error", { assetId: a.id }));
    }
    // format derivative specifics
    if (a.role === "format_derivative") {
      if (!a.targetFormat) {
        issues.push(assetIssue("ASSET_FORMAT_TARGET_MISSING", "error", { assetId: a.id }));
      }
      if (!validateCropBox(a)) {
        issues.push(assetIssue("ASSET_CROP_BOX_INVALID", "error", { assetId: a.id }));
      }
    }
    // canonical not connected to the root
    if (a.isCanonical && a.rootImageId !== graph.rootImageId) {
      issues.push(
        assetIssue("ASSET_LINEAGE_INVALID", "error", {
          assetId: a.id,
          message: "Canonical master is not connected to the root asset.",
        }),
      );
    }
  }

  // cycles
  for (const cycleId of detectCycles(graph.assets)) {
    issues.push(assetIssue("ASSET_LINEAGE_CYCLE", "error", { assetId: cycleId }));
  }

  // multiple canonical masters — ambiguous, never auto-repaired
  const canon = graph.assets.filter((a) => a.isCanonical && !a.deletedAt);
  if (canon.length > 1) {
    const issue = assetIssue("ASSET_CANONICAL_CONFLICT", "error", {
      assetId: canon[0].id,
      relatedAssetIds: canon.slice(1).map((a) => a.id),
      suggestedAction: "Manual review required — do not auto-select.",
    });
    issues.push(issue);
    ambiguous.push(issue);
  }

  return { valid: issues.length === 0, issues, ambiguous };
}

export function validateCropBox(a: AssetRecord): boolean {
  if (!a.cropBox) return true;
  const { x, y, width, height } = a.cropBox;
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return false;
  if (width <= 0 || height <= 0 || x < 0 || y < 0) return false;
  const sw = a.sourceWidth;
  const sh = a.sourceHeight;
  if (typeof sw === "number" && typeof sh === "number" && sw > 0 && sh > 0) {
    if (x + width > sw || y + height > sh) return false;
  }
  return true;
}

/** Returns asset ids participating in a parent cycle. */
export function detectCycles(assets: AssetRecord[]): string[] {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const state = new Map<string, 0 | 1 | 2>();
  const found = new Set<string>();

  const walk = (id: string, stack: string[]) => {
    const s = state.get(id);
    if (s === 2) return;
    if (s === 1) {
      const idx = stack.indexOf(id);
      stack.slice(idx === -1 ? 0 : idx).forEach((n) => found.add(n));
      return;
    }
    state.set(id, 1);
    const parent = byId.get(id)?.parentAssetId;
    if (parent && byId.has(parent) && parent !== id) walk(parent, [...stack, id]);
    state.set(id, 2);
  };

  for (const a of assets) walk(a.id, []);
  return [...found];
}
