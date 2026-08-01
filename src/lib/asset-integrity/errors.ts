/**
 * Turn 4A — stable, machine-readable lifecycle error codes.
 *
 * These codes are the contract between the resolver, the promotion gate,
 * the lineage validator, the deletion planner, the integrity scanner and
 * any admin diagnostics surface. User-facing copy may change freely; the
 * codes must not.
 */

export const ASSET_ERROR_CODES = [
  "ASSET_SOURCE_NOT_PERSISTED",
  "ASSET_CANONICAL_MISSING",
  "ASSET_STORAGE_OBJECT_MISSING",
  "ASSET_DUPLICATE_OPERATION",
  "ASSET_LINEAGE_INVALID",
  "ASSET_LINEAGE_CYCLE",
  "ASSET_CANONICAL_CONFLICT",
  "ASSET_DELETE_BLOCKED_DEPENDANTS",
  "ASSET_DELETE_BLOCKED_CANONICAL",
  "ASSET_STORAGE_CLEANUP_FAILED",
  "ASSET_TRANSIENT_URL_REJECTED",
  "ASSET_DIMENSIONS_INVALID",
  "ASSET_FORMAT_TARGET_MISSING",
  "ASSET_CROP_BOX_INVALID",
  "ASSET_ARCHIVED_CANONICAL",
  "ASSET_STORAGE_PATH_INVALID",
] as const;

export type AssetErrorCode = (typeof ASSET_ERROR_CODES)[number];

export type AssetIssueSeverity = "info" | "warning" | "error";

export interface AssetIssue {
  code: AssetErrorCode;
  severity: AssetIssueSeverity;
  assetId?: string | null;
  relatedAssetIds?: string[];
  bucket?: string | null;
  path?: string | null;
  /** Human-readable, non-secret explanation. */
  message: string;
  suggestedAction?: string;
}

const DEFAULT_MESSAGES: Record<AssetErrorCode, string> = {
  ASSET_SOURCE_NOT_PERSISTED: "The source image has not been durably persisted yet.",
  ASSET_CANONICAL_MISSING: "No canonical master could be resolved for this image.",
  ASSET_STORAGE_OBJECT_MISSING: "The stored file for this asset is missing.",
  ASSET_DUPLICATE_OPERATION: "An asset already exists for this exact operation.",
  ASSET_LINEAGE_INVALID: "The asset's lineage is invalid or incomplete.",
  ASSET_LINEAGE_CYCLE: "The asset lineage contains a cycle.",
  ASSET_CANONICAL_CONFLICT: "More than one asset claims to be the canonical master.",
  ASSET_DELETE_BLOCKED_DEPENDANTS: "Deletion is blocked: other assets depend on this one.",
  ASSET_DELETE_BLOCKED_CANONICAL: "Deletion is blocked: this is the active canonical master.",
  ASSET_STORAGE_CLEANUP_FAILED: "The stored file could not be cleaned up safely.",
  ASSET_TRANSIENT_URL_REJECTED: "A temporary or display-only URL cannot be used as a stored asset.",
  ASSET_DIMENSIONS_INVALID: "The asset has missing or invalid pixel dimensions.",
  ASSET_FORMAT_TARGET_MISSING: "The format derivative has no target format recorded.",
  ASSET_CROP_BOX_INVALID: "The crop box does not fit inside the source image.",
  ASSET_ARCHIVED_CANONICAL: "An archived or deleted asset is still selected as canonical.",
  ASSET_STORAGE_PATH_INVALID: "The storage path is malformed or unsafe.",
};

export function assetIssue(
  code: AssetErrorCode,
  severity: AssetIssueSeverity,
  extra: Omit<AssetIssue, "code" | "severity" | "message"> & { message?: string } = {},
): AssetIssue {
  const { message, ...rest } = extra;
  return { code, severity, message: message ?? DEFAULT_MESSAGES[code], ...rest };
}

export function describeAssetError(code: AssetErrorCode): string {
  return DEFAULT_MESSAGES[code];
}

/** Structured error for throw sites that still need a stable code. */
export class AssetLifecycleError extends Error {
  readonly code: AssetErrorCode;
  readonly details: Record<string, unknown>;
  constructor(code: AssetErrorCode, message?: string, details: Record<string, unknown> = {}) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = "AssetLifecycleError";
    this.code = code;
    this.details = details;
  }
}
