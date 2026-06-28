/**
 * Confirmation dialog before running an upscale / enhancement pass.
 *
 * Redesigned 2026-Q2 around two clear sections:
 *   • RECOMMENDED — "Print Target 300 PPI"
 *       User picks model family (Real-ESRGAN / Clarity). Required scale
 *       is calculated from the corrected poster master via
 *       `calculatePrintTargetUpscale` and ceiled up to safe provider
 *       precision so the predicted output never falls below 300 PPI.
 *   • ADVANCED   — "Manual upscale"
 *       User picks model family AND scale (presets 2..8 + custom decimal).
 *       Predicted output / PPI / warnings come from `planManualUpscale`.
 *
 * Mode IDs (`print_target_300`, `tile_4x`, `tile_8x`, `clarity_dynamic`)
 * are NEVER shown to the user. They survive as routing tags carried back
 * through `onConfirm` so the hook + edge functions know which path to
 * dispatch and so historical cost-map lookups keep working.
 *
 * Safety rules baked in:
 *   - Both flows operate on the corrected poster master only. The
 *     `sourceWasCorrectedMaster` flag rides along on the source decision
 *     and `useUpscale` re-asserts it before any provider call.
 *   - Predicted long side > 12288 px → action disabled.
 *   - Clarity decimal failure never silently downshifts to 4×/8×.
 *
 * SUPIR / Print+ was retired in 2025-Q4 and is intentionally absent.
 */
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertTriangle,
  ArrowUpCircle,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type UpscaleMode,
  type UpscaleFamily,
  type UpscaleFlow,
} from "@/lib/upscale-modes";
import type { UpscaleRecipe } from "@/lib/upscale-recipes";
import { resolveUpscaleSource } from "@/lib/upscale-source";
import { getPrintFormat } from "@/lib/print-formats";
import {
  calculatePrintTargetUpscale,
  type PrintTargetUpscalePlan,
} from "@/lib/print-target-upscale";
import {
  planManualUpscale,
  MANUAL_UPSCALE_PRESETS,
  type ManualUpscalePlan,
} from "@/lib/manual-upscale";

const FAMILY_LABEL: Record<UpscaleFamily, string> = {
  realesrgan: "Real-ESRGAN",
  clarity: "Clarity",
};

const FAMILY_DESCRIPTION: Record<UpscaleFamily, string> = {
  realesrgan:
    "Fast and predictable. Best for clean poster art, illustrations, graphic styles and exact print-size scaling.",
  clarity:
    "More detailed and creative. Best for textured, painterly or photographic posters. May slightly reinterpret details.",
};

type StatusBadge =
  | "ready"
  | "needs-upscale"
  | "will-clear"
  | "below"
  | "too-large"
  | "blocked";

