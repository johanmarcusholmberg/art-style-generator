/**
 * ratio-readiness — truthful readiness while ratio finalization is still
 * pending / processing / failed. Turn 2c.1 does NOT implement finalization
 * itself; it just prevents readiness from lying about assets that have
 * not yet been validated against their poster format.
 */
export type RatioFinalizationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "not_required";

export interface RatioReadiness {
  /** True only when a validated correctly-sized master is proven. */
  isPrintReady: boolean;
  label: string;
  tone: "info" | "warning" | "success" | "danger" | "muted";
  reason:
    | "pending"
    | "processing"
    | "failed"
    | "completed"
    | "not_required-match"
    | "not_required-mismatch"
    | "unknown";
}

export function assessRatioReadiness(
  status: string | null | undefined,
  opts: { ratioMatchesFormat?: boolean } = {},
): RatioReadiness {
  switch (status) {
    case "pending":
      return {
        isPrintReady: false,
        label: "Preparing poster format",
        tone: "info",
        reason: "pending",
      };
    case "processing":
      return {
        isPrintReady: false,
        label: "Finalizing poster format",
        tone: "info",
        reason: "processing",
      };
    case "failed":
      return {
        isPrintReady: false,
        label: "Poster-format finalization failed",
        tone: "danger",
        reason: "failed",
      };
    case "completed":
      return {
        isPrintReady: true,
        label: "Format ready",
        tone: "success",
        reason: "completed",
      };
    case "not_required":
      if (opts.ratioMatchesFormat) {
        return {
          isPrintReady: true,
          label: "Format ready",
          tone: "success",
          reason: "not_required-match",
        };
      }
      return {
        isPrintReady: false,
        label: "Not fully validated",
        tone: "warning",
        reason: "not_required-mismatch",
      };
    default:
      return {
        isPrintReady: false,
        label: "Not fully validated",
        tone: "muted",
        reason: "unknown",
      };
  }
}
