/**
 * Shared generated-image metadata validator.
 *
 * One place that answers "is this persisted row trustworthy?" for every
 * surface: the durable persist path, the client self-heal pass, the backfill
 * planner and the regression suite. It is a PURE function over plain row
 * shapes — no network, no Supabase client, no DOM — so it can run in Vitest,
 * in Deno edge functions (via the mirror) and in scripts alike.
 *
 * It layers on top of `generation-metadata-invariant.ts`:
 *   - the invariant answers "is anything missing?" (hard errors)
 *   - the validator additionally answers "is anything inconsistent?"
 *     (ratio drift, asset divergence, master/base disagreement)
 *
 * Mirror of `src/lib/metadata-validator.ts` — keep in sync.
 * Parity is asserted by `src/lib/metadata-validator.test.ts`.
 */
import {
  canonicalAspectRatio,
  isPrintReadyGeneration,
  printFormatRatioDecimal,
  type MetadataDefectCode,
} from "./generation-metadata-invariant.ts";
import { isValidPixelDimension } from "./image-dimensions.ts";

export type MetadataIssueCode =
  | MetadataDefectCode
  | "unknown_print_format"
  | "aspect_ratio_mismatch"
  | "dimension_ratio_drift"
  | "master_dimension_mismatch"
  | "asset_dimension_mismatch"
  | "asset_storage_path_mismatch";

export type MetadataIssueSeverity = "error" | "warning";

export interface MetadataIssue {
  code: MetadataIssueCode;
  severity: MetadataIssueSeverity;
  field: string;
  message: string;
}

/** Snake_case row shape as persisted in `generated_images`. */
export interface GeneratedImageMetadataRow {
  id?: string | null;
  actual_width_px?: number | null;
  actual_height_px?: number | null;
  master_width?: number | null;
  master_height?: number | null;
  print_format_id?: string | null;
  aspect_ratio?: string | null;
  generation_mode?: string | null;
  storage_path?: string | null;
  master_storage_path?: string | null;
}

/** Snake_case row shape as persisted in `generated_image_assets`. */
export interface GeneratedImageAssetRow {
  asset_type?: string | null;
  version_index?: number | null;
  width_px?: number | null;
  height_px?: number | null;
  storage_path?: string | null;
  deleted_at?: string | null;
}

export interface MetadataValidationOptions {
  /**
   * Allowed relative deviation between the persisted pixel ratio and the
   * print-format ratio. Rounding to whole pixels at 150/300 PPI stays well
   * inside 0.5%.
   */
  ratioTolerance?: number;
}

export interface MetadataValidationResult {
  ok: boolean;
  issues: MetadataIssue[];
  errors: MetadataIssue[];
  warnings: MetadataIssue[];
  /** Canonical aspect ratio the row SHOULD carry (null when underivable). */
  canonicalAspectRatio: string | null;
}

export const DEFAULT_RATIO_TOLERANCE = 0.005;

function issue(
  code: MetadataIssueCode,
  severity: MetadataIssueSeverity,
  field: string,
  message: string,
): MetadataIssue {
  return { code, severity, field, message };
}

