/**
 * ratio-finalization-state — pure state model for durable poster-ratio
 * enforcement. This file defines the allowed states and transitions.
 * A future worker (Turn 2c) drives the transitions.
 */

export type RatioFinalizationState =
  | "not_required"
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export const RATIO_FINALIZATION_STATES: readonly RatioFinalizationState[] = [
  "not_required",
  "pending",
  "processing",
  "completed",
  "failed",
] as const;

/** Terminal (no autonomous transition). `failed` is terminal until retry. */
export function isRatioFinalizationTerminal(state: RatioFinalizationState): boolean {
  return state === "not_required" || state === "completed" || state === "failed";
}

/** Whether a member with this state is eligible for print export. */
export function isRatioFinalizationPrintEligible(
  state: RatioFinalizationState,
  opts: { assetMatchesRequiredRatio: boolean } = { assetMatchesRequiredRatio: false },
): boolean {
  if (state === "completed") return true;
  if (state === "not_required") return opts.assetMatchesRequiredRatio;
  return false;
}

/**
 * Allowed transitions. Direct `pending → completed` is intentionally
 * rejected — the worker must go through `processing` so heartbeat /
 * lease logic remains observable. A future atomic path will need to
 * declare an explicit override; add it here when introduced.
 */
export function canTransitionRatioState(
  from: RatioFinalizationState,
  to: RatioFinalizationState,
): boolean {
  if (from === to) return true; // idempotent no-op
  switch (from) {
    case "not_required":
      return false; // terminal
    case "pending":
      return to === "processing" || to === "failed";
    case "processing":
      return to === "completed" || to === "failed";
    case "failed":
      return to === "pending"; // explicit retry
    case "completed":
      return false; // terminal
    default:
      return false;
  }
}
