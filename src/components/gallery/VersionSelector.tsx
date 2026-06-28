/**
 * Version selector for the gallery lightbox.
 *
 * Lists original + upscaled versions of a generated image, lets the user
 * switch between them, delete non-original versions, and run another
 * upscale starting from the currently selected version (with a hard 12 K
 * long-edge safety cap).
 *
 * State strategy:
 *   - Owns the fetch + selection for one image (keyed by `image.id`).
 *   - Notifies the parent of the currently selected asset via
 *     `onSelectedAssetChange` so the parent can use it for download / etc.
 *   - Calls `onAfterMutation` after a successful upscale or delete so the
 *     parent can refresh the gallery list (counts on cards, etc.).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  fetchImageAssets,
  ensureOriginalAssetForImage,
  saveUpscaleAsset,
  deleteUpscaleAsset,
  defaultSelectedAsset,
  formatSourceLabel,
  versionLabel,
  estimateUpscaleOutput,
  getVersionPrintReadiness,
  canDeleteAsset,
  pickNextSelectionAfterDelete,
  probeImageDimensions,
  updateAssetDimensions,
  type ImageAsset,
} from "@/lib/generated-image-assets";
import { runReplicateUpscale } from "@/lib/upscale-providers/replicate";
import { UPSCALE_MODES, type UpscaleMode } from "@/lib/upscale-modes";

interface VersionSelectorProps {
  image: {
    id: string;
    storage_path?: string | null;
    original_storage_path?: string | null;
    actual_width_px?: number | null;
    actual_height_px?: number | null;
    base_width_px?: number | null;
    base_height_px?: number | null;
  };
  /** Bump from the parent to force an asset re-fetch (e.g. after an external upscale persists). */
  refreshKey?: number;
  onSelectedAssetChange?: (asset: ImageAsset | null) => void;
  onAfterMutation?: () => void;
}

// Modes we currently allow from the version selector. Real-ESRGAN is the
// safest default everywhere. Print+ / SUPIR was removed in 2025-Q4; the
// version selector now only exposes the direct Real-ESRGAN route.
const SELECTOR_MODES: UpscaleMode[] = ["realesrgan_4x"];

