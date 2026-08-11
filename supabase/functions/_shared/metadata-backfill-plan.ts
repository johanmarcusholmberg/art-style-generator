/**
 * Pure planner for the one-time canonical metadata backfill.
 *
 * Decides, for a single legacy `generated_images` row, what has to change so
 * the row (and its canonical/original asset) carries:
 *   - a print_format_id (inferred from measured pixel dimensions when absent)
 *   - the canonical aspect_ratio derived from that print format
 *   - real pixel dimensions measured from the persisted master bytes
 *
 * Tested from Vitest via `src/lib/metadata-backfill-plan.test.ts`.
 */
import { canonicalAspectRatio, printFormatRatioDecimal } from "./generation-metadata-invariant.ts";

export const BACKFILL_FORMAT_IDS = [
  "print_50x70",
  "print_70x50",
  "print_70x100",
  "print_30x40",
  "print_50x50",
  "print_a2",
  "print_a3",
  "print_a4",
] as const;

/** Max relative deviation (0.5%) allowed when inferring a format from pixels. */
export const RATIO_INFERENCE_TOLERANCE = 0.005;

export interface BackfillRow {
  id: string;
  actual_width_px?: number | null;
  actual_height_px?: number | null;
  print_format_id?: string | null;
  aspect_ratio?: string | null;
  storage_path?: string | null;
  master_storage_path?: string | null;
}

export interface AssetRow {
  id: string;
  width_px?: number | null;
  height_px?: number | null;
  storage_path?: string | null;
}

export interface BackfillPlan {
  id: string;
  /** True when the master bytes must be fetched + decoded to learn dimensions. */
  needsMeasurement: boolean;
  /** Storage object path to measure (null when the row has no master). */
  measureStoragePath: string | null;
  /** Patch for generated_images (empty object = nothing to write). */
  imagePatch: Record<string, unknown>;
  /** Patch for the canonical/original asset (empty object = nothing to write). */
  assetPatch: Record<string, unknown>;
  printFormatId: string | null;
  aspectRatio: string | null;
  /** Why no format could be resolved, when that's the case. */
  unresolved?: "no_dimensions" | "no_matching_format";
}

/**
 * Infer a print format from pixel dimensions. Returns null when no registered
 * format matches within tolerance — we never guess.
 */
export function inferPrintFormatId(
  width?: number | null,
  height?: number | null,
): string | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const actual = width / height;
  let best: { id: string; delta: number } | null = null;
  for (const id of BACKFILL_FORMAT_IDS) {
    const target = printFormatRatioDecimal(id);
    if (!target) continue;
    const delta = Math.abs(actual - target) / target;
    if (delta <= RATIO_INFERENCE_TOLERANCE && (!best || delta < best.delta)) {
      best = { id, delta };
    }
  }
  return best?.id ?? null;
}

/**
 * Build the (idempotent) repair plan for one row. Dimensions passed in
 * `measured` override the persisted ones — the bytes are the only truth.
 */
export function planRowBackfill(
  row: BackfillRow,
  asset?: AssetRow | null,
  measured?: { width: number; height: number } | null,
): BackfillPlan {
  const width = measured?.width ?? row.actual_width_px ?? null;
  const height = measured?.height ?? row.actual_height_px ?? null;
  const masterPath = row.master_storage_path || row.storage_path || null;

  if (!width || !height) {
    return {
      id: row.id,
      needsMeasurement: !!masterPath,
      measureStoragePath: masterPath,
      imagePatch: {},
      assetPatch: {},
      printFormatId: row.print_format_id ?? null,
      aspectRatio: canonicalAspectRatio(row.print_format_id, row.aspect_ratio ?? null),
      unresolved: "no_dimensions",
    };
  }

  const printFormatId = row.print_format_id ?? inferPrintFormatId(width, height);
  const aspectRatio = canonicalAspectRatio(printFormatId, row.aspect_ratio ?? null);

  const imagePatch: Record<string, unknown> = {};
  if (row.actual_width_px !== width) imagePatch.actual_width_px = width;
  if (row.actual_height_px !== height) imagePatch.actual_height_px = height;
  if (measured) {
    imagePatch.master_width = width;
    imagePatch.master_height = height;
  }
  if (printFormatId && row.print_format_id !== printFormatId) {
    imagePatch.print_format_id = printFormatId;
  }
  if (aspectRatio && row.aspect_ratio !== aspectRatio) {
    imagePatch.aspect_ratio = aspectRatio;
  }

  const assetPatch: Record<string, unknown> = {};
  if (asset) {
    if (asset.width_px !== width) assetPatch.width_px = width;
    if (asset.height_px !== height) assetPatch.height_px = height;
    if (masterPath && asset.storage_path !== masterPath) {
      assetPatch.storage_path = masterPath;
    }
  }

  return {
    id: row.id,
    needsMeasurement: false,
    measureStoragePath: masterPath,
    imagePatch,
    assetPatch,
    printFormatId: printFormatId ?? null,
    aspectRatio,
    ...(printFormatId ? {} : { unresolved: "no_matching_format" as const }),
  };
}

/** True when the plan would write nothing (row already canonical). */
export function planIsNoop(plan: BackfillPlan): boolean {
  return (
    !plan.needsMeasurement &&
    Object.keys(plan.imagePatch).length === 0 &&
    Object.keys(plan.assetPatch).length === 0
  );
}