const BADGE_STYLES: Record<StatusBadge, { label: string; className: string }> = {
  ready: {
    label: "Ready",
    className: "bg-primary/15 text-primary border-primary/40",
  },
  "needs-upscale": {
    label: "Needs upscale",
    className: "bg-muted text-muted-foreground border-border",
  },
  "will-clear": {
    label: "Will clear 300 PPI",
    className: "bg-primary/15 text-primary border-primary/40",
  },
  below: {
    label: "Below 300 PPI",
    className: "bg-orange-500/10 text-orange-500 border-orange-500/30",
  },
  "too-large": {
    label: "Too large",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  blocked: {
    label: "Cannot enhance",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

function StatusBadge({ kind }: { kind: StatusBadge }) {
  const s = BADGE_STYLES[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center font-display text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border",
        s.className,
      )}
    >
      {s.label}
    </span>
  );
}

export interface EnhanceForPrintDialogSourceDecision {
  choice: "auto" | "original" | "enhanced";
  resolved: "original" | "enhanced";
  url: string | null;
  width: number | null;
  height: number | null;
  sourceWasAlreadyUpscaled: boolean;
  /** New routing fields (Phase: print upscale redesign 2026-Q2). */
  upscaleFlow: UpscaleFlow;
  upscaleFamily: UpscaleFamily;
  /** Decimal scale we want the provider to run. */
  requestedScale: number;
  /** True when the dialog is sure the source is on the poster ratio. */
  sourceWasCorrectedMaster: boolean;
  posterFormatId?: string | null;
  /** Plan when the user confirmed the Recommended flow. */
  printTargetPlan?: PrintTargetUpscalePlan | null;
  /** Plan when the user confirmed the Advanced manual flow. */
  manualPlan?: ManualUpscalePlan | null;
  /** Legacy fields kept for compatibility — set from the new fields. */
  dynamicScale?: number | null;
}

export interface EnhanceForPrintDialogProps {
  trigger: React.ReactNode;
  hasEnhanced?: boolean;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  originalSource?: {
    url: string | null;
    width: number | null;
    height: number | null;
  } | null;
  enhancedSource?: {
    url: string | null;
    width: number | null;
    height: number | null;
  } | null;
  recommendedRecipe?: UpscaleRecipe | null;
  posterFormatId?: string | null;
  alreadyUpscaled?: boolean;
  disabled?: boolean;
  onConfirm: (
    mode: UpscaleMode,
    recipe?: UpscaleRecipe | null,
    source?: EnhanceForPrintDialogSourceDecision,
  ) => void;
}

/** Map a plan + flow into a status badge for the Recommended card. */
function recommendedBadge(plan: PrintTargetUpscalePlan | null): StatusBadge {
  if (!plan) return "needs-upscale";
  if (plan.status === "already_ready") return "ready";
  if (plan.status === "output_too_large") return "too-large";
  if (plan.status === "source_too_small") return "blocked";
  return plan.clears300Ppi ? "will-clear" : "below";
}

function manualBadge(plan: ManualUpscalePlan | null): StatusBadge {
  if (!plan) return "needs-upscale";
  if (plan.status === "output_too_large") return "too-large";
  if (plan.status === "invalid_scale") return "blocked";
  if (plan.clears300Ppi) return "will-clear";
  if (plan.posterFormatId) return "below";
  return "needs-upscale";
}

/** Pick the routing mode tag we persist for analytics + cost lookup. */
function modeForPayload(family: UpscaleFamily, flow: UpscaleFlow): UpscaleMode {
  if (family === "clarity") return "clarity_dynamic";
  if (flow === "target_300") return "print_target_300";
  return "realesrgan_4x";
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  /* ---------- Source picker ---------- */
  const bothSourcesAvailable = !!originalSource?.url && !!enhancedSource?.url;
  const [sourceChoice, setSourceChoice] = useState<
    "auto" | "original" | "enhanced"
  >("auto");

  const resolvedSource = useMemo(() => {
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
      choice: bothSourcesAvailable ? sourceChoice : "auto",
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

  const effectiveWidth = resolvedSource.width ?? sourceWidth ?? null;
  const effectiveHeight = resolvedSource.height ?? sourceHeight ?? null;
  const effectiveAlreadyUpscaled =
    resolvedSource.sourceWasAlreadyUpscaled || !!alreadyUpscaled;

  /* ---------- Recommended (target_300) ---------- */
  const [recFamily, setRecFamily] = useState<UpscaleFamily>("realesrgan");

  const recPlan: PrintTargetUpscalePlan | null = useMemo(() => {
    if (!posterFormatId || !effectiveWidth || !effectiveHeight) return null;
    try {
      return calculatePrintTargetUpscale({
        sourceWidth: effectiveWidth,
        sourceHeight: effectiveHeight,
        posterFormatId,
        upscaleFamily: recFamily,
      });
    } catch {
      return null;
    }
  }, [effectiveWidth, effectiveHeight, posterFormatId, recFamily]);

  /* ---------- Advanced (manual) ---------- */
  const [manFamily, setManFamily] = useState<UpscaleFamily>("realesrgan");
  const [manScale, setManScale] = useState<number>(4);
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState("4.0");

  const effectiveManScale = customMode
    ? Number.parseFloat(customInput) || 0
    : manScale;

  const manPlan: ManualUpscalePlan | null = useMemo(() => {
    if (!effectiveWidth || !effectiveHeight) return null;
    return planManualUpscale({
      family: manFamily,
      requestedScale: effectiveManScale,
      sourceWidth: effectiveWidth,
      sourceHeight: effectiveHeight,
      posterFormatId,
    });
  }, [
    manFamily,
    effectiveManScale,
    effectiveWidth,
    effectiveHeight,
    posterFormatId,
  ]);

  /* ---------- Confirm helpers ---------- */
  const formatLabel = posterFormatId
    ? getPrintFormat(posterFormatId)?.label ?? null
    : null;

  const buildDecision = (
    flow: UpscaleFlow,
    family: UpscaleFamily,
    requestedScale: number,
    extra: Partial<EnhanceForPrintDialogSourceDecision> = {},
  ): EnhanceForPrintDialogSourceDecision => ({
    choice: sourceChoice,
    resolved: resolvedSource.resolved,
    url: resolvedSource.url,
    width: resolvedSource.width,
    height: resolvedSource.height,
    sourceWasAlreadyUpscaled: resolvedSource.sourceWasAlreadyUpscaled,
    upscaleFlow: flow,
    upscaleFamily: family,
    requestedScale,
    sourceWasCorrectedMaster: false, // useUpscale re-asserts + corrects
    posterFormatId: posterFormatId ?? null,
    dynamicScale: family === "realesrgan" ? requestedScale : null,
    ...extra,
  });

  const handleRecommendedConfirm = () => {
    if (!recPlan) return;
    if (
      recPlan.status === "source_too_small" ||
      recPlan.status === "output_too_large"
    )
      return;
    setOpen(false);
    const mode = modeForPayload(recFamily, "target_300");
    onConfirm(
      mode,
      recommendedRecipe ?? null,
      buildDecision("target_300", recFamily, recPlan.requestedScale, {
        printTargetPlan: recPlan,
      }),
    );
  };

  const handleManualConfirm = () => {
    if (!manPlan || manPlan.status === "output_too_large" || manPlan.status === "invalid_scale")
      return;
    setOpen(false);
    const mode = modeForPayload(manFamily, "manual");
    onConfirm(
      mode,
      null,
      buildDecision("manual", manFamily, manPlan.effectiveScale, {
        manualPlan: manPlan,
      }),
    );
  };

  const recBadge = recommendedBadge(recPlan);
  const recBlocked =
    !recPlan ||
    recPlan.status === "source_too_small" ||
    recPlan.status === "output_too_large";
  const recReady = recPlan?.status === "already_ready";

  const recButtonLabel = recReady
    ? "Already print-ready"
    : recPlan?.status === "output_too_large" ||
        recPlan?.status === "source_too_small"
      ? "Cannot enhance safely"
      : "Enhance for 300 PPI print";

  const recStatusSentence = !recPlan
    ? "Select a print format to calculate the target."
    : recPlan.status === "already_ready"
      ? "This image already reaches 300 PPI for the selected format."
      : recPlan.status === "output_too_large"
        ? `This upscale would exceed the ${recPlan.maxLongSide} px safety limit. Regenerate a larger master or choose a smaller format.`
        : recPlan.status === "source_too_small"
          ? "The corrected master is too small to reach 300 PPI safely with this model. Regenerate at a larger size."
          : recPlan.roundedScaleUp && recPlan.clears300Ppi
            ? "The result will be slightly above 300 PPI, which is preferred for print. Export will still use the exact selected print dimensions."
            : recPlan.clears300Ppi
              ? "This upscale will reach 300 PPI for the selected format."
              : "This result would still be below 300 PPI and will not be marked print-ready.";

  return (
    <AlertDialog open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <AlertDialogTrigger asChild disabled={disabled}>
        {trigger}
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display flex items-center gap-2">
            <ArrowUpCircle className="h-4 w-4 text-primary" />
            Enhance for print
          </AlertDialogTitle>
          <AlertDialogDescription className="font-display text-xs leading-relaxed">
            Your image is first corrected to the selected poster ratio. Then we
            calculate the upscale needed for print.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Source picker */}
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
          </div>
        )}

        {/* ============ RECOMMENDED ============ */}
        <div className="space-y-2 pt-1">
          <p className="font-display text-[10px] text-muted-foreground uppercase tracking-wider">
            Recommended
          </p>
          <div className="rounded-sm border border-primary/40 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-sm font-bold text-foreground">
                Print Target 300 PPI
              </p>
              <StatusBadge kind={recBadge} />
            </div>
            <p className="font-display text-[11px] text-muted-foreground leading-snug">
              Best for print. Uses the corrected poster master and calculates the
              exact upscale needed for the selected format.
            </p>

            {/* Family selector */}
            <div className="inline-flex gap-1 p-0.5 rounded-sm border border-border bg-background">
              {(["realesrgan", "clarity"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setRecFamily(f)}
                  className={cn(
                    "font-display text-[11px] px-2 py-1 rounded-sm transition-colors",
                    recFamily === f
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {FAMILY_LABEL[f]}
                </button>
              ))}
            </div>
            <p className="font-display text-[10px] text-muted-foreground leading-snug">
              {FAMILY_DESCRIPTION[recFamily]}
            </p>

            {/* Readout */}
            {recPlan && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-display text-[11px] text-foreground/90 pt-1">
                <span className="text-muted-foreground">Selected format:</span>
                <span className="text-right">{formatLabel ?? "—"}</span>
                <span className="text-muted-foreground">Corrected master:</span>
                <span className="text-right">
                  {recPlan.sourceWidth}×{recPlan.sourceHeight} px
                </span>
                <span className="text-muted-foreground">Target (300 PPI):</span>
                <span className="text-right">
                  {recPlan.targetWidth}×{recPlan.targetHeight} px
                </span>
                <span className="text-muted-foreground">Required scale:</span>
                <span className="text-right">
                  {recPlan.requiredScaleRaw.toFixed(3)}×
                </span>
                <span className="text-muted-foreground">Requested scale:</span>
                <span className="text-right">{recPlan.requestedScale}×</span>
                <span className="text-muted-foreground">Predicted:</span>
                <span className="text-right">
                  {recPlan.predictedOutputWidth}×{recPlan.predictedOutputHeight} px
                </span>
              </div>
            )}

            <p
              className={cn(
                "font-display text-[11px] leading-snug pt-0.5",
                recBlocked
                  ? "text-destructive"
                  : recReady
                    ? "text-muted-foreground"
                    : recPlan?.clears300Ppi
                      ? "text-primary"
                      : "text-orange-500",
              )}
            >
              {recStatusSentence}
            </p>

            <Button
              onClick={handleRecommendedConfirm}
              disabled={recBlocked || recReady}
              className="font-display w-full"
            >
              <Sparkles className="mr-2 h-3.5 w-3.5" />
              {recButtonLabel}
            </Button>
          </div>
        </div>

        {/* ============ ADVANCED ============ */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-sm hover:bg-muted/50 transition-colors"
            >
              <span className="font-display text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                Advanced — Manual upscale
                <StatusBadge kind="needs-upscale" />
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground transition-transform",
                  advancedOpen && "rotate-180",
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            <div className="rounded-sm border border-border bg-card p-3 space-y-2">
              <p className="font-display text-[11px] text-muted-foreground leading-snug">
                Choose the model and scale yourself. Useful for experiments,
                extra detail, or non-standard outputs.
              </p>

              {/* Family */}
              <div className="inline-flex gap-1 p-0.5 rounded-sm border border-border bg-background">
                {(["realesrgan", "clarity"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setManFamily(f)}
                    className={cn(
                      "font-display text-[11px] px-2 py-1 rounded-sm transition-colors",
                      manFamily === f
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {FAMILY_LABEL[f]}
                  </button>
                ))}
              </div>

              {/* Scale presets */}
              <div className="space-y-1">
                <p className="font-display text-[10px] text-muted-foreground uppercase tracking-wider">
                  Scale
                </p>
                <div className="flex flex-wrap gap-1">
                  {MANUAL_UPSCALE_PRESETS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setCustomMode(false);
                        setManScale(s);
                      }}
                      className={cn(
                        "font-display text-[11px] px-2 py-1 rounded-sm border transition-colors",
                        !customMode && manScale === s
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-border hover:bg-muted",
                      )}
                    >
                      {s}×
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCustomMode(true)}
                    className={cn(
                      "font-display text-[11px] px-2 py-1 rounded-sm border transition-colors",
                      customMode
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-muted",
                    )}
                  >
                    Custom
                  </button>
                  {customMode && (
                    <Input
                      type="number"
                      step="0.05"
                      min="1.05"
                      max="8"
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      className="h-7 w-20 text-xs"
                    />
                  )}
                </div>
              </div>

              {/* Manual readout */}
              {manPlan && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-display text-[11px] text-foreground/90 pt-1">
                  <span className="text-muted-foreground">Model:</span>
                  <span className="text-right">{FAMILY_LABEL[manFamily]}</span>
                  <span className="text-muted-foreground">Effective scale:</span>
                  <span className="text-right">{manPlan.effectiveScale}×</span>
                  <span className="text-muted-foreground">Predicted output:</span>
                  <span className="text-right">
                    {manPlan.predictedWidth}×{manPlan.predictedHeight} px
                  </span>
                  {manPlan.predictedEffectivePpi != null && formatLabel && (
                    <>
                      <span className="text-muted-foreground">Predicted PPI:</span>
                      <span
                        className={cn(
                          "text-right",
                          manPlan.clears300Ppi
                            ? "text-primary"
                            : "text-orange-500",
                        )}
                      >
                        {manPlan.predictedEffectivePpi} PPI for {formatLabel}
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Warnings */}
              {manPlan?.warnings.map((w, i) => (
                <p
                  key={i}
                  className={cn(
                    "font-display text-[11px] flex items-start gap-1 leading-snug",
                    manPlan.exceededLimit
                      ? "text-destructive"
                      : "text-orange-500",
                  )}
                >
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  {w}
                </p>
              ))}

              <Button
                onClick={handleManualConfirm}
                disabled={
                  !manPlan ||
                  manPlan.status === "output_too_large" ||
                  manPlan.status === "invalid_scale"
                }
                variant="outline"
                className="font-display w-full"
              >
                <Sparkles className="mr-2 h-3.5 w-3.5" />
                Run manual upscale
                {manPlan && ` (${FAMILY_LABEL[manFamily]} ${manPlan.effectiveScale}×)`}
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <p className="font-display text-[10px] text-muted-foreground text-center pt-1">
          Final exports use the exact dimensions for the selected print format.
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel className="font-display">Cancel</AlertDialogCancel>
          {/* Primary action lives inside each section card. The footer
              cancel-only mirrors the new two-action layout. */}
          <AlertDialogAction
            asChild
            className="hidden"
            aria-hidden
          >
            <span />
          </AlertDialogAction>
        </AlertDialogFooter>
        {hasEnhanced && (
          <p className="font-display text-[10px] text-muted-foreground text-center -mt-2">
            An enhanced master already exists — running another pass will create
            a new version.
          </p>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
