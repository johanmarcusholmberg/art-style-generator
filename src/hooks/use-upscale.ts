import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { updateEnhancedAsset } from "@/lib/gallery";
import {
  UPSCALE_MODES,
  UPSCALE_STAGE_LABELS,
  UPSCALE_STAGE_PROGRESS,
  type UpscaleMode,
  type UpscaleStage,
} from "@/lib/upscale-modes";

// Backwards-compatible re-exports (older callers expect these symbols)
export type UpscaleStatus = UpscaleStage;
export const UPSCALE_LABELS = UPSCALE_STAGE_LABELS;

export interface UpscaleResult {
  imageUrl: string;
  mode: UpscaleMode;
  scale: number;
  provider: string;
  /** True if the requested mode was downshifted (e.g. 8x → 4x for size cap) */
  downshifted: boolean;
}

interface UpscaleOptions {
  /** If provided, persist the upscaled asset to this gallery image record */
  galleryImageId?: string;
  /** Mode to run. Defaults to realesrgan_4x for backward compatibility. */
  mode?: UpscaleMode;
}

/**
 * Shared upscale abstraction.
 *
 * One frontend entry point used by:
 *   - automatic post-generation upscale
 *   - manual upscale after generation
 *   - manual upscale from gallery
 *
 * Always re-runs from the source URL provided (callers must pass the original/base
 * image, never an already-upscaled derivative).
 */
export function useUpscale() {
  const [stage, setStage] = useState<UpscaleStage>("idle");
  const [activeMode, setActiveMode] = useState<UpscaleMode>("none");
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const reset = useCallback(() => {
    if (stageTimer.current) {
      clearInterval(stageTimer.current);
      stageTimer.current = null;
    }
    setStage("idle");
    setActiveMode("none");
  }, []);

  const upscale = useCallback(
    async (sourceUrl: string, opts?: UpscaleOptions): Promise<UpscaleResult | null> => {
      const mode: UpscaleMode = opts?.mode ?? "realesrgan_4x";
      if (mode === "none") return null;

      setActiveMode(mode);
      setStage("preparing");

      // Drive a soft-progress staged animation while the edge function runs.
      // The backend reports a single final result, so we simulate progressive
      // stages so the UI never feels frozen.
      // For tile_8x we include an "optimizing" stage to surface the
      // pre-downscale path (the backend may resize the source before sending
      // it to Clarity at 8×). For other modes the stage is skipped.
      const stages: UpscaleStage[] = mode === "tile_8x"
        ? ["preparing", "optimizing", "cleanup", "tiling", "upscaling", "stitching"]
        : UPSCALE_MODES[mode].tiled
          ? ["preparing", "cleanup", "tiling", "upscaling", "stitching"]
          : ["preparing", "cleanup", "upscaling"];
      let stageIdx = 0;
      stageTimer.current = setInterval(() => {
        stageIdx = Math.min(stageIdx + 1, stages.length - 1);
        setStage(stages[stageIdx]);
      }, 4000);

      try {
        const { data, error } = await supabase.functions.invoke("upscale-image", {
          body: { imageUrl: sourceUrl, mode },
        });

        if (stageTimer.current) {
          clearInterval(stageTimer.current);
          stageTimer.current = null;
        }

        if (error) throw error;
        if (!data?.imageUrl) {
          setStage("failed");
          return null;
        }

        const result: UpscaleResult = {
          imageUrl: data.imageUrl,
          mode: data.pipeline?.mode ?? mode,
          scale: data.pipeline?.scale ?? UPSCALE_MODES[mode].scaleFactor,
          provider: data.pipeline?.provider ?? UPSCALE_MODES[mode].provider,
          downshifted: !!data.pipeline?.downshifted,
        };

        // Persist to gallery record if requested
        if (opts?.galleryImageId) {
          setStage("saving");
          try {
            await updateEnhancedAsset(opts.galleryImageId, result.imageUrl, {
              enhancementModel: result.provider,
              upscaleFactor: result.scale,
              upscaleMode: result.mode,
            });
          } catch (err) {
            console.warn("Failed to persist upscaled asset to gallery:", err);
          }
        }

        setStage(result.downshifted ? "downshifted" : "done");
        return result;
      } catch (err) {
        if (stageTimer.current) {
          clearInterval(stageTimer.current);
          stageTimer.current = null;
        }
        console.error("Upscale failed:", err);
        setStage("failed");
        return null;
      }
    },
    [],
  );

  const isRunning = ["preparing", "optimizing", "cleanup", "tiling", "upscaling", "stitching", "saving"].includes(stage);
  const stageLabel = UPSCALE_STAGE_LABELS[stage];
  const progress = UPSCALE_STAGE_PROGRESS[stage];

  return {
    stage,
    /** Backwards-compat alias for older callers that read `status` */
    status: stage,
    activeMode,
    isRunning,
    stageLabel,
    progress,
    upscale,
    reset,
    setStage,
  };
}
