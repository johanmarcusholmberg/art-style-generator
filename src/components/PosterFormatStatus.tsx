/**
 * PosterFormatStatus — readiness readout backed by the shared, pure
 * print-validation layer (`src/lib/print-validation.ts`).
 *
 * Deliberately avoids a single ambiguous green "Print ready" badge:
 * poster format, effective PPI, 150/300-PPI tiers, bleed, ratio
 * treatment and colour handling are each reported separately, with a
 * Pass / Warning / Blocked / Unknown hierarchy on top.
 *
 * Inputs are already-derived truth:
 *   - `phase` from `deriveDurableResultPresentation`
 *   - `width`/`height` from the canonical adopted asset
 *   - `printFormatId` currently selected for the export target
 */
import { cn } from "@/lib/utils";
import type { DurableResultPhase } from "@/lib/ratio-finalization/presentation";
import {
  validatePrintReadiness,
  formatPpiForDisplay,
  type ColorProfileStatus,
  type PrintSourceKind,
  type RatioClassification,
  type ReadinessSeverity,
} from "@/lib/print-validation";

export interface PosterFormatStatusProps {
  phase: DurableResultPhase;
  width: number | null;
  height: number | null;
  printFormatId: string | null;
  /** Show the "Adopting canonical asset" hint after a queue outcome. */
  adopting?: boolean;
  /** Canonical master URL (never a display derivative). */
  canonicalSourceUrl?: string | null;
  /** Ratio treatment recorded during finalization. */
  ratioAdjustment?: "none" | "crop" | "pad" | "distort" | "unknown";
  /** Whether the pending export adds bleed. Downloads always do. */
  includeBleed?: boolean;
}

const FORMAT_LABEL: Record<DurableResultPhase, string> = {
  idle: "Not validated",
  generating: "Preparing",
  generation_failed: "Not validated",
  format_processing: "Finalizing",
  format_failed: "Failed",
  format_ready_corrected: "Ready",
  format_ready_not_required: "Ready",
  format_ready_local_preview: "Preview only",
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
  format_ready_local_preview: "text-amber-500",
  format_unverified: "text-amber-500",
};

const SEVERITY_LABEL: Record<ReadinessSeverity, string> = {
  pass: "Pass",
  warning: "Warning",
  blocked: "Blocked",
  unknown: "Unknown",
};

const SEVERITY_TONE: Record<ReadinessSeverity, string> = {
  pass: "text-emerald-500",
  warning: "text-amber-500",
  blocked: "text-destructive",
  unknown: "text-muted-foreground",
};

const RATIO_LABEL: Record<RatioClassification, string> = {
  correct: "Correct ratio",
  corrected_crop: "Corrected by crop",
  padded: "Padded",
  distorted: "Distorted",
  unknown: "Unknown",
};

const COLOR_LABEL: Record<ColorProfileStatus, string> = {
  srgb_confirmed: "sRGB",
  rgb_assumed: "RGB (assumed)",
  profile_preserved: "Profile preserved",
  profile_unknown: "Profile unknown",
  profile_not_supported: "Profile not preserved",
  cmyk_not_available: "CMYK not available",
};

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(tone ?? "text-foreground")}>{value}</span>
    </div>
  );
}

export function PosterFormatStatus({
  phase,
  width,
  height,
  printFormatId,
  adopting,
  canonicalSourceUrl,
  ratioAdjustment,
  includeBleed = true,
}: PosterFormatStatusProps) {
  const formatReadyPhase =
    phase === "format_ready_corrected" || phase === "format_ready_not_required";
  const dimsKnown = !!width && !!height;

  const sourceKind: PrintSourceKind = formatReadyPhase
    ? "canonical_master"
    : phase === "format_ready_local_preview"
    ? "local_preview"
    : "unknown";

  const validation =
    printFormatId && dimsKnown
      ? validatePrintReadiness({
          canonicalSourceUrl: canonicalSourceUrl ?? null,
          canonicalSourceKind: sourceKind,
          canonicalWidth: width,
          canonicalHeight: height,
          printFormatId,
          ratioAdjustment:
            ratioAdjustment ??
            (phase === "format_ready_corrected" ? "crop" : "unknown"),
          includeBleed,
        })
      : null;

  return (
    <div className="w-full max-w-md rounded-sm border border-border bg-muted/20 px-3 py-2 flex flex-col gap-1 text-[11px] font-display">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Poster format</span>
        <span className={cn("font-bold", FORMAT_TONE[phase])}>
          {FORMAT_LABEL[phase]}
        </span>
      </div>

      <Row
        label="Resolution"
        value={dimsKnown ? `${width} × ${height} px` : "Unknown"}
        tone={dimsKnown ? undefined : "text-muted-foreground"}
      />

      {validation ? (
        <>
          <Row
            label="Effective PPI"
            value={`${formatPpiForDisplay(validation.effectivePpi)} at ${
              validation.format?.label ?? "target size"
            }`}
          />
          <Row
            label="150 PPI"
            value={validation.ppi150Ready ? "Suitable" : "Not suitable"}
            tone={validation.ppi150Ready ? "text-emerald-500" : "text-destructive"}
          />
          <Row
            label="True 300 PPI"
            value={validation.ppi300Ready ? "Suitable" : "Not suitable"}
            tone={validation.ppi300Ready ? "text-emerald-500" : "text-amber-500"}
          />
          <Row
            label="Ratio"
            value={RATIO_LABEL[validation.ratioClassification]}
            tone={
              validation.ratioClassification === "correct"
                ? "text-emerald-500"
                : validation.ratioClassification === "distorted"
                ? "text-destructive"
                : "text-amber-500"
            }
          />
          <Row
            label="Bleed"
            value={
              validation.includeBleed
                ? `${validation.bleedMm} mm included (${validation.bleedPx} px)`
                : "Not included"
            }
          />
          <Row
            label="Export size"
            value={
              validation.exportPixels
                ? `${validation.exportPixels.width} × ${validation.exportPixels.height} px @ ${validation.exportDpi} DPI`
                : "Unknown"
            }
          />
          <Row label="Colour" value={COLOR_LABEL[validation.colorStatus]} />
          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-1 mt-0.5">
            <span className="text-muted-foreground">Print assessment</span>
            <span className={cn("font-bold", SEVERITY_TONE[validation.severity])}>
              {SEVERITY_LABEL[validation.severity]}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">{validation.explanation}</p>
          {validation.blockingErrors.map((e) => (
            <p key={e} className="text-[10px] text-destructive">
              {e}
            </p>
          ))}
          {validation.warnings.map((wn) => (
            <p key={wn} className="text-[10px] text-amber-500">
              {wn}
            </p>
          ))}
        </>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Print assessment</span>
          <span className="font-bold text-muted-foreground">Not validated</span>
        </div>
      )}

      {adopting && (
        <p className="text-[10px] text-muted-foreground italic">
          Adopting canonical asset…
        </p>
      )}
    </div>
  );
}
