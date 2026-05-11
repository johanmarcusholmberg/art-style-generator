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
import { supabase } from "@/integrations/supabase/client";

export function useSaveGeneratedImage() {
  const [isSaving, setIsSaving] = useState(false);

  const save = useCallback(async (opts: GallerySaveOptions) => {
    setIsSaving(true);
    try {
      const url = await saveToGallery(opts);
      // Best-effort: look up the just-inserted row to attach a cost event.
      try {
        const { data } = await supabase
          .from("generated_images")
          .select("id")
          .order("created_at", { ascending: false })
          .limit(1);
        const id = (data?.[0] as { id?: string } | undefined)?.id;
        if (id) {
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
        }
      } catch (e) {
        console.warn("[useSaveGeneratedImage] cost event skipped:", e);
      }
      return url;
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
