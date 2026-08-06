/**
 * Version selector for the gallery lightbox.
 *
 * Lists original + upscaled versions of a generated image, lets the user
 * switch between them and delete non-original versions.
 *
 * Upscaling is NOT available here: the only permitted entry point is the
 * validated Enhance for Print dialog (`EnhanceForPrintDialog` -> `useUpscale`).
 *
 * State strategy:
 *   - Owns the fetch + selection for one image (keyed by `image.id`).
 *   - Notifies the parent of the currently selected asset via
 *     `onSelectedAssetChange` so the parent can use it for download / etc.
 *   - Calls `onAfterMutation` after a successful delete so the parent can
 *     refresh the gallery list (counts on cards, etc.).
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
import { Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  fetchImageAssets,
  ensureOriginalAssetForImage,
  deleteUpscaleAsset,
  defaultSelectedAsset,
  formatSourceLabel,
  versionLabel,
  getVersionPrintReadiness,
  canDeleteAsset,
  pickNextSelectionAfterDelete,
  type ImageAsset,
} from "@/lib/generated-image-assets";
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

export default function VersionSelector({
  image,
  refreshKey,
  onSelectedAssetChange,
  onAfterMutation,
}: VersionSelectorProps) {
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"delete" | null>(null);
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
