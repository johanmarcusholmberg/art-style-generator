/**
 * Compact status row for an image asset:
 *   • Base only   — base asset exists, no enhancement yet
 *   • Enhanced    — enhanced master present
 *   • Print ready — master meets ≥150 PPI for the target print format
 *   • Exported    — a print-export file has been produced & stored
 *
 * Optionally surfaces:
 *   • Upscale method (e.g. "Real-ESRGAN 4×")
 *   • Enhancement status (e.g. "Enhancing…")
 *
 * Designed to be unobtrusive — pure presentation, no side effects.
 */
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Image as ImageIcon,
  Printer,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAssetLifecycleStatus,
  type AssetImageLike,
} from "@/lib/asset-selection";
import {
  getPrintReadinessStatus,
  PRINT_READINESS_LABEL,
} from "@/lib/print-readiness";
import { UPSCALE_MODES, type UpscaleMode } from "@/lib/upscale-modes";

interface AssetStatusBadgesProps {
  image: AssetImageLike & {
    enhanced_storage_path?: string | null;
    export_storage_path?: string | null;
    export_ready?: boolean | null;
    upscale_mode?: string | null;
    print_format_id?: string | null;
  };
  /** Live enhancement status — drives the optional "Enhancing…" pill. */
  enhancementStatus?:
    | "idle"
    | "enhancing"
    | "saving"
    | "done"
    | "failed"
    | null;
  /** Compact mode hides labels for icon-only chips. */
  compact?: boolean;
  className?: string;
}

export default function AssetStatusBadges({
  image,
  enhancementStatus,
  compact,
  className,
}: AssetStatusBadgesProps) {
  const lifecycle = getAssetLifecycleStatus(image);
  const readiness = getPrintReadinessStatus(image, image.print_format_id);
  const upscaleConfig = image.upscale_mode
    ? UPSCALE_MODES[image.upscale_mode as UpscaleMode]
    : null;

  const isWorking =
    enhancementStatus === "enhancing" || enhancementStatus === "saving";
  const printReady =
    readiness === "good-150" || readiness === "excellent-300";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {/* Base / Enhanced */}
      {lifecycle.hasEnhanced ? (
        <Badge
          variant="outline"
          className="font-display text-[10px] gap-1 border-primary/40 text-primary"
        >
          <Sparkles className="h-3 w-3" />
          {compact ? null : "Enhanced"}
        </Badge>
      ) : lifecycle.hasBase ? (
        <Badge
          variant="outline"
          className="font-display text-[10px] gap-1 border-border text-muted-foreground"
        >
          <ImageIcon className="h-3 w-3" />
          {compact ? null : "Base only"}
        </Badge>
      ) : null}

      {/* Upscale method */}
      {upscaleConfig && lifecycle.hasEnhanced && !compact && (
        <Badge
          variant="outline"
          className="font-display text-[10px] gap-1 border-primary/30 text-primary/90"
          title={upscaleConfig.description}
        >
          {upscaleConfig.shortLabel}
        </Badge>
      )}

      {/* Live enhancement status */}
      {isWorking && (
        <Badge
          variant="outline"
          className="font-display text-[10px] gap-1 border-primary/40 bg-primary/5 text-primary"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          {enhancementStatus === "saving" ? "Saving…" : "Enhancing…"}
        </Badge>
      )}

      {/* Print readiness */}
      {readiness !== "unknown" && (
        <Badge
          variant="outline"
          className={cn(
            "font-display text-[10px] gap-1",
            printReady
              ? "border-primary/40 text-primary"
              : readiness === "ok-small-prints"
                ? "border-orange-500/40 text-orange-500"
                : "border-destructive/40 text-destructive",
          )}
          title={PRINT_READINESS_LABEL[readiness]}
        >
          <Printer className="h-3 w-3" />
          {compact ? null : PRINT_READINESS_LABEL[readiness]}
        </Badge>
      )}

      {/* Export */}
      {lifecycle.hasExport && (
        <Badge
          variant="outline"
          className="font-display text-[10px] gap-1 border-primary/40 text-primary"
        >
          <CheckCircle2 className="h-3 w-3" />
          {compact ? null : "Exported"}
        </Badge>
      )}
    </div>
  );
}
