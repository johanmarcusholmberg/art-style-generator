/**
 * Resolves which asset (original/master vs current enhanced/upscaled)
 * should be the input to the next upscale pass.
 *
 * Pure helper. Two responsibilities:
 *
 *   1. Honour the user's explicit `sourceChoice` when both options exist.
 *   2. When `sourceChoice === "auto"`, pick a sensible default given
 *      whether the enhanced source already clears the print target.
 *
 * Decision rules (Auto):
 *   - No enhanced source             → use original.
 *   - Enhanced source missing dims   → fall back to original (safer).
 *   - Enhanced exists, clears target → prefer enhanced (but original is
 *                                      still selectable for a clean retry).
 *   - Enhanced exists, gap remains   → prefer enhanced (continue scaling
 *                                      from the higher-res asset).
 *
 * Manual choice is always respected, even when unsafe — the dialog is
 * responsible for surfacing the warning.
 */
import { recommendPrintUpscaleRoute, type PrintUpscaleRoutingInput } from "@/lib/print-upscale-routing";

export type UpscaleSourceChoice = "auto" | "original" | "enhanced";
export type ResolvedUpscaleSource = "original" | "enhanced";

export interface UpscaleSourceCandidate {
  url: string | null;
  width: number | null;
  height: number | null;
}

export interface ResolveUpscaleSourceInput {
  original: UpscaleSourceCandidate;
  enhanced: UpscaleSourceCandidate | null;
  /** Used by Auto to decide whether the enhanced source already clears target. */
  posterFormatId?: string | null;
  /** Optional explicit target — overrides format lookup. */
  targetWidth?: number | null;
  targetHeight?: number | null;
  /** Available modes routing may use when evaluating clearance. */
  availableModes?: PrintUpscaleRoutingInput["availableModes"];
  /** User's explicit choice. Defaults to "auto". */
  choice?: UpscaleSourceChoice;
}

export interface ResolvedUpscaleSourceResult {
  choice: UpscaleSourceChoice;
  resolved: ResolvedUpscaleSource;
  url: string | null;
  width: number | null;
  height: number | null;
  /** True when the resolved source has already been upscaled. */
  sourceWasAlreadyUpscaled: boolean;
  /** Whether enhanced was actually available to choose from. */
  enhancedAvailable: boolean;
}

function isUsable(c: UpscaleSourceCandidate | null | undefined): c is UpscaleSourceCandidate {
  return !!c && !!c.url;
}

export function resolveUpscaleSource(
  input: ResolveUpscaleSourceInput,
): ResolvedUpscaleSourceResult {
  const choice: UpscaleSourceChoice = input.choice ?? "auto";
  const enhancedAvailable = isUsable(input.enhanced);

  // Explicit "enhanced": honour only when enhanced is actually usable.
  if (choice === "enhanced" && enhancedAvailable) {
    return {
      choice,
      resolved: "enhanced",
      url: input.enhanced!.url,
      width: input.enhanced!.width,
      height: input.enhanced!.height,
      sourceWasAlreadyUpscaled: true,
      enhancedAvailable,
    };
  }

  // Explicit "original" or any case without a usable enhanced source.
  if (choice === "original" || !enhancedAvailable) {
    return {
      choice: enhancedAvailable ? choice : "auto",
      resolved: "original",
      url: input.original.url,
      width: input.original.width,
      height: input.original.height,
      sourceWasAlreadyUpscaled: false,
      enhancedAvailable,
    };
  }

  // Auto with both sources available.
  // Prefer enhanced when it has measurable dimensions; otherwise fall back
  // to original (we don't want to route from "unknown" when we can do better).
  const enhancedHasDims =
    !!input.enhanced?.width && !!input.enhanced?.height;
  if (!enhancedHasDims) {
    return {
      choice: "auto",
      resolved: "original",
      url: input.original.url,
      width: input.original.width,
      height: input.original.height,
      sourceWasAlreadyUpscaled: false,
      enhancedAvailable,
    };
  }

  // Both viable: enhanced is the higher-resolution source, so Auto prefers it
  // both when it clears target (fewer artifacts from a second pass beyond
  // what's needed) and when a gap remains (continue scaling the larger asset).
  // The router will compute whether further upscaling is even required.
  const _routing = recommendPrintUpscaleRoute({
    sourceWidth: input.enhanced!.width,
    sourceHeight: input.enhanced!.height,
    posterFormatId: input.posterFormatId,
    targetWidth: input.targetWidth,
    targetHeight: input.targetHeight,
    availableModes: input.availableModes,
    alreadyUpscaled: true,
  });
  void _routing; // currently informational; reserved for future heuristics
  return {
    choice: "auto",
    resolved: "enhanced",
    url: input.enhanced!.url,
    width: input.enhanced!.width,
    height: input.enhanced!.height,
    sourceWasAlreadyUpscaled: true,
    enhancedAvailable,
  };
}
