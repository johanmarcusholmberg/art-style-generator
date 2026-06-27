import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { updateEnhancedAsset } from "@/lib/gallery";
import {
  UPSCALE_MODES,
  UPSCALE_STAGE_LABELS,
  UPSCALE_STAGE_PROGRESS,
  isAsyncUpscaleMode,
  type UpscaleMode,
  type UpscaleStage,
  type UpscaleJobStatus,
} from "@/lib/upscale-modes";
import {
  resolveUpscaleRecipe,
  generatorFamilyFromProvider,
  type UpscaleRecipe,
  type ResolveRecipeInput,
} from "@/lib/upscale-recipes";
import {
  runReplicateUpscale,
  type ReplicateUpscaleMethod,
} from "@/lib/upscale-providers/replicate";

/**
 * Modes that route through the dedicated direct-Replicate edge function
 * (`upscale-image-replicate`) instead of the legacy `upscale-image` dispatcher.
 *
 * These modes have NO Lovable fallback — failures surface to the user.
 */
const DIRECT_REPLICATE_METHOD: Partial<Record<UpscaleMode, ReplicateUpscaleMethod>> = {
  realesrgan_4x: "realesrgan",
  print_target_300: "realesrgan", // dynamic decimal scale — see UpscaleOptions.dynamicScale
  print_plus: "supir",
};

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
  /** True when this completed via the async job path */
  async?: boolean;
  /** Async job id (only set when async) */
  jobId?: string;
}

interface UpscaleOptions {
  /** If provided, persist the upscaled asset to this gallery image record */
  galleryImageId?: string;
  /** Mode to run. Defaults to realesrgan_4x for backward compatibility. */
  mode?: UpscaleMode;
  /** Optional recipe metadata — recorded on the upscale_jobs row. */
  recipe?: Pick<UpscaleRecipe, "id" | "label" | "reason"> | null;
  /**
   * REQUIRED for `print_target_300`. Decimal scale (e.g. 5.15) calculated
   * from the corrected poster master by `calculatePrintTargetUpscale`.
   * Edge function clamps into [2, 8].
   */
  dynamicScale?: number;
}

/**
 * Shared upscale abstraction.
 *
 * Two execution paths:
 *   - SYNC: `none`, `realesrgan_4x` — finishes within the edge fn request.
 *   - ASYNC: `tile_4x`, `tile_8x`, `print_plus` — edge fn returns 202 with a
 *     job id; we subscribe to the `upscale_jobs` row via Realtime and update
 *     the UI when the webhook marks the job succeeded/failed.
 */
