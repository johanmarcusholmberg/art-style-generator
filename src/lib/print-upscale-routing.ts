/**
 * Print-aware upscale routing.
 *
 * Given an asset's *actual* measured pixel dimensions and a target print
 * format, this helper recommends the **smallest existing upscale mode**
 * that safely clears the format's 300 PPI pixel target.
 *
 * This is a pure recommender — it does NOT execute any upscale, mutate
 * any DB row, or call providers. It only inspects modes already declared
 * in `src/lib/upscale-modes.ts` and `src/lib/print-formats.ts`.
 *
 * Manual override is always allowed: callers may pick any other available
 * mode even when the helper recommends a different one. When the user
 * picks a mode that does not clear the target, callers should surface the
 * `warning` field that this helper returns from `assessSelectedMode`.
 *
 * Repeated upscale: this helper deliberately does NOT block re-upscales.
 * When `alreadyUpscaled === true` the reason becomes `needs-repeat-upscale`
 * and a soft warning is attached, but routing still returns a mode.
 */

import {
  UPSCALE_MODES,
  type UpscaleMode,
  type UpscaleModeConfig,
  type UpscaleSurface,
  getUpscaleOptionsForSurface,
} from "@/lib/upscale-modes";
import { getPrintFormat, type PrintFormat } from "@/lib/print-formats";

export type PrintUpscaleRoutingReason =
  | "native-meets-target"
  | "needs-light-upscale"
  | "needs-standard-upscale"
  | "needs-large-upscale"
  | "needs-repeat-upscale"
  | "unknown-dimensions-fallback"
  | "no-mode-clears-target";

export interface PrintUpscaleRoutingInput {
  /** Actual measured width of the best available source asset (px) */
  sourceWidth?: number | null;
  /** Actual measured height of the best available source asset (px) */
  sourceHeight?: number | null;
  /** Optional explicit target pixel dimensions. Overrides format lookup. */
  targetWidth?: number | null;
  targetHeight?: number | null;
  /** Poster/print format id. Used to derive target dims if not provided. */
  posterFormatId?: string | null;
  /** True if the source has already been upscaled at least once. */
  alreadyUpscaled?: boolean;
  /** Restrict candidate modes to those exposed on a given surface. */
  surface?: UpscaleSurface;
  /**
   * Optional explicit allow-list of modes (overrides surface filtering).
   * Useful when the caller wants to mirror what its own picker offers.
   */
  availableModes?: UpscaleMode[];
}

export interface PrintUpscaleRoutingResult {
  /** False only when source already meets target. */
  upscaleNeeded: boolean;
  /**
   * Scale factor required to fully clear the target pixel dimensions,
   * rounded to 2 decimals. `null` when source dimensions are unknown.
   */
  requiredScale: number | null;
  /**
   * Recommended mode. `null` only when no upscale is needed AND the source
   * already meets the target. Otherwise always populated — even when no
   * mode fully clears, we recommend the safest available print route.
   */
  recommendedMode: UpscaleMode | null;
  /** Predicted output dimensions after running the recommended mode. */
  expectedOutput: { width: number; height: number } | null;
  /** Whether the recommended mode's expected output clears the target. */
  clearsTarget: boolean;
  /** Stable, machine-readable reason. */
  reason: PrintUpscaleRoutingReason;
  /** Short UI-ready label for the reason. */
  reasonLabel: string;
  /** Optional warning the UI should surface (already upscaled, gap, …). */
  warning: string | null;
  /** Manual override is always permitted (kept on the result for clarity). */
  allowManualOverride: true;
  /** Target dimensions actually used to compute the recommendation. */
  target: { width: number; height: number } | null;
}

const REASON_LABEL: Record<PrintUpscaleRoutingReason, string> = {
  "native-meets-target": "Source already meets the print target",
  "needs-light-upscale": "Light upscale recommended",
  "needs-standard-upscale": "Standard 4× upscale recommended",
  "needs-large-upscale": "Large upscale recommended",
  "needs-repeat-upscale": "Second upscale pass recommended",
  "unknown-dimensions-fallback": "Source dimensions unknown — using safe default",
  "no-mode-clears-target": "No available mode fully clears the target",
};

/**
 * Resolve effective target pixel dimensions from input.
 * Returns null when neither explicit dims nor a known print format is provided.
 */
