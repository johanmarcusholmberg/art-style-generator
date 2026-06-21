/**
 * Confirmation dialog before running an upscale / enhancement pass.
 *
 * Surfaces three things up-front so cost-control is explicit:
 *   • Method      — Real-ESRGAN / Tiled SDXL / SUPIR
 *   • Output      — expected scale factor (e.g. 4×)
 *   • Cost label  — Low / Medium / High (with monetary tier indicator)
 *
 * Behaviour:
 *   - "Enhance for print" defaults to the cheapest sensible mode (Real-ESRGAN 4×)
 *   - SUPIR ("Print+") is reachable here too, but always behind a clear
 *     "High cost" label and never auto-selected
 *   - When an enhanced master already exists, the dialog title shifts to
 *     "Re-enhance" so the user knows they'll be re-spending budget
 *
 * Pure presentation — does NOT trigger any network calls. The caller wires
 * `onConfirm(mode)` to the actual upscale runner.
 */
import { useState, useMemo } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ArrowUpCircle, Sparkles, AlertTriangle, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  UPSCALE_MODES,
  UPSCALE_COST_LABEL,
  type UpscaleMode,
  type UpscaleCostTier,
} from "@/lib/upscale-modes";
import type { UpscaleRecipe } from "@/lib/upscale-recipes";
import {
  recommendPrintUpscaleRoute,
  assessSelectedMode,
  type PrintUpscaleRoutingResult,
} from "@/lib/print-upscale-routing";
import { resolveUpscaleSource } from "@/lib/upscale-source";
import { getPrintFormat } from "@/lib/print-formats";

