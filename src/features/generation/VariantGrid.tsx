/**
 * VariantGrid — 2×2 picker for the variant fan-out.
 *
 * Pure presentation: receives tiles + callbacks. Keeps state ownership
 * inside ImageGenerator. Each tile shows a skeleton, the generated
 * image, or an error with retry. Per-tile "Keep" hands the response
 * back to the parent which runs the existing save path.
 *
 * Per-tile effective-PPI badge: once the image finishes generating, we
 * probe its natural dimensions (preferring the response's reported
 * width/height to avoid a network round-trip) and render the canonical
 * `PrintQualityIndicator` in compact mode against the active print
 * format. The badge degrades silently when no print format is selected
 * or the probe fails.
 */
import { useEffect, useState } from "react";
import { Loader2, RefreshCcw, Check, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PrintQualityIndicator from "@/components/PrintQualityIndicator";
import { loadImageDimensions } from "@/lib/image-metadata";
import type { VariantTile } from "./useVariantFanOut";
import type { NormalizedGenerationResponse } from "@/lib/generation-types";

export interface VariantGridProps {
  tiles: VariantTile[];
  busy?: boolean;
  onKeep: (tile: VariantTile, response: NormalizedGenerationResponse) => void | Promise<void>;
  onDiscard: (tileId: number) => void;
  onRetry: (tileId: number) => void;
  onDiscardAll: () => void;
  savedTileIds?: ReadonlySet<number>;
  savingTileId?: number | null;
  /** Active print format id used to compute the per-tile effective-PPI badge. */
  printFormatId?: string | null;
}

export default function VariantGrid({
  tiles,
  busy,
  onKeep,
  onDiscard,
  onRetry,
  onDiscardAll,
  savedTileIds,
  savingTileId,
  printFormatId,
}: VariantGridProps) {
  const hasAny = tiles.some((t) => t.status !== "idle");
  if (!hasAny) return null;

  return (
    <section className="space-y-2" aria-label="Generated variants">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-foreground">
          Variants {busy ? "(generating…)" : "(pick the best)"}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDiscardAll}
          disabled={busy}
          className="font-display text-[11px] h-7"
        >
          Discard all
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <VariantTileCard
            key={tile.id}
            tile={tile}
            onKeep={onKeep}
            onDiscard={onDiscard}
            onRetry={onRetry}
            saved={!!savedTileIds?.has(tile.id)}
            saving={savingTileId === tile.id}
            printFormatId={printFormatId ?? null}
          />
        ))}
      </div>
    </section>
  );
}

function VariantTileCard({
  tile,
  onKeep,
  onDiscard,
  onRetry,
  saved,
  saving,
  printFormatId,
}: {
  tile: VariantTile;
  onKeep: VariantGridProps["onKeep"];
  onDiscard: VariantGridProps["onDiscard"];
  onRetry: VariantGridProps["onRetry"];
  saved: boolean;
  saving: boolean;
  printFormatId: string | null;
}) {
  const r = tile.response;
  const dims = useTileDimensions(tile);

  return (
    <div
      className={cn(
        "relative rounded-sm border border-border bg-card overflow-hidden flex flex-col",
        "aspect-square",
      )}
    >
      <div className="relative flex-1 min-h-0 bg-muted/30 flex items-center justify-center">
        {tile.status === "loading" && (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        )}
        {tile.status === "error" && (
          <div className="p-3 text-center space-y-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 mx-auto" />
            <p className="font-display text-[11px] text-muted-foreground line-clamp-3">
              {tile.error || "Generation failed"}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="font-display text-[11px] h-7"
              onClick={() => onRetry(tile.id)}
            >
              <RefreshCcw className="h-3 w-3 mr-1" /> Retry
            </Button>
          </div>
        )}
        {tile.status === "done" && r && (
          <img
            src={r.imageUrl}
            alt={`Variant ${tile.id + 1}`}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        )}
        {tile.status === "idle" && (
          <span className="font-display text-[11px] text-muted-foreground">
            Variant {tile.id + 1}
          </span>
        )}
      </div>

      {tile.status === "done" && r && (
        <div className="p-2 space-y-1.5 border-t border-border/60">
          {printFormatId && dims && (
            <PrintQualityIndicator
              actualWidthPx={dims.width}
              actualHeightPx={dims.height}
              printFormatId={printFormatId}
              compact
            />
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="font-display text-[10px] text-muted-foreground truncate">
              {r.generationProvider}
              {dims ? ` · ${dims.width}×${dims.height}` : ""}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="font-display text-[11px] h-7 px-2"
                onClick={() => onDiscard(tile.id)}
                disabled={saving}
                title="Discard this variant"
              >
                <X className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                className="font-display text-[11px] h-7 px-2"
                onClick={() => onKeep(tile, r)}
                disabled={saved || saving}
                title={saved ? "Saved" : "Keep this variant"}
              >
                {saving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3 mr-1" />
                )}
                {saved ? "Saved" : "Keep"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Resolve the tile's pixel dimensions. Prefers values already on the
 * response (no network), falls back to an async probe of the image URL.
 */
function useTileDimensions(tile: VariantTile): { width: number; height: number } | null {
  const r = tile.response;
  const reportedW = r?.width;
  const reportedH = r?.height;
  const url = r?.imageUrl;
  const [probed, setProbed] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setProbed(null);
    if (tile.status !== "done" || !url) return;
    if (reportedW && reportedH) return;
    let cancelled = false;
    loadImageDimensions(url)
      .then((d) => {
        if (!cancelled) setProbed(d);
      })
      .catch(() => {
        /* badge degrades silently */
      });
    return () => {
      cancelled = true;
    };
  }, [tile.status, url, reportedW, reportedH]);

  if (reportedW && reportedH) return { width: reportedW, height: reportedH };
  return probed;
}
