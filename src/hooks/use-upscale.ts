import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { updateEnhancedAsset } from "@/lib/gallery";
import { ENHANCEMENT_PROVIDER } from "@/lib/enhancement-config";

export type UpscaleStatus = "idle" | "cleanup" | "upscaling" | "done" | "failed";

export const UPSCALE_LABELS: Record<UpscaleStatus, string> = {
  idle: "",
  cleanup: "Cleaning artifacts…",
  upscaling: "Upscaling 4×…",
  done: "Upscale complete",
  failed: "Upscale failed",
};

export interface UpscaleResult {
  imageUrl: string;
  pipeline: {
    cleanup: boolean;
    superResolution: boolean;
    scale: number;
    provider: string;
  };
}

/**
 * Shared hook for Real-ESRGAN 4× upscaling.
 * Used by: ImageGenerator (auto + manual), Gallery (manual).
 */
export function useUpscale() {
  const [status, setStatus] = useState<UpscaleStatus>("idle");

  const reset = useCallback(() => setStatus("idle"), []);

  /**
   * Run 4× upscale on an image URL.
   * Returns the enhanced URL on success, null on failure.
   * Optionally persists to gallery if galleryImageId is provided.
   */
  const upscale = useCallback(async (
    imageUrl: string,
    opts?: { galleryImageId?: string },
  ): Promise<string | null> => {
    setStatus("cleanup");
    try {
      const { data, error } = await supabase.functions.invoke(
        ENHANCEMENT_PROVIDER.edgeFunction,
        {
          body: {
            imageUrl,
            strength: "strong",
            scaleFactor: 4,
          },
        },
      );

      if (error) throw error;

      if (data?.pipeline?.superResolution) {
        setStatus("upscaling");
      }

      if (!data?.imageUrl) {
        setStatus("failed");
        return null;
      }

      // Persist to gallery record if we have an ID
      if (opts?.galleryImageId) {
        try {
          await updateEnhancedAsset(opts.galleryImageId, data.imageUrl, {
            enhancementModel: data.pipeline?.provider || "replicate/real-esrgan",
            upscaleFactor: data.pipeline?.scale || 4,
          });
        } catch (err) {
          console.warn("Failed to persist upscaled asset to gallery:", err);
        }
      }

      setStatus("done");
      return data.imageUrl;
    } catch (err) {
      console.error("Upscale failed:", err);
      setStatus("failed");
      return null;
    }
  }, []);

  const isRunning = status === "cleanup" || status === "upscaling";

  return { status, isRunning, upscale, reset, setStatus };
}