export function useUpscale() {
  const [stage, setStage] = useState<UpscaleStage>("idle");
  const [activeMode, setActiveMode] = useState<UpscaleMode>("none");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<UpscaleJobStatus | null>(null);
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const asyncResolverRef = useRef<((r: UpscaleResult | null) => void) | null>(null);

  const cleanupTimers = useCallback(() => {
    if (stageTimer.current) {
      clearInterval(stageTimer.current);
      stageTimer.current = null;
    }
  }, []);

  const cleanupChannel = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    cleanupTimers();
    cleanupChannel();
    setStage("idle");
    setActiveMode("none");
    setJobId(null);
    setJobStatus(null);
  }, [cleanupTimers, cleanupChannel]);

  useEffect(() => () => {
    cleanupTimers();
    cleanupChannel();
  }, [cleanupTimers, cleanupChannel]);

  const upscale = useCallback(
    async (sourceUrl: string, opts?: UpscaleOptions): Promise<UpscaleResult | null> => {
      const mode: UpscaleMode = opts?.mode ?? "realesrgan_4x";
      if (mode === "none") return null;

      cleanupTimers();
      cleanupChannel();
      setActiveMode(mode);
      setStage("preparing");
      setJobId(null);
      setJobStatus(null);

      const isAsync = isAsyncUpscaleMode(mode);

      // Drive a soft staged animation while we wait for either the sync
      // result or the async webhook. For async modes we cap progress at the
      // "upscaling" stage and let Realtime drive the rest.
      const stages: UpscaleStage[] = isAsync
        ? ["preparing", "upscaling"]
        : mode === "tile_8x"
          ? ["preparing", "optimizing", "cleanup", "tiling", "upscaling", "stitching"]
          : mode === "print_plus"
            ? ["preparing", "cleanup", "upscaling", "refining"]
            : UPSCALE_MODES[mode].tiled
              ? ["preparing", "cleanup", "tiling", "upscaling", "stitching"]
              : ["preparing", "cleanup", "upscaling"];
      let stageIdx = 0;
      stageTimer.current = setInterval(() => {
        stageIdx = Math.min(stageIdx + 1, stages.length - 1);
        setStage(stages[stageIdx]);
      }, 4000);

      try {
        /* ---------------- DIRECT REPLICATE PATH ---------------- */
        // For realesrgan_4x and print_plus we bypass the legacy dispatcher
        // and call the dedicated direct-Replicate edge function. There is
        // no Lovable fallback on this path — failures bubble up.
        const directMethod = DIRECT_REPLICATE_METHOD[mode];
        if (directMethod) {
          setStage("upscaling");
          // Dynamic print-target route requires an explicit calculated scale.
          let effectiveScale = UPSCALE_MODES[mode].scaleFactor;
          if (mode === "print_target_300") {
            if (!opts?.dynamicScale || opts.dynamicScale <= 1) {
              cleanupTimers();
              setStage("failed");
              throw new Error(
                "print_target_300 requires a calculated dynamicScale (use calculatePrintTargetUpscale).",
              );
            }
            // Edge function clamps into [2, 8]; mirror here for early UX warning.
            effectiveScale = Math.min(8, Math.max(2, opts.dynamicScale));
          }
          const direct = await runReplicateUpscale({
            imageUrl: sourceUrl,
            method: directMethod,
            scale: effectiveScale,
          });

          cleanupTimers();

          const result: UpscaleResult = {
            imageUrl: direct.upscaledImageUrl,
            mode,
            scale: direct.scale,
            provider: direct.provider,
            downshifted: false,
            async: false,
          };

          // Persist enhanced master to the gallery row (never overwrites base).
          if (opts?.galleryImageId) {
            setStage("saving");
            try {
              await updateEnhancedAsset(opts.galleryImageId, result.imageUrl, {
                enhancementModel: result.provider,
                upscaleFactor: result.scale,
                upscaleMode: result.mode,
                enhancedWidthPx: direct.width ?? undefined,
                enhancedHeightPx: direct.height ?? undefined,
              });
            } catch (err) {
              console.warn("Failed to persist enhanced master to gallery:", err);
            }
          }

          setStage("done");
          return result;
        }

        const { data, error } = await supabase.functions.invoke("upscale-image", {
          body: {
            imageUrl: sourceUrl,
            mode,
            galleryImageId: opts?.galleryImageId,
            recipe: opts?.recipe ?? undefined,
          },
        });

        if (error) throw error;

        /* ---------------- ASYNC PATH ---------------- */
        if (data?.jobId && data?.pipeline?.async) {
          const newJobId: string = data.jobId;
          setJobId(newJobId);
          setJobStatus("processing");
          setStage("upscaling");

          // Subscribe to job row updates via Realtime, and resolve the
          // outer promise when the row reaches a terminal status.
          return await new Promise<UpscaleResult | null>((resolve) => {
            asyncResolverRef.current = resolve;

            const channel = supabase
              .channel(`upscale-job-${newJobId}`)
              .on(
                "postgres_changes",
                {
                  event: "UPDATE",
                  schema: "public",
                  table: "upscale_jobs",
                  filter: `id=eq.${newJobId}`,
                },
                (payload) => {
                  const row = payload.new as {
                    status: UpscaleJobStatus;
                    output_url: string | null;
                    pipeline: any;
                    error_message: string | null;
                  };
                  setJobStatus(row.status);

                  // Surface SUPIR mid-flight transitions
                  if (row.pipeline?.next === undefined && row.pipeline?.supirAttempted && row.status === "processing") {
                    setStage("refining");
                  }

                  if (row.status === "succeeded" && row.output_url) {
                    cleanupTimers();
                    const result: UpscaleResult = {
                      imageUrl: row.output_url,
                      mode,
                      scale: row.pipeline?.scale ?? UPSCALE_MODES[mode].scaleFactor,
                      provider: row.pipeline?.provider ?? UPSCALE_MODES[mode].provider,
                      downshifted: !!row.pipeline?.downshifted,
                      async: true,
                      jobId: newJobId,
                    };
                    setStage(row.pipeline?.refineFailed ? "refine_failed" : "done");
                    asyncResolverRef.current?.(result);
                    asyncResolverRef.current = null;
                    cleanupChannel();
                  } else if (row.status === "failed" || row.status === "cancelled") {
                    cleanupTimers();
                    console.error("Async upscale failed:", row.error_message);
                    setStage("failed");
                    asyncResolverRef.current?.(null);
                    asyncResolverRef.current = null;
                    cleanupChannel();
                  }
                },
              )
              .subscribe();

            channelRef.current = channel;
          });
        }

        /* ---------------- SYNC PATH ---------------- */
        cleanupTimers();
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
          async: false,
        };

        // Persist to gallery record if requested (sync path only — async
        // path persists from the webhook with service-role).
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

        if (data.pipeline?.refineFailed) {
          setStage("refine_failed");
        } else if (result.downshifted) {
          setStage("downshifted");
        } else {
          setStage("done");
        }
        return result;
      } catch (err) {
        cleanupTimers();
        cleanupChannel();
        console.error("Upscale failed:", err);
        setStage("failed");
        return null;
      }
    },
    [cleanupTimers, cleanupChannel],
  );

  const isRunning = ["preparing", "optimizing", "cleanup", "tiling", "upscaling", "stitching", "refining", "saving"].includes(stage);
  const stageLabel = UPSCALE_STAGE_LABELS[stage];
  const progress = UPSCALE_STAGE_PROGRESS[stage];

  /**
   * Resolve a recipe recommendation from style + provider metadata.
   * Pure helper — does NOT trigger an upscale.
   */
  const recommendRecipe = useCallback(
    (input: ResolveRecipeInput): UpscaleRecipe => resolveUpscaleRecipe(input),
    [],
  );

  /**
   * One-shot helper: resolve the recommended recipe for an image and run it.
   * Used by the "Use recommended" button in UpscaleBadge.
   */
  const runRecommendedUpscale = useCallback(
    async (
      sourceUrl: string,
      input: ResolveRecipeInput,
      opts?: Omit<UpscaleOptions, "mode" | "recipe">,
    ): Promise<UpscaleResult | null> => {
      const recipe = resolveUpscaleRecipe(input);
      return upscale(sourceUrl, {
        ...opts,
        mode: recipe.recommendedMode,
        recipe: { id: recipe.id, label: recipe.label, reason: recipe.reason },
      });
    },
    [upscale],
  );

  return {
    stage,
    /** Backwards-compat alias for older callers that read `status` */
    status: stage,
    activeMode,
    isRunning,
    stageLabel,
    progress,
    /** Async-only — present while a heavy upscale is running on Replicate */
    jobId,
    jobStatus,
    upscale,
    runRecommendedUpscale,
    recommendRecipe,
    /** Re-exported for convenience */
    generatorFamilyFromProvider,
    reset,
    setStage,
  };
}
