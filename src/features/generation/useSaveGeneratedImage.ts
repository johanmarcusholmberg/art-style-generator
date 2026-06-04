/**
 * useSaveGeneratedImage — incremental Part B extraction.
 *
 * Wraps `saveToGallery` / `replaceInGallery` and logs a best-effort
 * `asset_cost_events` entry. Failure of the cost-event write is logged
 * as a warning and never blocks save.
 */
import { useCallback, useState } from "react";
import { saveToGallery, replaceInGallery, type GallerySaveOptions } from "@/lib/gallery";
import { recordAssetCostEvent } from "@/lib/cost-events";

export function useSaveGeneratedImage() {
  const [isSaving, setIsSaving] = useState(false);

  const save = useCallback(async (opts: GallerySaveOptions) => {
    setIsSaving(true);
    try {
      const { id, publicUrl } = await saveToGallery(opts);
      // Cost event uses the row id returned by the save — no lookup race.
      try {
        await recordAssetCostEvent({
          imageId: id,
          eventType: "generation",
          provider: opts.provider || opts.generationProvider || "lovable",
          model: opts.model || opts.generationModel || null,
          mode: opts.mode,
          estimatedCost: opts.estimatedCost ?? null,
          currency: opts.currency || "USD",
          status: "succeeded",
          metadata: {
            route: opts.route || opts.executionRoute || null,
            promptVersion: opts.promptVersion || null,
          },
        });
      } catch (e) {
        console.warn("[useSaveGeneratedImage] cost event skipped:", e);
      }
      return publicUrl;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const replace = useCallback(
    async (opts: GallerySaveOptions & { originalId: string; originalStoragePath: string }) => {
      setIsSaving(true);
      try {
        await replaceInGallery(opts);
        try {
          await recordAssetCostEvent({
            imageId: opts.originalId,
            eventType: "generation",
            provider: opts.provider || opts.generationProvider || "lovable",
            model: opts.model || opts.generationModel || null,
            mode: opts.mode,
            estimatedCost: opts.estimatedCost ?? null,
            currency: opts.currency || "USD",
            status: "succeeded",
            metadata: {
              route: opts.route || opts.executionRoute || null,
              promptVersion: opts.promptVersion || null,
              replacement: true,
            },
          });
        } catch (e) {
          console.warn("[useSaveGeneratedImage] cost event skipped:", e);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  return { save, replace, isSaving };
}
