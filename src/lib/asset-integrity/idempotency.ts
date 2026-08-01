/**
 * Turn 4A — idempotent persistence via stable operation identity.
 *
 * We do NOT content-hash large images. Instead every persistence operation
 * gets a deterministic identity built from stable identifiers that already
 * exist in the schema. Repeating the same operation must reuse the existing
 * valid asset instead of uploading a duplicate.
 */
import { assetIssue, type AssetIssue } from "./errors";
import { hasValidDimensions, type AssetRecord, type CropBox } from "./model";

export type AssetOperationType =
  | "generation"
  | "ratio_correction"
  | "upscale"
  | "format_derivative";

export interface AssetOperationIdentity {
  type: AssetOperationType;
  generationJobId?: string | null;
  generationJobItemId?: string | null;
  sourceAssetId?: string | null;
  targetFormat?: string | null;
  cropBox?: CropBox | null;
  upscaleRecipe?: string | null;
  outputVersion?: number | null;
}

function part(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "object") {
    const c = value as CropBox;
    return [c.x, c.y, c.width, c.height].map((n) => Math.round(n)).join("x");
  }
  return String(value);
}

/** Deterministic key for one persistence operation. */
export function assetOperationKey(op: AssetOperationIdentity): string {
  return [
    op.type,
    part(op.generationJobItemId ?? op.generationJobId),
    part(op.sourceAssetId),
    part(op.targetFormat),
    part(op.cropBox),
    part(op.upscaleRecipe),
    part(op.outputVersion),
  ].join("|");
}

export interface IdempotencyDecision {
  /** "reuse" = return the existing asset, "create" = perform the operation. */
  action: "reuse" | "create";
  existingAssetId: string | null;
  issues: AssetIssue[];
}

export interface IdempotencyInput {
  operation: AssetOperationIdentity;
  /** Existing assets already persisted for this root image. */
  existing: AssetRecord[];
  /** Map an existing asset back to its operation identity. */
  identityOf: (a: AssetRecord) => AssetOperationIdentity | null;
}

/**
 * Decide whether a persistence operation must run, or whether a previous
 * attempt already completed it. Never reuses an asset whose storage object is
 * known missing or whose dimensions are invalid.
 */
export function decideIdempotentPersist(input: IdempotencyInput): IdempotencyDecision {
  const key = assetOperationKey(input.operation);
  const issues: AssetIssue[] = [];

  const matches = input.existing.filter((a) => {
    if (a.deletedAt) return false;
    const id = input.identityOf(a);
    return !!id && assetOperationKey(id) === key;
  });

  if (matches.length === 0) return { action: "create", existingAssetId: null, issues };

  /**
   * Reuse requires positive verified dimensions. Unknown (null) dimensions are
   * only acceptable when another trusted field — a confirmed storage object —
   * verifies the asset actually exists.
   */
  const usable = matches.find((a) => {
    if (a.storageObjectExists === false) return false;
    if (!a.path) return false;
    if (a.archivedAt) return false;
    const dimsKnown = typeof a.width === "number" && typeof a.height === "number";
    if (dimsKnown) return hasValidDimensions(a);
    if (a.width != null || a.height != null) return false;
    return a.storageObjectExists === true;
  });

  if (!usable) {
    issues.push(
      assetIssue("ASSET_STORAGE_OBJECT_MISSING", "warning", {
        assetId: matches[0].id,
        message: "A previous attempt left an unusable asset; re-running the operation.",
        suggestedAction: "Archive the broken duplicate after the retry succeeds.",
      }),
    );
    return { action: "create", existingAssetId: null, issues };
  }

  if (matches.length > 1) {
    issues.push(
      assetIssue("ASSET_DUPLICATE_OPERATION", "warning", {
        assetId: usable.id,
        relatedAssetIds: matches.filter((m) => m.id !== usable.id).map((m) => m.id),
        suggestedAction: "Archive the duplicate rows for this operation.",
      }),
    );
  }

  return { action: "reuse", existingAssetId: usable.id, issues };
}