/** Validate a single persisted gallery row. */
export function validateGeneratedImageMetadata(
  row: GeneratedImageMetadataRow,
  options: MetadataValidationOptions = {},
): MetadataValidationResult {
  const tolerance = options.ratioTolerance ?? DEFAULT_RATIO_TOLERANCE;
  const issues: MetadataIssue[] = [];

  const width = row.actual_width_px;
  const height = row.actual_height_px;
  const formatId = row.print_format_id ?? null;
  const canonical = canonicalAspectRatio(formatId, null);

  const dimsValid = isValidPixelDimension(width) && isValidPixelDimension(height);
  if (!dimsValid) {
    issues.push(
      issue(
        "missing_dimensions",
        "error",
        "actual_width_px/actual_height_px",
        "Pixel dimensions must be measured from the persisted image bytes.",
      ),
    );
  }

  if (isPrintReadyGeneration(row.generation_mode) && !formatId) {
    issues.push(
      issue(
        "missing_print_format",
        "error",
        "print_format_id",
        "Print-ready generations must persist the selected print format.",
      ),
    );
  }

  if (formatId && printFormatRatioDecimal(formatId) === null) {
    issues.push(
      issue(
        "unknown_print_format",
        "error",
        "print_format_id",
        `Unknown print format id "${formatId}".`,
      ),
    );
  }

  if (!row.aspect_ratio) {
    issues.push(
      issue(
        "missing_aspect_ratio",
        "error",
        "aspect_ratio",
        "Aspect ratio must be persisted.",
      ),
    );
  } else if (canonical && row.aspect_ratio !== canonical) {
    issues.push(
      issue(
        "aspect_ratio_mismatch",
        "error",
        "aspect_ratio",
        `aspect_ratio "${row.aspect_ratio}" must equal the canonical "${canonical}" for ${formatId}.`,
      ),
    );
  }

  const expectedDecimal = printFormatRatioDecimal(formatId);
  if (dimsValid && expectedDecimal !== null) {
    const actual = (width as number) / (height as number);
    const drift = Math.abs(actual - expectedDecimal) / expectedDecimal;
    if (drift > tolerance) {
      issues.push(
        issue(
          "dimension_ratio_drift",
          "warning",
          "actual_width_px/actual_height_px",
          `Pixel ratio ${actual.toFixed(4)} deviates ${(drift * 100).toFixed(2)}% from ${formatId}.`,
        ),
      );
    }
  }

  const hasMaster =
    isValidPixelDimension(row.master_width) && isValidPixelDimension(row.master_height);
  if (dimsValid && hasMaster) {
    if (row.master_width !== width || row.master_height !== height) {
      issues.push(
        issue(
          "master_dimension_mismatch",
          "warning",
          "master_width/master_height",
          "Master dimensions disagree with the measured actual dimensions.",
        ),
      );
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return {
    ok: errors.length === 0,
    issues,
    errors,
    warnings,
    canonicalAspectRatio: canonical,
  };
}

/**
 * Validate that the versioned `original` asset row agrees with its parent
 * gallery row. Missing assets are not an error here — legacy rows may predate
 * the versioned asset table — but divergence is.
 */
export function validateAssetConsistency(
  row: GeneratedImageMetadataRow,
  asset: GeneratedImageAssetRow | null | undefined,
): MetadataIssue[] {
  if (!asset || asset.deleted_at) return [];
  const issues: MetadataIssue[] = [];
  const width = row.actual_width_px;
  const height = row.actual_height_px;

  if (
    isValidPixelDimension(width) &&
    isValidPixelDimension(height) &&
    isValidPixelDimension(asset.width_px) &&
    isValidPixelDimension(asset.height_px) &&
    (asset.width_px !== width || asset.height_px !== height)
  ) {
    issues.push(
      issue(
        "asset_dimension_mismatch",
        "error",
        "generated_image_assets.width_px/height_px",
        "Original asset dimensions diverge from the gallery row.",
      ),
    );
  }

  const master = row.master_storage_path ?? row.storage_path ?? null;
  if (master && asset.storage_path && asset.storage_path !== master) {
    issues.push(
      issue(
        "asset_storage_path_mismatch",
        "error",
        "generated_image_assets.storage_path",
        "Original asset points at a different object than the master.",
      ),
    );
  }
  return issues;
}

/** Row + its original asset, validated together. */
export function validateGeneratedImageWithAsset(
  row: GeneratedImageMetadataRow,
  asset: GeneratedImageAssetRow | null | undefined,
  options: MetadataValidationOptions = {},
): MetadataValidationResult {
  const base = validateGeneratedImageMetadata(row, options);
  const extra = validateAssetConsistency(row, asset);
  const issues = [...base.issues, ...extra];
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return { ...base, issues, errors, warnings, ok: errors.length === 0 };
}

export interface MetadataValidationSummary {
  total: number;
  valid: number;
  invalid: number;
  withWarnings: number;
  byCode: Record<string, number>;
}

/** Aggregate many validation results (used by backfill/audit reporting). */
export function summarizeValidations(
  results: MetadataValidationResult[],
): MetadataValidationSummary {
  const byCode: Record<string, number> = {};
  let valid = 0;
  let withWarnings = 0;
  for (const r of results) {
    if (r.ok) valid++;
    if (r.warnings.length > 0) withWarnings++;
    for (const i of r.issues) byCode[i.code] = (byCode[i.code] ?? 0) + 1;
  }
  return {
    total: results.length,
    valid,
    invalid: results.length - valid,
    withWarnings,
    byCode,
  };
}