function resolveTarget(
  input: PrintUpscaleRoutingInput,
): { width: number; height: number; format: PrintFormat | null } | null {
  if (input.targetWidth && input.targetHeight) {
    return {
      width: input.targetWidth,
      height: input.targetHeight,
      format: input.posterFormatId
        ? getPrintFormat(input.posterFormatId) ?? null
        : null,
    };
  }
  if (input.posterFormatId) {
    const f = getPrintFormat(input.posterFormatId);
    if (f) return { width: f.preferredPixelWidth, height: f.preferredPixelHeight, format: f };
  }
  return null;
}

/** Build the list of upscaling-capable candidate modes from the input. */
function resolveCandidateModes(input: PrintUpscaleRoutingInput): UpscaleModeConfig[] {
  const all = input.availableModes
    ? input.availableModes
        .map((m) => UPSCALE_MODES[m])
        .filter((m): m is UpscaleModeConfig => !!m && m.enabled)
    : getUpscaleOptionsForSurface(input.surface ?? "manual");
  // Routing only cares about modes that actually upscale.
  // `print_target_300` is a dynamic-scale mode whose effective scaleFactor
  // depends on a calculated plan — the dialog computes that separately
  // (via `calculatePrintTargetUpscale`). Exclude it from the generic
  // smallest-clearing picker so routing keeps using fixed-factor modes.
  return all.filter((m) => m.runs && m.scaleFactor > 1 && m.id !== "print_target_300");
}

/**
 * Pick the smallest mode that clears the required scale.
 * Tie-breaker among same-scaleFactor modes: prefer the cheapest cost tier,
 * then the non-tiled variant (lighter on memory).
 */
function pickSmallestClearingMode(
  candidates: UpscaleModeConfig[],
  requiredScale: number,
): UpscaleModeConfig | null {
  const clearing = candidates.filter((c) => c.scaleFactor >= requiredScale);
  if (clearing.length === 0) return null;
  const COST_RANK: Record<string, number> = { free: 0, low: 1, medium: 2, high: 3 };
  return [...clearing].sort((a, b) => {
    if (a.scaleFactor !== b.scaleFactor) return a.scaleFactor - b.scaleFactor;
    const cr = COST_RANK[a.estimatedCost] - COST_RANK[b.estimatedCost];
    if (cr !== 0) return cr;
    if (a.tiled !== b.tiled) return a.tiled ? 1 : -1;
    return a.id.localeCompare(b.id);
  })[0];
}

/** Pick the largest available mode — used as the "best we can do" fallback. */
function pickLargestMode(candidates: UpscaleModeConfig[]): UpscaleModeConfig | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.scaleFactor - a.scaleFactor)[0];
}

function categorizeRequired(scale: number): PrintUpscaleRoutingReason {
  if (scale <= 2) return "needs-light-upscale";
  if (scale <= 4) return "needs-standard-upscale";
  return "needs-large-upscale";
}

/**
 * Main entry point. Returns a recommendation that the UI / hook layer
 * can use to seed the upscale dialog and explain the choice.
 */
