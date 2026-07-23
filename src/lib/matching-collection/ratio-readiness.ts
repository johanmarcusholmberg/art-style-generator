/**
 * Format readiness (ratio-only) vs full print readiness.
 *
 * `assessFormatReadiness` answers a single question: is the poster-format
 * ratio validated for this member? It intentionally does NOT know about
 * physical print sizes or PPI — full print readiness composes this with
 * `getPrintReadinessStatus` from `@/lib/print-readiness`.
 *
 * Strict rules (turn 2c.2):
 *   - "completed"    → requires an explicit non-null corrected-master
 *                      storage path AND positive corrected-master width
 *                      AND positive corrected-master height. Missing
 *                      (`undefined`) counts as "not verified" — the
 *                      caller must supply the fields to claim readiness.
 *   - "not_required" → requires an explicit persisted source storage
 *                      path AND positive source dimensions AND a
 *                      verified `ratioMatchesFormat === true`. Missing
 *                      any of these means "not verified".
 *   - pending/processing/failed/unknown → not ready.
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
    | "not_required-missing-source"
    | "unknown";
}

export interface AssessFormatReadinessOpts {
  /** For `not_required`: caller supplies whether persisted source matches. */
  ratioMatchesFormat?: boolean;
  /** For `not_required`: caller supplies persisted source path + dims. */
  sourceStoragePath?: string | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  /** For `completed`: caller supplies the corrected-master identity. */
  correctedMasterStoragePath?: string | null;
  correctedMasterWidth?: number | null;
  correctedMasterHeight?: number | null;
}

function isPositive(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function assessFormatReadiness(
  status: string | null | undefined,
  opts: AssessFormatReadinessOpts = {},
): FormatReadiness {
  switch (status) {
    case "pending":
      return { isFormatReady: false, label: "Preparing poster format", tone: "info", reason: "pending" };
    case "processing":
      return { isFormatReady: false, label: "Finalizing poster format", tone: "info", reason: "processing" };
    case "failed":
      return { isFormatReady: false, label: "Poster-format finalization failed", tone: "danger", reason: "failed" };
    case "completed": {
      // Strict: caller MUST supply explicit corrected-master identity.
      // `undefined` is treated as "not verified", not as implicit proof.
      const path = opts.correctedMasterStoragePath;
      const w = opts.correctedMasterWidth;
      const h = opts.correctedMasterHeight;
      if (typeof path !== "string" || path.length === 0 || !isPositive(w) || !isPositive(h)) {
        return {
          isFormatReady: false,
          label: "Not fully validated",
          tone: "warning",
          reason: "completed-missing-master",
        };
      }
      return { isFormatReady: true, label: "Format ready", tone: "success", reason: "completed" };
    }
    case "not_required": {
      const path = opts.sourceStoragePath;
      const w = opts.sourceWidth;
      const h = opts.sourceHeight;
      const havePersistedSource =
        typeof path === "string" && path.length > 0 && isPositive(w) && isPositive(h);
      if (!havePersistedSource) {
        return {
          isFormatReady: false,
          label: "Not fully validated",
          tone: "warning",
          reason: "not_required-missing-source",
        };
      }
      if (opts.ratioMatchesFormat === true) {
        return { isFormatReady: true, label: "Format ready", tone: "success", reason: "not_required-match" };
      }
      return {
        isFormatReady: false,
        label: "Not fully validated",
        tone: "warning",
        reason: "not_required-mismatch",
      };
    }
    default:
      return { isFormatReady: false, label: "Not fully validated", tone: "muted", reason: "unknown" };
  }
}
