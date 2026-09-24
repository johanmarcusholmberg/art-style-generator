import { CheckCircle2, AlertTriangle, XCircle, Proportions } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  assessExportReadiness,
  isAspectRatioMatch,
  getPrintFormat,
} from "@/lib/print-formats";

interface PrintReadinessCardProps {
  /** Actual image width in px */
  widthPx: number | null | undefined;
  /** Actual image height in px */
  heightPx: number | null | undefined;
  /** Target print format */
  printFormatId: string;
  className?: string;
}

type Tier = "excellent" | "good" | "soft" | "too-small";

function getTier(ppi: number): Tier {
  if (ppi >= 280) return "excellent";
  if (ppi >= 150) return "good";
  if (ppi >= 100) return "soft";
  return "too-small";
}

const TIER_META: Record<
  Tier,
  { icon: typeof CheckCircle2; headline: string; color: string; barColor: string }
> = {
  excellent: {
    icon: CheckCircle2,
    headline: "Print-ready",
    color: "text-green-600 dark:text-green-400",
    barColor: "bg-green-500",
  },
  good: {
    icon: CheckCircle2,
    headline: "Good for print",
    color: "text-yellow-600 dark:text-yellow-400",
    barColor: "bg-yellow-500",
  },
  soft: {
    icon: AlertTriangle,
    headline: "May look soft",
    color: "text-orange-600 dark:text-orange-400",
    barColor: "bg-orange-500",
  },
  "too-small": {
    icon: XCircle,
    headline: "Too small for this size",
    color: "text-red-600 dark:text-red-400",
    barColor: "bg-red-500",
  },
};

/** Simple ratio label like "5:7" from pixel dims. */
function ratioLabel(w: number, h: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(Math.round(w), Math.round(h));
  const rw = Math.round(w) / g;
  const rh = Math.round(h) / g;
  // Keep numbers readable — if the reduced ratio is unwieldy, show decimal.
  if (rw > 20 || rh > 20) return (w / h).toFixed(2);
  return `${rw}:${rh}`;
}

export default function PrintReadinessCard({
  widthPx,
  heightPx,
  printFormatId,
  className,
}: PrintReadinessCardProps) {
  const format = getPrintFormat(printFormatId);
  if (!format || !widthPx || !heightPx) return null;

  const readiness = assessExportReadiness(widthPx, heightPx, format);
  const ppi = readiness.achievablePpi;
  const tier = getTier(ppi);
  const meta = TIER_META[tier];
  const Icon = meta.icon;

  const ratioOk = isAspectRatioMatch(widthPx, heightPx, format.aspectRatioDecimal);
  const actualRatio = ratioLabel(widthPx, heightPx);

  // PPI bar: 0–300 scale, marker at 150 (standard) and 300 (full quality).
  const pct = Math.min(100, (ppi / 300) * 100);

  return (
    <div
      className={cn(
        "w-full max-w-md rounded-sm border border-border bg-card/80 px-4 py-3 space-y-2.5",
        className,
      )}
      data-testid="print-readiness-card"
    >
      {/* Headline */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn("h-4 w-4 flex-shrink-0", meta.color)} />
          <p className={cn("font-display text-sm font-bold truncate", meta.color)}>
            {meta.headline} — {format.label}
          </p>
        </div>
        <span className="font-display text-xs text-muted-foreground flex-shrink-0">
          ~{ppi} PPI
        </span>
      </div>

      {/* PPI bar */}
      <div>
        <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn("absolute inset-y-0 left-0 rounded-full transition-all", meta.barColor)}
            style={{ width: `${pct}%` }}
          />
          {/* 150 PPI marker */}
          <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/30" />
        </div>
        <div className="flex justify-between mt-1">
          <span className="font-display text-[10px] text-muted-foreground">0</span>
          <span className="font-display text-[10px] text-muted-foreground">150 · standard</span>
          <span className="font-display text-[10px] text-muted-foreground">300 · full quality</span>
        </div>
      </div>

      {/* Details row: pixels + ratio */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-display text-[11px] text-muted-foreground">
          {widthPx} × {heightPx} px
        </span>
        <span
          className={cn(
            "font-display text-[11px] inline-flex items-center gap-1",
            ratioOk ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400",
          )}
        >
          <Proportions className="h-3 w-3" />
          {ratioOk
            ? `Ratio matches ${format.aspectRatio}`
            : `Ratio ${actualRatio} ≠ ${format.aspectRatio} — will be cropped/padded`}
        </span>
      </div>

      {/* Guidance */}
      {tier !== "excellent" && (
        <p className="font-display text-[11px] text-muted-foreground">
          {tier === "good" &&
            `Prints well at ${format.label}. Use “Enhance for print” to reach full 300 PPI quality.`}
          {tier === "soft" &&
            `Noticeable softness at ${format.label}. Enhance for print, or choose a smaller frame size.`}
          {tier === "too-small" &&
            `Too small for ${format.label}. Enhance for print first, or print at a smaller size.`}
        </p>
      )}
    </div>
  );
}
