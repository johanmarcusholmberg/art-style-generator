import { useState } from "react";
import { ArrowUpCircle, Check, Sparkles, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  UPSCALE_MODES,
  UPSCALE_COST_LABEL,
  UPSCALE_JOB_STATUS_LABEL,
  getUpscaleOptionsForSurface,
  isAsyncUpscaleMode,
  type UpscaleMode,
  type UpscaleSurface,
  type UpscaleJobStatus,
} from "@/lib/upscale-modes";
import { Progress } from "@/components/ui/progress";

interface UpscaleBadgeProps {
  /** Currently selected mode (controlled). */
  value: UpscaleMode;
  onChange: (m: UpscaleMode) => void;
  /** Which surface this badge lives in — filters which modes are offered. */
  surface: UpscaleSurface;
  /** Optional: trigger an immediate run of the picked mode (manual / gallery). */
  onRun?: (m: UpscaleMode) => void;
  /** Live status from useUpscale. */
  isRunning?: boolean;
  stageLabel?: string;
  progress?: number;
  /** Async-only: live job status from useUpscale (queued/processing/...) */
  jobStatus?: UpscaleJobStatus | null;
  /** Mode that produced the asset currently shown (for the "current" badge). */
  appliedMode?: UpscaleMode | string | null;
  /** Compact variant — used inline in dense toolbars. */
  compact?: boolean;
  /** Disable interaction (e.g. while generation is happening). */
  disabled?: boolean;
}

/**
 * Unified upscale selector — one badge + popover used by:
 *   - ImageGenerator (auto-after-generation + manual run)
 *   - Gallery lightbox (manual run from saved asset)
 *
 * Mirrors the GeneratorBadge design language for a coherent UX.
 */
export default function UpscaleBadge({
  value,
  onChange,
  surface,
  onRun,
  isRunning,
  stageLabel,
  progress,
  jobStatus,
  appliedMode,
  compact,
  disabled,
}: UpscaleBadgeProps) {
  const [open, setOpen] = useState(false);
  const options = getUpscaleOptionsForSurface(surface);
  const current = UPSCALE_MODES[value];
  const liveLabel = jobStatus ? UPSCALE_JOB_STATUS_LABEL[jobStatus] : stageLabel;

  const triggerLabel = isRunning
    ? liveLabel || "Upscaling…"
    : surface === "automatic"
    ? `Upscale: ${current.shortLabel}`
    : current.shortLabel;

  const handlePick = (mode: UpscaleMode) => {
    onChange(mode);
    if (onRun && mode !== "none") {
      onRun(mode);
      setOpen(false);
    } else if (surface === "automatic") {
      // Just a preference change — close the popover
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm border font-display transition-colors",
            compact ? "px-2 py-1 text-xs" : "px-2.5 py-1.5 text-xs",
            isRunning
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-border bg-secondary text-secondary-foreground hover:bg-muted",
            disabled && "opacity-50 cursor-not-allowed",
          )}
          title={current.description}
        >
          {isRunning ? (
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          ) : (
            <ArrowUpCircle className="h-3 w-3" />
          )}
          <span className="truncate max-w-[160px]">{triggerLabel}</span>
          {appliedMode && appliedMode !== "none" && !isRunning && (
            <Sparkles className="h-3 w-3 text-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3 space-y-3">
        <div>
          <p className="font-display text-xs font-bold text-foreground mb-1">
            Upscale Mode
          </p>
          <p className="font-display text-[11px] text-muted-foreground leading-snug">
            {surface === "automatic"
              ? "Runs automatically after generation. You can also re-run a different mode from any saved image — it always uses the original."
              : "Re-runs from the original/base image — never from an already-upscaled derivative."}
          </p>
        </div>

        {isRunning && (
          <div className="rounded-sm border border-primary/30 bg-primary/5 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-[11px] text-foreground">
                {liveLabel || "Upscaling…"}
              </span>
              <span className="font-display text-[10px] text-muted-foreground">
                {jobStatus === "processing" ? "remote GPU" : `${Math.round(progress ?? 0)}%`}
              </span>
            </div>
            <Progress value={progress ?? 0} className="h-1 mt-1" />
            {jobStatus && isAsyncUpscaleMode(value) && (
              <p className="font-display text-[10px] text-muted-foreground mt-1">
                Runs in the background — you can leave this page and come back.
              </p>
            )}
          </div>
        )}

        <div className="space-y-1">
          {options.map((opt) => {
            const isActive = value === opt.id;
            const isApplied = appliedMode === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => handlePick(opt.id)}
                disabled={disabled || isRunning}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded-sm border font-display transition-colors disabled:opacity-50",
                  isActive
                    ? "bg-primary/10 border-primary/40 text-foreground"
                    : "bg-card border-border hover:bg-muted text-foreground",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{opt.label}</span>
                  <div className="flex items-center gap-1">
                    {isApplied && (
                      <Sparkles className="h-3 w-3 text-primary" />
                    )}
                    {isActive && <Check className="h-3 w-3 text-primary" />}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                  {opt.intendedUse}
                </p>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                  <span>⏱ {opt.estimatedTime}</span>
                  <span>· {UPSCALE_COST_LABEL[opt.estimatedCost]}</span>
                  {opt.category === "print" && (
                    <span className="px-1 rounded-sm bg-primary/10 text-primary text-[9px] uppercase tracking-wider">
                      Print
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {surface !== "automatic" && (
          <p className="font-display text-[10px] text-muted-foreground border-t border-border pt-2">
            Picking a mode here runs it immediately on the original image.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
