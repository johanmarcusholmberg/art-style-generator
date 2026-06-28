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
  type UpscaleFamily,
  type UpscaleFlow,
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
import { isWithinPosterRatio, preparePosterMaster } from "@/lib/poster-master";

/**
 * Modes that route through the dedicated direct-Replicate edge function
 * (`upscale-image-replicate`) instead of the legacy `upscale-image` dispatcher.
 *
 * These modes have NO Lovable fallback — failures surface to the user.
 *
 * `clarity_dynamic` is intentionally absent: Clarity stays on the async
 * `upscale-image` route so the webhook + `upscale_jobs` table own the
 * lifecycle (a Clarity pass can run 1–3 min, well past the 150s sync cap).
 */
const DIRECT_REPLICATE_METHOD: Partial<Record<UpscaleMode, ReplicateUpscaleMethod>> = {
  realesrgan_4x: "realesrgan",
  print_target_300: "realesrgan", // dynamic decimal scale — see UpscaleOptions.dynamicScale
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
   * REQUIRED for `print_target_300` and `clarity_dynamic`. Decimal scale
   * (e.g. 5.15) calculated from the corrected poster master by
   * `calculatePrintTargetUpscale` or `planManualUpscale`. Edge functions
   * clamp into the family's supported range.
   */
  dynamicScale?: number;
  /* ------------------------------------------------------------------ */
  /* Print Upscale Redesign 2026-Q2 — new routing/safety opts.          */
  /* ------------------------------------------------------------------ */
  /** Model family. Determines whether we go direct (realesrgan) or async (clarity). */
  upscaleFamily?: UpscaleFamily;
  /** target_300 = Recommended flow, manual = Advanced flow. Logged to job. */
  upscaleFlow?: UpscaleFlow;
  /**
   * Source poster format. When set, useUpscale REQUIRES the source to be a
   * corrected master on this ratio and corrects it if not (no silent
   * provider call against an off-ratio source).
   */
  posterFormatId?: string | null;
  /**
   * Dialog's promise the source is already a corrected poster master. We
   * still re-verify the ratio before any provider call — this flag only
   * affects whether we can skip the correction round-trip in the happy path.
   */
  sourceWasCorrectedMaster?: boolean;
  /** Optional routing metadata persisted onto the upscale_jobs row. */
  routingMetadata?: Record<string, unknown>;
}

/**
 * Shared upscale abstraction.
 *
 * Two execution paths:
 *   - SYNC: `none`, `realesrgan_4x`, `print_target_300` — finishes within the
 *     edge fn request via the direct Replicate route.
 *   - ASYNC: `tile_4x`, `tile_8x` — edge fn returns 202 with a job id; we
 *     subscribe to the `upscale_jobs` row via Realtime and update the UI
 *     when the webhook marks the job succeeded/failed.
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

      /* ---------- Corrected-master pre-flight (2026-Q2 redesign) ---------- */
      // Every print-target / manual upscale must run against a corrected
      // poster master. If a posterFormatId is supplied we re-verify the
      // ratio and run `preparePosterMaster` when needed. Failure to correct
      // BLOCKS the upscale — there is no silent provider call against an
      // off-ratio source. `sourceWasCorrectedMaster` from the dialog only
      // skips the round-trip when the ratio probe passes.
      let effectiveSourceUrl = sourceUrl;
      let sourceWasCorrectedMaster = !!opts?.sourceWasCorrectedMaster;
      if (opts?.posterFormatId) {
        try {
          const master = await preparePosterMaster({
            rawImageUrl: sourceUrl,
            posterFormatId: opts.posterFormatId,
          });
          effectiveSourceUrl = master.masterImageUrl;
          sourceWasCorrectedMaster = true;
          if (
            !isWithinPosterRatio(
              master.masterWidth,
              master.masterHeight,
              opts.posterFormatId,
            )
          ) {
            cleanupTimers();
            setStage("failed");
            throw new Error(
              "Upscale blocked: corrected master is still off the selected poster ratio.",
            );
          }
        } catch (err) {
          cleanupTimers();
          setStage("failed");
          throw err instanceof Error
            ? err
            : new Error("Upscale blocked: poster-master correction failed.");
        }
      }
      // Hard invariant — no provider call without a corrected master flag
      // once a poster format is in play.
      if (opts?.posterFormatId && !sourceWasCorrectedMaster) {
        cleanupTimers();
        setStage("failed");
        throw new Error(
          "Upscale blocked: source was not confirmed as a corrected poster master.",
        );
      }

      const isAsync = isAsyncUpscaleMode(mode);

      // Drive a soft staged animation while we wait for either the sync
      // result or the async webhook. For async modes we cap progress at the
      // "upscaling" stage and let Realtime drive the rest.
      const stages: UpscaleStage[] = isAsync
        ? ["preparing", "upscaling"]
        : mode === "tile_8x"
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
        /* ---------------- DIRECT REPLICATE PATH ---------------- */
        // For realesrgan_4x (and the dynamic print_target_300 route) we bypass
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
            imageUrl: effectiveSourceUrl,
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

        /* ---------------- CLARITY DYNAMIC PATH (async) ---------------- */
        // Explicit contract — see `upscale-image` edge fn. The dispatcher
        // routes on `upscaleFamily === "clarity"` and uses the supplied
        // decimal `requestedScale`/`scale_factor` instead of the legacy
        // `tile_4x` / `tile_8x` mode branches. No silent fallback.
        const isClarityDynamic =
          mode === "clarity_dynamic" || opts?.upscaleFamily === "clarity";
        if (isClarityDynamic) {
          if (!opts?.dynamicScale || opts.dynamicScale <= 1) {
            cleanupTimers();
            setStage("failed");
            throw new Error(
              "Clarity dynamic upscale requires a calculated dynamicScale (use calculatePrintTargetUpscale or planManualUpscale).",
            );
          }
          if (!opts.posterFormatId || !sourceWasCorrectedMaster) {
            cleanupTimers();
            setStage("failed");
            throw new Error(
              "Clarity dynamic upscale requires a corrected poster master.",
            );
          }
        }

        const { data, error } = await supabase.functions.invoke("upscale-image", {
          body: isClarityDynamic
            ? {
                imageUrl: effectiveSourceUrl,
                mode: "clarity_dynamic",
                upscaleFlow: opts?.upscaleFlow ?? "manual",
                upscaleFamily: "clarity",
                requestedScale: opts!.dynamicScale,
                scale_factor: opts!.dynamicScale,
                sourceWasCorrectedMaster: true,
                posterFormatId: opts!.posterFormatId,
                galleryImageId: opts?.galleryImageId,
                recipe: opts?.recipe ?? undefined,
                metadata: opts?.routingMetadata ?? undefined,
              }
            : {
                imageUrl: effectiveSourceUrl,
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

                  // (SUPIR refining stage removed with Print+ in 2025-Q4.)


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
                    setStage("done");
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

        if (result.downshifted) {
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

  const isRunning = ["preparing", "optimizing", "cleanup", "tiling", "upscaling", "stitching", "saving"].includes(stage);
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
