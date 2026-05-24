/**
 * AssetMetaBadges — compact metadata badges for gallery cards and lightboxes.
 *
 * Two layouts:
 *  - `compact` (gallery card): only print readiness + asset role + size
 *  - `full` (lightbox): all metadata (provider, model, route, role, sizes,
 *    print readiness, estimated cost, created date)
 *
 * Visually consistent with the existing `Badge` component. Purely
 * presentational — does no data fetching.
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PRINT_READINESS_LABEL,
  type PrintReadinessStatus,
} from "@/lib/print-readiness";
import { formatCost } from "@/lib/cost-events";

export interface AssetMetaBadgesProps {
  variant?: "compact" | "full";
  className?: string;
  provider?: string | null;
  model?: string | null;
  route?: string | null;
  assetRole?: string | null;
  baseWidth?: number | null;
  baseHeight?: number | null;
  masterWidth?: number | null;
  masterHeight?: number | null;
  exportWidth?: number | null;
  exportHeight?: number | null;
  printReadiness?: PrintReadinessStatus | null;
  estimatedCost?: number | null;
  currency?: string | null;
  createdAt?: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  enhanced_master: "Enhanced master",
  base_generation: "Base generation",
  print_export: "Print export",
  mockup_preview: "Mockup preview",
};

function friendlyModel(model?: string | null): string | null {
  if (!model) return null;
  if (model.includes("gemini-3-pro-image")) return "Gemini image preview";
  if (model.includes("gemini")) return "Gemini";
  if (model.toLowerCase().includes("sdxl")) return "SDXL";
  return model;
}

function friendlyProvider(provider?: string | null): string | null {
  if (!provider) return null;
  if (provider === "lovable") return "Lovable";
  if (provider === "gemini") return "Gemini";
  if (provider === "sdxl") return "SDXL";
  return provider;
}

function readinessTone(s?: PrintReadinessStatus | null) {
  switch (s) {
    case "excellent-300":
      return "border-primary/40 text-primary";
    case "good-150":
      return "border-primary/30 text-primary/90";
    case "ok-small-prints":
      return "border-orange-500/40 text-orange-500";
    case "not-ready":
      return "border-destructive/40 text-destructive";
    default:
      return "border-border text-muted-foreground";
  }
}

function fmtSize(w?: number | null, h?: number | null): string | null {
  if (!w || !h) return null;
  return `${w}×${h}`;
}

export default function AssetMetaBadges(props: AssetMetaBadgesProps) {
  const {
    variant = "compact",
    className,
    provider,
    model,
    route,
    assetRole,
    baseWidth,
    baseHeight,
    masterWidth,
    masterHeight,
    exportWidth,
    exportHeight,
    printReadiness,
    estimatedCost,
    currency,
    createdAt,
  } = props;

  const masterSize = fmtSize(masterWidth, masterHeight);
  const baseSize = fmtSize(baseWidth, baseHeight);
  const exportSize = fmtSize(exportWidth, exportHeight);
  const primarySize = masterSize || baseSize;

  const roleText = assetRole ? ROLE_LABEL[assetRole] || assetRole : null;
  const readinessLabel = printReadiness
    ? PRINT_READINESS_LABEL[printReadiness] || "Unknown"
    : null;

  if (variant === "compact") {
    // Hide "Unknown" readiness on gallery cards to keep the grid quiet —
    // it carries no useful signal until dimensions are populated.
    const showReadiness = readinessLabel && printReadiness && printReadiness !== "unknown";
    return (
      <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
        {showReadiness && (
          <Badge
            variant="outline"
            className={cn(
              "font-display text-[10px]",
              readinessTone(printReadiness),
            )}
            title={readinessLabel!}
          >
            {readinessLabel}
          </Badge>
        )}
        {roleText && (
          <Badge
            variant="outline"
            className="font-display text-[10px] border-border text-muted-foreground"
          >
            {roleText}
          </Badge>
        )}
        {primarySize && (
          <Badge
            variant="outline"
            className="font-display text-[10px] border-border text-muted-foreground"
          >
            {primarySize}
          </Badge>
        )}
      </div>
    );
  }

  // full
  const rows: Array<[string, string]> = [];
  const provLabel = friendlyProvider(provider);
  const modelLabel = friendlyModel(model);
  if (provLabel) rows.push(["Provider", provLabel]);
  if (modelLabel) rows.push(["Model", modelLabel]);
  if (route) rows.push(["Route", route]);
  if (roleText) rows.push(["Asset", roleText]);
  if (baseSize) rows.push(["Base", baseSize]);
  if (masterSize) rows.push(["Master", masterSize]);
  if (exportSize) rows.push(["Export", exportSize]);
  if (readinessLabel) rows.push(["Print readiness", readinessLabel]);
  rows.push([
    "Cost",
    estimatedCost === null || estimatedCost === undefined
      ? "Cost unknown"
      : formatCost(estimatedCost, currency || "USD"),
  ]);
  if (createdAt) {
    try {
      rows.push(["Created", new Date(createdAt).toLocaleString()]);
    } catch {
      /* noop */
    }
  }

  return (
    <div className={className}>
      <dl
        className={cn(
          "grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[11px] font-display",
        )}
      >
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      {printReadiness === "unknown" && (
        <p className="mt-2 text-[11px] font-display text-muted-foreground italic">
          Pixel dimensions weren&apos;t recorded for this image, so print PPI can&apos;t be
          verified. Export still works at the source resolution.
        </p>
      )}
    </div>
  );
}
