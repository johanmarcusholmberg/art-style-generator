import { cn } from "@/lib/utils";
import { getPrintFormat, assessExportReadiness, PRINT_FORMATS, type PrintFormat } from "@/lib/print-formats";

interface PrintQualityIndicatorProps {
  /** Actual image width in px */
  actualWidthPx: number;
  /** Actual image height in px */
  actualHeightPx: number;
  /** Print format ID to assess against, defaults to first format */
  printFormatId?: string | null;
  /** Compact single-line mode */
  compact?: boolean;
}

type QualityTier = "excellent" | "good" | "soft" | "too-small";

function assessTier(
  actualW: number,
  actualH: number,
  format: PrintFormat,
): { tier: QualityTier; ppi: number; label: string; bestFormat: PrintFormat | null } {
  const CM_TO_INCHES = 1 / 2.54;
  const wInch = format.widthCm * CM_TO_INCHES;
  const hInch = format.heightCm * CM_TO_INCHES;
  const ppiW = actualW / wInch;
  const ppiH = actualH / hInch;
  const ppi = Math.round(Math.min(ppiW, ppiH));

  if (ppi >= 280) return { tier: "excellent", ppi, label: "Excellent for this size", bestFormat: null };
  if (ppi >= 150) return { tier: "good", ppi, label: "Good for this size", bestFormat: findBestFormat(actualW, actualH) };
  if (ppi >= 100) return { tier: "soft", ppi, label: "May look soft", bestFormat: findBestFormat(actualW, actualH) };
  return { tier: "too-small", ppi, label: "Too small for this format", bestFormat: findBestFormat(actualW, actualH) };
}

/** Find the largest print format where the image achieves >= 280 PPI */
function findBestFormat(w: number, h: number): PrintFormat | null {
  const CM_TO_INCHES = 1 / 2.54;
  // Sort formats by area descending
  const sorted = [...PRINT_FORMATS].sort((a, b) => (b.widthCm * b.heightCm) - (a.widthCm * a.heightCm));
  for (const f of sorted) {
    const wInch = f.widthCm * CM_TO_INCHES;
    const hInch = f.heightCm * CM_TO_INCHES;
    const ppi = Math.min(w / wInch, h / hInch);
    if (ppi >= 280) return f;
  }
  return null;
}

const TIER_STYLES: Record<QualityTier, { dot: string; text: string; bg: string }> = {
  excellent: { dot: "bg-green-500", text: "text-green-700 dark:text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  good: { dot: "bg-yellow-500", text: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  soft: { dot: "bg-orange-500", text: "text-orange-700 dark:text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  "too-small": { dot: "bg-red-500", text: "text-red-700 dark:text-red-400", bg: "bg-red-500/10 border-red-500/20" },
};

export default function PrintQualityIndicator({
  actualWidthPx,
  actualHeightPx,
  printFormatId,
  compact = false,
}: PrintQualityIndicatorProps) {
  const format = getPrintFormat(printFormatId || PRINT_FORMATS[0]?.id || "");
  if (!format || !actualWidthPx || !actualHeightPx) return null;

  const { tier, ppi, label, bestFormat } = assessTier(actualWidthPx, actualHeightPx, format);
  const style = TIER_STYLES[tier];

  if (compact) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-display font-medium", style.text)}>
        <span className={cn("h-2 w-2 rounded-full", style.dot)} />
        {label} · ~{ppi} PPI
      </span>
    );
  }

  return (
    <div className={cn("rounded-sm border p-3 space-y-1", style.bg)}>
      <div className="flex items-center gap-2">
        <span className={cn("h-2.5 w-2.5 rounded-full", style.dot)} />
        <span className={cn("font-display text-xs font-bold", style.text)}>{label}</span>
      </div>
      <p className="font-display text-[11px] text-muted-foreground">
        {format.label} · {actualWidthPx} × {actualHeightPx} px · ~{ppi} PPI
      </p>
      {bestFormat && bestFormat.id !== format.id && (
        <p className="font-display text-[11px] text-muted-foreground">
          Best size: <span className="font-medium text-foreground">{bestFormat.label}</span>
        </p>
      )}
      {tier === "too-small" && (
        <p className="font-display text-[11px] text-muted-foreground italic">
          Consider upscaling or choosing a smaller print format
        </p>
      )}
    </div>
  );
}
