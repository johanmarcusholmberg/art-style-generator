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
  "realesrgan_4x", // default — low cost
  "tile_4x",       // medium cost
  "print_plus",    // high cost — SUPIR
];

export interface EnhanceForPrintDialogProps {
  /** Render-prop trigger. The button you pass becomes the dialog opener. */
  trigger: React.ReactNode;
  /** True when an enhanced master already exists. Shifts copy & button. */
  hasEnhanced?: boolean;
  /** Optional source pixel dimensions, used to project output resolution. */
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  /** Optional recipe — when set, "Use recommended" pre-picks this mode. */
  recommendedRecipe?: UpscaleRecipe | null;
  /** Disable the dialog (e.g. when something is already running). */
  disabled?: boolean;
  /** Fired when the user confirms a method. */
  onConfirm: (mode: UpscaleMode, recipe?: UpscaleRecipe | null) => void;
}

export default function EnhanceForPrintDialog({
  trigger,
  hasEnhanced,
  sourceWidth,
  sourceHeight,
  recommendedRecipe,
  disabled,
  onConfirm,
}: EnhanceForPrintDialogProps) {
  const [open, setOpen] = useState(false);
  const initialMode: UpscaleMode =
    recommendedRecipe?.recommendedMode &&
    OFFERED_MODES.includes(recommendedRecipe.recommendedMode)
      ? recommendedRecipe.recommendedMode
      : "realesrgan_4x";
  const [picked, setPicked] = useState<UpscaleMode>(initialMode);

  const expectedOutput = useMemo(() => {
    if (!sourceWidth || !sourceHeight) return null;
    const cfg = UPSCALE_MODES[picked];
    const w = Math.round(sourceWidth * cfg.scaleFactor);
    const h = Math.round(sourceHeight * cfg.scaleFactor);
    return { w, h, factor: cfg.scaleFactor };
  }, [picked, sourceWidth, sourceHeight]);

  const pickedCfg = UPSCALE_MODES[picked];
  const isHighCost = pickedCfg.estimatedCost === "high";

  const handleConfirm = () => {
    setOpen(false);
    onConfirm(
      picked,
      recommendedRecipe?.recommendedMode === picked ? recommendedRecipe : null,
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
              : "Pick how to upgrade this image for print. Enhancement runs on a remote GPU and costs vary by method. Real-ESRGAN 4× is the recommended low-cost default."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Method picker */}
        <div className="space-y-2 py-2">
          {OFFERED_MODES.map((m) => {
            const cfg = UPSCALE_MODES[m];
            const isPicked = picked === m;
            const cost = COST_PILL[cfg.estimatedCost];
            const isRecommended = recommendedRecipe?.recommendedMode === m;
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
          {isHighCost && (
            <p className="font-display text-[11px] text-destructive flex items-center gap-1 pt-1">
              <AlertTriangle className="h-3 w-3" />
              SUPIR is the highest-cost method. Use it only for fine-art prints.
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
