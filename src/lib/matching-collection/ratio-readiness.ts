/**
 * Format readiness (ratio-only) vs full print readiness.
 *
 * `assessFormatReadiness` answers a single question: is the poster-format
 * ratio validated for this member? It intentionally does NOT know about
 * physical print sizes or PPI — full print readiness composes this with
 * `getPrintReadinessStatus` from `@/lib/print-readiness`.
 *
 * Rules:
 *   - "completed"    → ready when a corrected master path + dims exist.
 *   - "not_required" → ready ONLY when the persisted source ratio is
 *                      verified via `opts.ratioMatchesFormat`.
 *   - "pending" / "processing" / "failed" / unknown → not ready.
 *
 * The legacy `assessRatioReadiness` is kept as a back-compat alias that
 * exposes the same shape plus an `isPrintReady` field for old call sites.
 * New code should use `assessFormatReadiness` and compose print readiness
 * separately.
 */
export type RatioFinalizationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "not_required";

export interface FormatReadiness {
  /** True only when the ratio has been validated for the selected format. */
  isFormatReady: boolean;
  label: string;
  tone: "info" | "warning" | "success" | "danger" | "muted";
  reason:
    | "pending"
    | "processing"
    | "failed"
    | "completed"
    | "not_required-match"
    | "not_required-mismatch"
    | "completed-missing-master"
    | "unknown";
}

export interface AssessFormatReadinessOpts {
  /** For `not_required`, caller supplies whether persisted source matches. */
  ratioMatchesFormat?: boolean;
  /** For `completed`, caller supplies whether the corrected master is persisted. */
  correctedMasterStoragePath?: string | null;
  correctedMasterWidth?: number | null;
  correctedMasterHeight?: number | null;
}

export function assessFormatReadiness(
  status: string | null | undefined,
  opts: AssessFormatReadinessOpts = {},
): FormatReadiness {
  switch (status) {
    case "pending":
      return {
        isFormatReady: false,
        label: "Preparing poster format",
        tone: "info",
        reason: "pending",
      };
    case "processing":
      return {
        isFormatReady: false,
        label: "Finalizing poster format",
        tone: "info",
        reason: "processing",
      };
    case "failed":
      return {
        isFormatReady: false,
        label: "Poster-format finalization failed",
        tone: "danger",
        reason: "failed",
      };
    case "completed": {
      // Require corrected-master identity when the caller supplies it.
      // When the caller has no signal (`undefined`), trust the DB status.
      const missing =
        opts.correctedMasterStoragePath === null
        || (opts.correctedMasterWidth !== undefined && (opts.correctedMasterWidth ?? 0) <= 0)
        || (opts.correctedMasterHeight !== undefined && (opts.correctedMasterHeight ?? 0) <= 0);
      if (missing) {
        return {
          isFormatReady: false,
          label: "Not fully validated",
          tone: "warning",
          reason: "completed-missing-master",
        };
      }
      return {
        isFormatReady: true,
        label: "Format ready",
        tone: "success",
        reason: "completed",
      };
    }
    case "not_required":
      if (opts.ratioMatchesFormat) {
        return {
          isFormatReady: true,
          label: "Format ready",
          tone: "success",
          reason: "not_required-match",
        };
      }
      return {
        isFormatReady: false,
        label: "Not fully validated",
        tone: "warning",
        reason: "not_required-mismatch",
      };
    default:
      return {
        isFormatReady: false,
        label: "Not fully validated",
        tone: "muted",
        reason: "unknown",
      };
  }
}

/**
 * @deprecated Prefer {@link assessFormatReadiness}. This alias returns
 * the same tone/label and exposes `isPrintReady` for legacy callers that
 * (misleadingly) treated ratio completion as print-readiness.
 */
export interface RatioReadiness {
  isPrintReady: boolean;
  label: string;
  tone: FormatReadiness["tone"];
  reason: FormatReadiness["reason"];
}

export function assessRatioReadiness(
  status: string | null | undefined,
  opts: AssessFormatReadinessOpts = {},
): RatioReadiness {
  const r = assessFormatReadiness(status, opts);
  return {
    isPrintReady: r.isFormatReady,
    label: r.label,
    tone: r.tone,
    reason: r.reason,
  };
}
