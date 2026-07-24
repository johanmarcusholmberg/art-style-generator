/**
 * PosterFormatStatus — compact status block that separates
 * "poster-format ratio validation" from "print resolution" and rolls
 * both into a final "print assessment" line. Consumed by
 * ImageGenerator.tsx so the badge area no longer conflates ratio
 * completion with print-detail readiness.
 *
 * Inputs are already-derived truth:
 *   - `formatPhase` from `deriveDurableResultPresentation`
 *   - `width`/`height` from canonical adopted asset (corrected master
 *     for `completed`, verified persisted source for `not_required`)
 *   - `printFormatId` currently selected for the export target
 */
import { cn } from "@/lib/utils";
import {
  getPrintReadinessStatus,
  PRINT_READINESS_LABEL,
  type PrintReadinessStatus,
} from "@/lib/print-readiness";
import type { DurableResultPhase } from "@/lib/ratio-finalization/presentation";

export interface PosterFormatStatusProps {
  phase: DurableResultPhase;
  width: number | null;
  height: number | null;
  printFormatId: string | null;
  /** Show the "Adopting canonical asset" hint after a queue outcome. */
  adopting?: boolean;
}

const FORMAT_LABEL: Record<DurableResultPhase, string> = {
  idle: "Not validated",
  generating: "Preparing",
  generation_failed: "Not validated",
  format_processing: "Finalizing",
  format_failed: "Failed",
  format_ready_corrected: "Ready",
  format_ready_not_required: "Ready",
  format_unverified: "Not validated",
};

const FORMAT_TONE: Record<DurableResultPhase, string> = {
  idle: "text-muted-foreground",
  generating: "text-muted-foreground",
  generation_failed: "text-muted-foreground",
  format_processing: "text-muted-foreground",
  format_failed: "text-destructive",
  format_ready_corrected: "text-emerald-500",
  format_ready_not_required: "text-emerald-500",
  format_unverified: "text-amber-500",
};

const PRINT_TONE: Record<PrintReadinessStatus, string> = {
  "excellent-300": "text-emerald-500",
  "good-150": "text-emerald-500",
  "ok-small-prints": "text-amber-500",
  "not-ready": "text-destructive",
  unknown: "text-muted-foreground",
};

export function PosterFormatStatus({
  phase,
  width,
  height,
  printFormatId,
  adopting,
}: PosterFormatStatusProps) {
  const formatReady =
    phase === "format_ready_corrected" || phase === "format_ready_not_required";
  const dimsKnown = !!width && !!height;
  const printStatus: PrintReadinessStatus =
    formatReady && dimsKnown
      ? getPrintReadinessStatus(
          { actual_width_px: width, actual_height_px: height },
          printFormatId,
        )
      : "unknown";
  const resolutionLabel = dimsKnown ? `${width} × ${height} px` : "Unknown";
  return (
    <div className="w-full max-w-md rounded-sm border border-border bg-muted/20 px-3 py-2 flex flex-col gap-1 text-[11px] font-display">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Poster format</span>
        <span className={cn("font-bold", FORMAT_TONE[phase])}>
          {FORMAT_LABEL[phase]}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Resolution</span>
        <span className={dimsKnown ? "text-foreground" : "text-muted-foreground"}>
          {resolutionLabel}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Print assessment</span>
        <span className={cn("font-bold", PRINT_TONE[printStatus])}>
          {formatReady ? PRINT_READINESS_LABEL[printStatus] : "Not validated"}
        </span>
      </div>
      {adopting && (
        <p className="text-[10px] text-muted-foreground italic">
          Adopting canonical asset…
        </p>
      )}
    </div>
  );
}