export function recommendPrintUpscaleRoute(
  input: PrintUpscaleRoutingInput,
): PrintUpscaleRoutingResult {
  const target = resolveTarget(input);
  const candidates = resolveCandidateModes(input);

  // Unknown source dims → safe fallback (do not block).
  if (!input.sourceWidth || !input.sourceHeight) {
    const fallback =
      candidates.find((c) => c.id === "realesrgan_4x") ??
      candidates[0] ??
      null;
    return {
      upscaleNeeded: true,
      requiredScale: null,
      recommendedMode: fallback?.id ?? null,
      expectedOutput: null,
      clearsTarget: false,
      reason: "unknown-dimensions-fallback",
      reasonLabel: REASON_LABEL["unknown-dimensions-fallback"],
      warning: "Source dimensions are not measured; recommendation is a safe default.",
      allowManualOverride: true,
      target: target ? { width: target.width, height: target.height } : null,
    };
  }

  // No target provided — return a soft "no-op" recommendation.
  if (!target) {
    return {
      upscaleNeeded: false,
      requiredScale: null,
      recommendedMode: null,
      expectedOutput: { width: input.sourceWidth, height: input.sourceHeight },
      clearsTarget: true,
      reason: "native-meets-target",
      reasonLabel: REASON_LABEL["native-meets-target"],
      warning: null,
      allowManualOverride: true,
      target: null,
    };
  }

  const scaleW = target.width / input.sourceWidth;
  const scaleH = target.height / input.sourceHeight;
  const requiredScaleRaw = Math.max(scaleW, scaleH);
  const requiredScale = Math.round(requiredScaleRaw * 100) / 100;

  // Source already meets target.
  if (requiredScaleRaw <= 1) {
    return {
      upscaleNeeded: false,
      requiredScale,
      recommendedMode: null,
      expectedOutput: { width: input.sourceWidth, height: input.sourceHeight },
      clearsTarget: true,
      reason: "native-meets-target",
      reasonLabel: REASON_LABEL["native-meets-target"],
      warning: input.alreadyUpscaled
        ? "Source already upscaled and already meets the target."
        : null,
      allowManualOverride: true,
      target: { width: target.width, height: target.height },
    };
  }

  const clearing = pickSmallestClearingMode(candidates, requiredScaleRaw);
  const chosen = clearing ?? pickLargestMode(candidates);

  if (!chosen) {
    return {
      upscaleNeeded: true,
      requiredScale,
      recommendedMode: null,
      expectedOutput: null,
      clearsTarget: false,
      reason: "no-mode-clears-target",
      reasonLabel: REASON_LABEL["no-mode-clears-target"],
      warning: "No upscale mode is available for this surface.",
      allowManualOverride: true,
      target: { width: target.width, height: target.height },
    };
  }

  const expectedOutput = {
    width: Math.round(input.sourceWidth * chosen.scaleFactor),
    height: Math.round(input.sourceHeight * chosen.scaleFactor),
  };
  const clearsTarget =
    expectedOutput.width >= target.width && expectedOutput.height >= target.height;

  let reason: PrintUpscaleRoutingReason;
  let warning: string | null = null;

  if (!clearsTarget) {
    reason = "no-mode-clears-target";
    warning = `Even the strongest available mode (${chosen.shortLabel}, ${chosen.scaleFactor}×) does not fully reach the ${target.width}×${target.height} target.`;
  } else if (input.alreadyUpscaled) {
    reason = "needs-repeat-upscale";
    warning =
      "This image has already been upscaled. A second upscale may increase size but can also soften details.";
  } else {
    reason = categorizeRequired(requiredScaleRaw);
  }

  return {
    upscaleNeeded: true,
    requiredScale,
    recommendedMode: chosen.id,
    expectedOutput,
    clearsTarget,
    reason,
    reasonLabel: REASON_LABEL[reason],
    warning,
    allowManualOverride: true,
    target: { width: target.width, height: target.height },
  };
}

export interface SelectedModeAssessment {
  clearsTarget: boolean;
  expectedOutput: { width: number; height: number } | null;
  isMoreAggressiveThanNeeded: boolean;
  warning: string | null;
}

/**
 * Assess a user-selected mode against the same target/source pair.
 * Used to power the "manual override may not reach target" warning.
 */
export function assessSelectedMode(
  input: PrintUpscaleRoutingInput,
  selected: UpscaleMode,
): SelectedModeAssessment {
  const cfg = UPSCALE_MODES[selected];
  if (!cfg || !cfg.runs) {
    return {
      clearsTarget: false,
      expectedOutput: null,
      isMoreAggressiveThanNeeded: false,
      warning: null,
    };
  }
  const target = resolveTarget(input);
  if (!input.sourceWidth || !input.sourceHeight || !target) {
    return {
      clearsTarget: false,
      expectedOutput: null,
      isMoreAggressiveThanNeeded: false,
      warning: null,
    };
  }
  const expectedOutput = {
    width: Math.round(input.sourceWidth * cfg.scaleFactor),
    height: Math.round(input.sourceHeight * cfg.scaleFactor),
  };
  const requiredScale = Math.max(
    target.width / input.sourceWidth,
    target.height / input.sourceHeight,
  );
  const clearsTarget =
    expectedOutput.width >= target.width && expectedOutput.height >= target.height;
  const recommended = recommendPrintUpscaleRoute(input).recommendedMode;
  const recommendedScale = recommended
    ? UPSCALE_MODES[recommended].scaleFactor
    : 0;
  const isMoreAggressiveThanNeeded =
    clearsTarget && cfg.scaleFactor > Math.max(recommendedScale, requiredScale);
  let warning: string | null = null;
  if (!clearsTarget) {
    warning = `Selected mode ${cfg.shortLabel} (${cfg.scaleFactor}×) does not fully reach the ${target.width}×${target.height} target.`;
  } else if (isMoreAggressiveThanNeeded) {
    warning = `Selected mode ${cfg.shortLabel} is more aggressive than needed for this target.`;
  }
  return { clearsTarget, expectedOutput, isMoreAggressiveThanNeeded, warning };
}