const COST_PILL: Record<UpscaleCostTier, { label: string; className: string }> = {
  free: {
    label: "Free",
    className: "bg-muted text-muted-foreground border-border",
  },
  low: {
    label: "Low cost",
    className: "bg-primary/10 text-primary border-primary/30",
  },
  medium: {
    label: "Medium cost",
    className: "bg-orange-500/10 text-orange-500 border-orange-500/30",
  },
  high: {
    label: "High cost",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

/** The modes offered by this dialog, in display order. */
const OFFERED_MODES: UpscaleMode[] = [
  "realesrgan_4x", // default — low cost, 4×
  "tile_4x",       // medium cost, tiled 4×
  "tile_8x",       // high cost, tiled 8× (needed to clear 50×70 @ 300 PPI)
  "print_plus",    // high cost — ESRGAN → SUPIR
];

export interface EnhanceForPrintDialogSourceDecision {
  choice: "auto" | "original" | "enhanced";
  resolved: "original" | "enhanced";
  url: string | null;
  width: number | null;
  height: number | null;
  sourceWasAlreadyUpscaled: boolean;
}

export interface EnhanceForPrintDialogProps {
  /** Render-prop trigger. The button you pass becomes the dialog opener. */
  trigger: React.ReactNode;
  /** True when an enhanced master already exists. Shifts copy & button. */
  hasEnhanced?: boolean;
  /** Optional source pixel dimensions, used to project output resolution. */
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  /**
   * Plan #2d — explicit original/enhanced source candidates. When both are
   * provided, the dialog exposes a 3-pill source toggle (Auto / Original /
   * Current enhanced) and threads the selection into `onConfirm`.
   */
  originalSource?: { url: string | null; width: number | null; height: number | null } | null;
  enhancedSource?: { url: string | null; width: number | null; height: number | null } | null;
  /** Optional recipe — used as fallback when print routing has no input. */
  recommendedRecipe?: UpscaleRecipe | null;
  /** Print format id — enables actual-dimension-aware upscale routing. */
  posterFormatId?: string | null;
  /** True if the source asset has already been upscaled at least once. */
  alreadyUpscaled?: boolean;
  /** Disable the dialog (e.g. when something is already running). */
  disabled?: boolean;
  /** Fired when the user confirms a method. */
  onConfirm: (
    mode: UpscaleMode,
    recipe?: UpscaleRecipe | null,
    source?: EnhanceForPrintDialogSourceDecision,
  ) => void;
}

export default function EnhanceForPrintDialog({
  trigger,
  hasEnhanced,
  sourceWidth,
  sourceHeight,
  originalSource,
  enhancedSource,
  recommendedRecipe,
  posterFormatId,
  alreadyUpscaled,
  disabled,
  onConfirm,
}: EnhanceForPrintDialogProps) {
  const [open, setOpen] = useState(false);

  // Source selection — only meaningful when both candidates exist.
  const bothSourcesAvailable =
    !!originalSource?.url && !!enhancedSource?.url;
  const [sourceChoice, setSourceChoice] = useState<"auto" | "original" | "enhanced">(
    "auto",
  );

  // Resolve which source to actually use (and route against).
  const resolvedSource = useMemo(() => {
    if (!bothSourcesAvailable) {
      return resolveUpscaleSource({
        original: {
          url: originalSource?.url ?? null,
          width: originalSource?.width ?? sourceWidth ?? null,
          height: originalSource?.height ?? sourceHeight ?? null,
        },
        enhanced: enhancedSource?.url
          ? {
              url: enhancedSource.url,
              width: enhancedSource.width ?? null,
              height: enhancedSource.height ?? null,
            }
          : null,
        posterFormatId,
        availableModes: OFFERED_MODES,
        choice: "auto",
      });
    }
    return resolveUpscaleSource({
      original: {
        url: originalSource!.url,
        width: originalSource!.width,
        height: originalSource!.height,
      },
      enhanced: {
        url: enhancedSource!.url,
        width: enhancedSource!.width,
        height: enhancedSource!.height,
      },
      posterFormatId,
      availableModes: OFFERED_MODES,
      choice: sourceChoice,
    });
  }, [
    bothSourcesAvailable,
    originalSource,
    enhancedSource,
    posterFormatId,
    sourceChoice,
    sourceWidth,
    sourceHeight,
  ]);

  // Effective routing inputs — derived from the chosen source's dimensions
  // (falls back to legacy sourceWidth/Height when no candidates were passed).
  const effectiveWidth = resolvedSource.width ?? sourceWidth ?? null;
  const effectiveHeight = resolvedSource.height ?? sourceHeight ?? null;
  const effectiveAlreadyUpscaled =
    resolvedSource.sourceWasAlreadyUpscaled || !!alreadyUpscaled;

  const routing: PrintUpscaleRoutingResult | null = useMemo(() => {
    if (!posterFormatId) return null;
    return recommendPrintUpscaleRoute({
      sourceWidth: effectiveWidth,
      sourceHeight: effectiveHeight,
      posterFormatId,
      alreadyUpscaled: effectiveAlreadyUpscaled,
      availableModes: OFFERED_MODES,
    });
  }, [effectiveWidth, effectiveHeight, posterFormatId, effectiveAlreadyUpscaled]);

  const initialMode: UpscaleMode = (() => {
    const routed = routing?.recommendedMode;
    if (routed && OFFERED_MODES.includes(routed)) return routed;
    if (
      recommendedRecipe?.recommendedMode &&
      OFFERED_MODES.includes(recommendedRecipe.recommendedMode)
    ) {
      return recommendedRecipe.recommendedMode;
    }
    return "realesrgan_4x";
  })();
  const [picked, setPicked] = useState<UpscaleMode>(initialMode);

  const expectedOutput = useMemo(() => {
    if (!effectiveWidth || !effectiveHeight) return null;
    const cfg = UPSCALE_MODES[picked];
    const w = Math.round(effectiveWidth * cfg.scaleFactor);
    const h = Math.round(effectiveHeight * cfg.scaleFactor);
    const format = posterFormatId ? getPrintFormat(posterFormatId) : null;
    let ppi: number | null = null;
    let ppiTier: "preferred" | "fallback" | "below" | null = null;
    if (format) {
      const CM_TO_INCHES = 1 / 2.54;
      const ppiW = w / (format.widthCm * CM_TO_INCHES);
      const ppiH = h / (format.heightCm * CM_TO_INCHES);
      ppi = Math.round(Math.min(ppiW, ppiH));
      ppiTier = ppi >= 300 ? "preferred" : ppi >= 150 ? "fallback" : "below";
    }
    return { w, h, factor: cfg.scaleFactor, ppi, ppiTier, format };
  }, [picked, effectiveWidth, effectiveHeight, posterFormatId]);

  const selectedAssessment = useMemo(() => {
    if (!posterFormatId) return null;
    return assessSelectedMode(
      {
        sourceWidth: effectiveWidth,
        sourceHeight: effectiveHeight,
        posterFormatId,
        alreadyUpscaled: effectiveAlreadyUpscaled,
      },
      picked,
    );
  }, [picked, effectiveWidth, effectiveHeight, posterFormatId, effectiveAlreadyUpscaled]);

  const formatLabel = posterFormatId
    ? getPrintFormat(posterFormatId)?.label
    : null;

  const pickedCfg = UPSCALE_MODES[picked];
  const isHighCost = pickedCfg.estimatedCost === "high";

  // Soft source-specific warning shown under the toggle.
  const sourceWarning = (() => {
    if (!bothSourcesAvailable) return null;
    if (resolvedSource.resolved === "enhanced") {
      return "Current enhanced — useful when the first upscale looks good but more pixels are needed. Repeated upscales can soften fine detail or introduce subtle artifacts.";
    }
    return "Original master — the cleanest source, best for preserving quality. It may need a stronger upscale route to reach the target size.";
  })();

  const handleConfirm = () => {
    setOpen(false);
    onConfirm(
      picked,
      recommendedRecipe?.recommendedMode === picked ? recommendedRecipe : null,
      {
        choice: sourceChoice,
        resolved: resolvedSource.resolved,
        url: resolvedSource.url,
        width: resolvedSource.width,
        height: resolvedSource.height,
        sourceWasAlreadyUpscaled: resolvedSource.sourceWasAlreadyUpscaled,
      },
    );
  };


  return (
    <AlertDialog open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <AlertDialogTrigger asChild disabled={disabled}>
        {trigger}
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display flex items-center gap-2">
            <ArrowUpCircle className="h-4 w-4 text-primary" />
            {hasEnhanced ? "Re-enhance image" : "Enhance for print"}
          </AlertDialogTitle>
          <AlertDialogDescription className="font-display text-xs leading-relaxed">
            {hasEnhanced
              ? "An enhanced master already exists. Running another enhancement will create a new master and use additional credits."
              : "For maximum print quality, use the recommended style-specific upscale. Real-ESRGAN 4× is the default for web and smaller prints. For large formats such as 50×70 cm, Tile 8× is recommended when 4× cannot reach 300 PPI."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Source picker — only when both original and enhanced exist */}
        {bothSourcesAvailable && (
          <div className="space-y-1.5 pt-1">
            <p className="font-display text-[11px] text-muted-foreground uppercase tracking-wider">
              Upscale from
            </p>
            <div className="inline-flex gap-1 p-0.5 rounded-sm border border-border bg-muted/40">
              {(["auto", "original", "enhanced"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSourceChoice(c)}
                  className={cn(
                    "font-display text-[10px] uppercase tracking-wider px-2 py-1 rounded-sm transition-colors",
                    sourceChoice === c
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c === "auto"
                    ? "Auto"
                    : c === "original"
                      ? "Original master"
                      : "Current enhanced"}
                </button>
              ))}
            </div>
            {sourceWarning && (
              <p className="font-display text-[11px] text-muted-foreground leading-snug pt-1">
                {sourceWarning}
              </p>
            )}
          </div>
        )}

        {/* Method picker */}
        <div className="space-y-2 py-2">
          {OFFERED_MODES.map((m) => {
            const cfg = UPSCALE_MODES[m];
            const isPicked = picked === m;
            const cost = COST_PILL[cfg.estimatedCost];
            const isRoutingPick = routing?.recommendedMode === m;
            const isRecommended =
              isRoutingPick || (!routing && recommendedRecipe?.recommendedMode === m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => setPicked(m)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-sm border font-display transition-colors",
                  isPicked
                    ? "bg-primary/10 border-primary/50"
                    : "bg-card border-border hover:bg-muted",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-foreground truncate">
                      {cfg.label}
                    </span>
                    {isRecommended && (
                      <span className="inline-flex items-center gap-0.5 px-1 rounded-sm bg-primary/15 text-primary text-[9px] uppercase tracking-wider">
                        <Star className="h-2.5 w-2.5 fill-primary" /> Rec
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-sm border font-bold uppercase tracking-wider",
                      cost.className,
                    )}
                    title={UPSCALE_COST_LABEL[cfg.estimatedCost]}
                  >
                    {cost.label}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  {cfg.description}
                </p>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                  <span>⏱ {cfg.estimatedTime}</span>
                  <span>· {cfg.scaleFactor}× output</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Expected output */}
        <div className="rounded-sm border border-border bg-muted/40 px-3 py-2 space-y-1">
          <p className="font-display text-[11px] text-muted-foreground">
            Expected output
          </p>
          <p className="font-display text-xs text-foreground">
            <Sparkles className="inline h-3 w-3 mr-1 text-primary" />
            {expectedOutput
              ? `${expectedOutput.w} × ${expectedOutput.h} px (${expectedOutput.factor}× of source)`
              : `${pickedCfg.scaleFactor}× resolution`}
          </p>
          {expectedOutput?.ppi != null && expectedOutput.format && (
            <p
              className={cn(
                "font-display text-[11px] leading-snug",
                expectedOutput.ppiTier === "preferred"
                  ? "text-primary"
                  : expectedOutput.ppiTier === "fallback"
                    ? "text-orange-500"
                    : "text-destructive",
              )}
            >
              ≈ {expectedOutput.ppi} PPI at {expectedOutput.format.label}
              {expectedOutput.ppiTier === "preferred" && " · full print quality (300 PPI)"}
              {expectedOutput.ppiTier === "fallback" && " · standard print quality (150 PPI)"}
              {expectedOutput.ppiTier === "below" && " · below 150 PPI — soft print"}
            </p>
          )}
          {bothSourcesAvailable && resolvedSource.width && resolvedSource.height && (
            <p className="font-display text-[10px] text-muted-foreground leading-snug">
              Source: {resolvedSource.resolved === "enhanced" ? "current enhanced" : "original master"} · {resolvedSource.width}×{resolvedSource.height} px
            </p>
          )}
          {isHighCost && (
            <p className="font-display text-[11px] text-destructive flex items-center gap-1 pt-1">
              <AlertTriangle className="h-3 w-3" />
              SUPIR is the highest-cost method. Use it only for fine-art prints.
            </p>
          )}
          {routing && routing.target && (
            <p className="font-display text-[11px] text-muted-foreground pt-1 leading-snug">
              {sourceWidth && sourceHeight
                ? `Source: ${sourceWidth}×${sourceHeight} · `
                : "Source: not measured · "}
              Target{formatLabel ? ` (${formatLabel})` : ""}: {routing.target.width}×{routing.target.height}
              {routing.requiredScale != null && ` · Required: ${routing.requiredScale}×`}
              {routing.recommendedMode &&
                ` · Recommended: ${UPSCALE_MODES[routing.recommendedMode].shortLabel}`}
            </p>
          )}
          {routing?.warning && (
            <p className="font-display text-[11px] text-orange-500 flex items-start gap-1 pt-1 leading-snug">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              {routing.warning}
            </p>
          )}
          {selectedAssessment?.warning &&
            selectedAssessment.warning !== routing?.warning && (
              <p className="font-display text-[11px] text-orange-500 flex items-start gap-1 pt-1 leading-snug">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                {selectedAssessment.warning}
              </p>
            )}
        </div>


        <AlertDialogFooter>
          <AlertDialogCancel className="font-display">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={cn(
              "font-display",
              isHighCost &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {hasEnhanced ? "Re-enhance" : "Enhance for print"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