/* ------------------------------------------------------------------ */
/* Partial-failure compensation                                       */
/* ------------------------------------------------------------------ */

export type PartialFailureStage =
  | "upload_ok_db_failed"
  | "db_ok_object_missing"
  | "parent_ok_child_link_failed"
  | "canonical_promotion_failed";

export interface CompensationStep {
  action:
    | "delete_unreferenced_object"
    | "report_broken_asset"
    | "keep_previous_canonical"
    | "mark_child_repairable"
    | "manual_review";
  bucket?: string | null;
  path?: string | null;
  assetId?: string | null;
  /** Never delete a storage object that another live row may reference. */
  safe: boolean;
  reason: string;
}

export interface CompensationPlan {
  stage: PartialFailureStage;
  steps: CompensationStep[];
  issues: AssetIssue[];
  /** True when the caller may safely retry the whole operation. */
  recoverable: boolean;
  /**
   * Always false: database writes and storage writes are never atomic with one
   * another. Compensation is best-effort repair, never a transaction.
   */
  atomicityGuaranteed: false;
}

export interface CompensationInput {
  stage: PartialFailureStage;
  bucket?: string | null;
  path?: string | null;
  assetId?: string | null;
  /** How many live database rows reference the uploaded object. */
  referencingRowCount?: number;
  previousCanonicalAssetId?: string | null;
}

export function planCompensation(input: CompensationInput): CompensationPlan {
  const steps: CompensationStep[] = [];
  const issues: AssetIssue[] = [];

  switch (input.stage) {
    case "upload_ok_db_failed": {
      const shared = (input.referencingRowCount ?? 0) > 0;
      steps.push({
        action: shared ? "manual_review" : "delete_unreferenced_object",
        bucket: input.bucket,
        path: input.path,
        safe: !shared,
        reason: shared
          ? "Object is referenced by an existing row — never delete."
          : "Object was uploaded but no row references it.",
      });
      if (shared) {
        issues.push(
          assetIssue("ASSET_STORAGE_CLEANUP_FAILED", "warning", {
            bucket: input.bucket,
            path: input.path,
            suggestedAction: "Leave the object in place and retry the row insert.",
          }),
        );
      }
      return { stage: input.stage, steps, issues, recoverable: true, atomicityGuaranteed: false };
    }
    case "db_ok_object_missing": {
      steps.push({
        action: "report_broken_asset",
        assetId: input.assetId,
        bucket: input.bucket,
        path: input.path,
        safe: true,
        reason: "Row exists without its file; never fall back to a lower-quality asset.",
      });
      issues.push(
        assetIssue("ASSET_STORAGE_OBJECT_MISSING", "error", {
          assetId: input.assetId,
          bucket: input.bucket,
          path: input.path,
          suggestedAction: "Use the admin repair path to relink or re-render.",
        }),
      );
      return { stage: input.stage, steps, issues, recoverable: false, atomicityGuaranteed: false };
    }
    case "parent_ok_child_link_failed": {
      steps.push({
        action: "keep_previous_canonical",
        assetId: input.previousCanonicalAssetId,
        safe: true,
        reason: "Child lineage incomplete — the child must not become canonical.",
      });
      steps.push({
        action: "mark_child_repairable",
        assetId: input.assetId,
        safe: true,
        reason: "Incomplete child is eligible for safe cleanup or repair.",
      });
      issues.push(assetIssue("ASSET_LINEAGE_INVALID", "warning", { assetId: input.assetId }));
      return { stage: input.stage, steps, issues, recoverable: true, atomicityGuaranteed: false };
    }
    case "canonical_promotion_failed":
    default: {
      steps.push({
        action: "keep_previous_canonical",
        assetId: input.previousCanonicalAssetId,
        safe: true,
        reason: "Promotion did not complete; the old canonical master stays authoritative.",
      });
      return { stage: "canonical_promotion_failed", steps, issues, recoverable: true, atomicityGuaranteed: false };
    }
  }
}
