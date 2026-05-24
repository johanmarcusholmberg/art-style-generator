/**
 * Print-readiness — canonical entry point for "is this image good enough
 * to print at format X?".
 *
 * Thin wrapper around the readiness assessment in `image-assets.ts` so the
 * rest of the app has one well-named module to import from.
 *
 * Levels:
 *   ready-300  — ≥ 280 PPI at the target format. Safe for fine-art prints.
 *   ready-150  — ≥ 140 PPI. OK for standard prints; enhancement recommended.
 *   soft       — 90–139 PPI. Viewable but visibly soft; enhance first.
 *   too-small  — < 90 PPI. Should not be exported at this size.
 *   unknown    — dimensions missing.
 */
import {
  getPrintReadiness,
  getMasterDimensions,
  type PrintReadiness,
  type PrintReadinessLevel,
  type AssetImageLike,
} from "@/lib/image-assets";

export type {
  PrintReadiness,
  PrintReadinessLevel,
  AssetImageLike,
};

export const assessPrintReadiness = getPrintReadiness;
export const getImageMasterDimensions = getMasterDimensions;

/** Coarse 4-state status used by the status-badges component. */
export type PrintReadinessStatus =
  | "not-ready"
  | "ok-small-prints"
  | "good-150"
  | "excellent-300"
  | "unknown";

export function getPrintReadinessStatus(
  img: AssetImageLike,
  formatId?: string | null,
): PrintReadinessStatus {
  const r = getPrintReadiness(img, formatId);
  switch (r.level) {
    case "ready-300":
      return "excellent-300";
    case "ready-150":
      return "good-150";
    case "soft":
      return "ok-small-prints";
    case "too-small":
      return "not-ready";
    default:
      return "unknown";
  }
}

export const PRINT_READINESS_LABEL: Record<PrintReadinessStatus, string> = {
  "excellent-300": "Excellent (300 PPI)",
  "good-150": "Good (150 PPI)",
  "ok-small-prints": "OK for small prints",
  "not-ready": "Not print ready",
  unknown: "Not measured",
};