export default function VersionSelector({
  image,
  refreshKey,
  onSelectedAssetChange,
  onAfterMutation,
}: VersionSelectorProps) {
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upscale" | "delete" | null>(null);
  const [mode, setMode] = useState<UpscaleMode>("realesrgan_4x");
  const [deleteTarget, setDeleteTarget] = useState<ImageAsset | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Lazy backfill for legacy rows that never got an original asset.
      await ensureOriginalAssetForImage(image).catch(() => null);
      const rows = await fetchImageAssets(image.id);
      setAssets(rows);
      setSelectedId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev;
        return defaultSelectedAsset(rows)?.id ?? null;
      });
    } catch (e) {
      console.warn("[VersionSelector] load failed:", e);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [image]);

  useEffect(() => {
    void load();
    // refreshKey is intentionally a dependency so external mutations
    // trigger a reload without changing the image identity.
  }, [load, refreshKey]);


  const selected = useMemo(
    () => assets.find((a) => a.id === selectedId) ?? null,
    [assets, selectedId],
  );

  useEffect(() => {
    onSelectedAssetChange?.(selected);
  }, [selected, onSelectedAssetChange]);

  const scaleFactor = UPSCALE_MODES[mode]?.scaleFactor ?? 4;
  // Only Real-ESRGAN is wired through the direct Replicate route now.
  const replicateMethod: "realesrgan" = "realesrgan";
  const estimate = useMemo(
    () =>
      selected
        ? estimateUpscaleOutput(
            { width_px: selected.width_px, height_px: selected.height_px },
            scaleFactor,
            { method: replicateMethod },
          )
        : null,
    [selected, scaleFactor, replicateMethod],
  );

  const handleUpscale = useCallback(async () => {
    if (!selected || busy) return;
    setBusy("upscale");
    try {
      // If source dims are unknown (legacy upscale row), probe the image
      // first so we can apply the input-pixel safety cap BEFORE round-
      // tripping to Replicate.
      let srcW = selected.width_px;
      let srcH = selected.height_px;
      if (!srcW || !srcH) {
        const dims = await probeImageDimensions(selected.publicUrl);
        if (dims) {
          srcW = dims.width;
          srcH = dims.height;
          // Persist for future runs; best-effort, don't block on failure.
          updateAssetDimensions(selected.id, dims.width, dims.height).catch((e) =>
            console.warn("[VersionSelector] persist dims failed:", e),
          );
          setAssets((prev) =>
            prev.map((a) =>
              a.id === selected.id ? { ...a, width_px: dims.width, height_px: dims.height } : a,
            ),
          );
        }
      }

      const recomputed = estimateUpscaleOutput(
        { width_px: srcW, height_px: srcH },
        scaleFactor,
        { method: replicateMethod },
      );
      if (recomputed.exceedsCap) {
        toast.error(recomputed.warning || "Upscale would exceed safety cap.");
        return;
      }
      if (recomputed.unknown) {
        toast.error(
          "Couldn't read this version's dimensions to verify it's safe to upscale. Try selecting the Original instead.",
        );
        return;
      }

      const direct = await runReplicateUpscale({
        imageUrl: selected.publicUrl,
        method: replicateMethod,
        scale: scaleFactor,
      });
      const newAsset = await saveUpscaleAsset({
        generatedImageId: image.id,
        sourceAssetId: selected.id,
        imageUrl: direct.upscaledImageUrl,
        width: direct.width ?? null,
        height: direct.height ?? null,
        method: mode,
        scaleFactor: direct.scale ?? scaleFactor,
      });
      const next = await fetchImageAssets(image.id);
      setAssets(next);
      setSelectedId(newAsset.id);
      toast.success(`Saved ${versionLabel(newAsset)} (${mode})`, { duration: 3000 });
      onAfterMutation?.();
    } catch (e: any) {
      console.error("[VersionSelector] upscale failed:", e);
      toast.error(e?.message || "Upscale failed — no version was created.");
    } finally {
      setBusy(null);
    }
  }, [selected, busy, mode, scaleFactor, replicateMethod, image.id, onAfterMutation]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setBusy("delete");
    try {
      await deleteUpscaleAsset(target);
      const next = await fetchImageAssets(image.id);
      setAssets(next);
      setSelectedId((prev) => {
        if (prev && prev !== target.id && next.some((r) => r.id === prev)) return prev;
        return pickNextSelectionAfterDelete(next, target.id)?.id ?? defaultSelectedAsset(next)?.id ?? null;
      });
      toast.success(`Deleted ${versionLabel(target)}`, { duration: 3000 });
      onAfterMutation?.();
    } catch (e: any) {
      console.error("[VersionSelector] delete failed:", e);
      toast.error(e?.message || "Failed to delete version.");
    } finally {
      setBusy(null);
    }
  }, [deleteTarget, image.id, onAfterMutation]);

  if (loading) {
    return (
      <div className="rounded-sm border border-border bg-card/50 p-3">
        <p className="font-display text-[11px] text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading versions…
        </p>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="rounded-sm border border-border bg-card/50 p-3">
        <p className="font-display text-[11px] text-muted-foreground">
          No versions recorded yet for this image.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border bg-card/50 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-xs font-bold text-foreground">Versions</p>
        <span className="font-display text-[10px] text-muted-foreground">
          {assets.filter((a) => a.asset_type === "upscale").length} upscale
          {assets.filter((a) => a.asset_type === "upscale").length === 1 ? "" : "s"}
        </span>
      </div>

      <ul className="space-y-1.5">
        {assets.map((a) => {
          const isSelected = a.id === selectedId;
          const readiness = getVersionPrintReadiness(a);
          return (
            <li key={a.id}>
              <button
                onClick={() => setSelectedId(a.id)}
                className={cn(
                  "w-full text-left rounded-sm border px-2.5 py-1.5 transition-colors",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/40 hover:bg-muted/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-xs font-medium text-foreground">
                    {versionLabel(a)}
                    {a.upscale_method && (
                      <span className="text-muted-foreground font-normal">
                        {" · "}
                        {UPSCALE_MODES[a.upscale_method as UpscaleMode]?.shortLabel ?? a.upscale_method}
                      </span>
                    )}
                  </span>
                  <span className="font-display text-[10px] text-muted-foreground tabular-nums">
                    {a.width_px && a.height_px ? `${a.width_px}×${a.height_px}` : "—"}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "font-display text-[10px]",
                      readiness.printReady ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {readiness.message}
                  </span>
                  {canDeleteAsset(a) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(a);
                      }}
                      className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                      title="Delete this version"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border pt-2 space-y-2">
        {selected && (
          <p className="font-display text-[11px] text-foreground">
            {formatSourceLabel(selected)}
          </p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {SELECTOR_MODES.map((m) => (
            <Badge
              key={m}
              variant={mode === m ? "default" : "outline"}
              role="button"
              onClick={() => setMode(m)}
              className="font-display text-[10px] cursor-pointer"
            >
              {UPSCALE_MODES[m].shortLabel}
            </Badge>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={handleUpscale}
            disabled={!selected || !!busy || estimate?.exceedsCap}
            className="font-display text-xs ml-auto border-primary/40 text-primary hover:bg-primary/10"
          >
            {busy === "upscale" ? (
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 mr-1.5" />
            )}
            Upscale selected version
          </Button>
        </div>
        {estimate?.warning && (
          <p
            className={cn(
              "font-display text-[10px]",
              estimate.exceedsCap ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {estimate.warning}
          </p>
        )}
        <p className="font-display text-[10px] text-muted-foreground italic">
          Repeated upscaling can soften details or create artifacts. If this happens,
          try selecting Original and using a stronger upscale mode instead.
        </p>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              Delete {deleteTarget ? versionLabel(deleteTarget) : "version"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently hides this upscaled version. The original is always preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "delete"}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={busy === "delete"}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
