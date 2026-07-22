import { useState, useRef, useMemo, useEffect } from "react";
import { usePersistedGeneration } from "@/hooks/use-persisted-generation";
import { Loader2, Download, Sparkles, Save, Replace, X, Trash2, Pencil, Printer, FileImage, ArrowUpCircle, ThumbsUp, ThumbsDown, Layers, AlertTriangle, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import EnhanceForPrintDialog from "@/components/EnhanceForPrintDialog";
import MatchingCollectionDialog from "@/components/matching-collection/MatchingCollectionDialog";
import { resolveMatchingCollectionAnchor } from "@/lib/matching-collection/anchor-resolver";
import AssetStatusBadges from "@/components/AssetStatusBadges";
import { describeExportSource } from "@/lib/asset-selection";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import PrintSizeSelector, { PRINT_SIZES, type PrintSize } from "@/components/PrintSizeSelector";
import { saveToGallery, replaceInGallery } from "@/lib/gallery";
import { loadImageDimensions, classifyPrintReadiness } from "@/lib/image-metadata";
import { recordAssetCostEvent } from "@/lib/cost-events";
import DownloadButton from "@/components/generation/DownloadButton";
import UploadedImageInput, { type UploadedSource } from "@/components/generation/UploadedImageInput";
import GeneratedImageActions from "@/components/generation/GeneratedImageActions";
import ImagePreviewMockups from "@/components/ImagePreviewMockups";
import PromptHistoryPanel from "@/components/PromptHistoryPanel";
import { savePromptHistory } from "@/lib/prompt-history";
import { useVariantFanOut, type VariantTile } from "@/features/generation/useVariantFanOut";
import VariantGrid from "@/features/generation/VariantGrid";
import type { StyleConfig } from "@/lib/style-config";
import { type QualityTarget, getResolutionForPrintSize, formatResolution } from "@/lib/print-resolution";
import { PRINT_FORMATS, type PrintFormat, formatExportDescription, getPosterPromptHint } from "@/lib/print-formats";
import { enforcePosterRatio } from "@/lib/poster-ratio-enforce";
import { useDurableGeneration } from "@/hooks/useDurableGeneration";
import { runFinalizeOnce } from "@/lib/finalize-ratio-lock";
import {
  isDurableResultMetadataV1,
  reconstructNormalizedResponse,
} from "@/lib/durable-result-metadata";

import { preparePrintExport, downloadPrintExport } from "@/lib/print-export";
import { EXPORT_FORMAT_META, getStoredExportFormat } from "@/lib/export-formats";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { useUpscale } from "@/hooks/use-upscale";
import {
  UPSCALE_MODES,
  DEFAULT_UPSCALE_MODE,
  type UpscaleMode,
} from "@/lib/upscale-modes";
import GeneratorBadge from "@/components/GeneratorBadge";
import { type ModelSelectorValue } from "@/components/generation/ModelSelector";
// UpscaleBadge removed from generator — replaced by EnhanceForPrintDialog
// (kept in Gallery for the lightbox).
import {
  type GeneratorPreference,
  type ResolvedProviderId,
  GENERATOR_PROVIDERS,
  loadGeneratorPreference,
} from "@/lib/generators";

import {
  resolveUpscaleRecipe,
  generatorFamilyFromProvider,
  type UpscaleRecipe,
} from "@/lib/upscale-recipes";
import RouteBadge from "@/components/RouteBadge";
import ProviderComparison from "@/components/ProviderComparison";
import { useImageFeedback } from "@/hooks/use-image-feedback";
import type { NormalizedGenerationResponse } from "@/lib/generation-types";
import {
  getDefaultStrictness,
  type ProviderId as StrictnessProviderId,
} from "@/lib/style-strictness";
import {
  REFERENCE_STRENGTH_OPTIONS,
  DEFAULT_REFERENCE_STRENGTH,
  referenceStrengthLabel,
  type ReferenceStrength,
} from "@/lib/reference-strength";


interface ImageGeneratorProps {
  mode: string;
  styleConfig: StyleConfig;
  onImageSaved?: () => void;
  onExitEdit?: () => void;
  initialPrompt?: string;
  initialImageUrl?: string;
  originalImageId?: string;
  originalStoragePath?: string;
}

export default function ImageGenerator({
  mode,
  styleConfig,
  onImageSaved,
  onExitEdit,
  initialPrompt,
  initialImageUrl,
  originalImageId,
  originalStoragePath,
}: ImageGeneratorProps) {
  const isEditMode = !!initialImageUrl;
  const isThemed = mode === styleConfig.themedModeValue;
  const isTertiary = mode === styleConfig.tertiaryModeValue;
  const edgeFn = isTertiary ? styleConfig.tertiaryEdgeFn! : isThemed ? styleConfig.themedEdgeFn : styleConfig.freestyleEdgeFn;
  const modeLabel = isTertiary ? styleConfig.tertiaryTabLabel! : isThemed ? styleConfig.themedTabLabel : styleConfig.freestyleTabLabel;
  const generateLabel = isTertiary ? styleConfig.tertiaryGenerateLabel! : isThemed ? styleConfig.themedGenerateLabel : styleConfig.freestyleGenerateLabel;

  // Variant-specific style key (e.g. "lineart-minimal", "lineart-freestyle", "lineart").
  // STYLE_RULES is keyed by this AND resolveEdgeFnForStyle expects this. Passing the
  // base styleConfig.styleKey makes every variant resolve to the themed edge function
  // and themed prompt rules (e.g. Minimal Lines acting like Ink Scenes).
  const variantStyleKey = isTertiary
    ? (styleConfig.tertiaryModeValue ?? styleConfig.styleKey)
    : isThemed
    ? styleConfig.styleKey
    : (styleConfig.freestyleModeValue ?? `${styleConfig.styleKey}-freestyle`);

  const persistKey = `${styleConfig.styleKey}-${mode}` as any;

  const {
    prompt, setPrompt,
    imageUrl, setImageUrl,
    baseImageUrl, setBaseImageUrl,
    savedToGallery, setSavedToGallery,
  } = usePersistedGeneration(persistKey, isEditMode ? undefined : initialPrompt);

  const [sourceImageUrl] = useState<string | null>(initialImageUrl || null);
  // User-uploaded source image (non-edit mode). Treated as sourceImageUrl
  // when present so the existing edit/source pipeline is reused.
  const [uploadedSource, setUploadedSource] = useState<UploadedSource | null>(null);
  const effectiveSourceImageUrl = sourceImageUrl || uploadedSource?.url || null;
  // Reference-image strength — only meaningful when a source image is in play
  // (uploaded reference OR inline edit on the current image).
  const [referenceStrength, setReferenceStrength] = useState<ReferenceStrength>(
    DEFAULT_REFERENCE_STRENGTH,
  );
  const [lastReferenceStrength, setLastReferenceStrength] = useState<ReferenceStrength | null>(null);
  // Store the enhanced URL separately from the displayed imageUrl
  const [enhancedImageUrl, setEnhancedImageUrl] = useState<string | null>(null);
  const [matchingOpen, setMatchingOpen] = useState(false);
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Upscale mode selector — replaces the old hardcoded `enhancementMode = "hd"`
  // and the simple Auto-Upscale switch with a single explicit choice.
  const [upscaleMode, setUpscaleMode] = useState<UpscaleMode>(DEFAULT_UPSCALE_MODE);
  const [backgroundStyle, setBackgroundStyle] = useState<"white" | "cream">("white");
  const [paperColor, setPaperColor] = useState<"white" | "cream">("white");
  const [viewVersion, setViewVersion] = useState<"enhanced" | "original" | "compare">("enhanced");
  const [printSize, setPrintSize] = useState<PrintSize>(PRINT_SIZES[2]);
  const [qualityTarget, setQualityTarget] = useState<QualityTarget>("print-300");
  const [generationMode, setGenerationMode] = useState<"standard" | "print-ready">("print-ready");
  const [selectedPrintFormat, setSelectedPrintFormat] = useState<PrintFormat>(PRINT_FORMATS[0]);
  // Phase 1: generator provider preference (auto/sdxl/gemini), persisted in sessionStorage
  const [generatorPref, setGeneratorPref] = useState<GeneratorPreference>(() => loadGeneratorPreference());
  // Phase 3: registry-driven model + quality/strategy selection. UI/request
  // plumbing only — router dispatch still keyed off `generatorPref`.
  const [modelSelection, setModelSelection] = useState<ModelSelectorValue>({
    modelId: null,
    qualityProfile: "balanced",
    generationStrategy: null,
  });
  const [lastProviderUsed, setLastProviderUsed] = useState<string | null>(null);
  const [lastModelUsed, setLastModelUsed] = useState<string | null>(null);
  const [lastFallbackUsed, setLastFallbackUsed] = useState<boolean>(false);
  const [lastStrategyUsed, setLastStrategyUsed] = useState<"auto" | "manual" | null>(null);
  const [lastExecutionRoute, setLastExecutionRoute] = useState<string | null>(null);
  const [lastRoutingReason, setLastRoutingReason] = useState<string | null>(null);
  const [lastProviderExactMatch, setLastProviderExactMatch] = useState<boolean | null>(null);
  const [lastRequestedSize, setLastRequestedSize] = useState<string | null>(null);
  // ── Phase 2: route-level v2 metadata (provider/model/route + cost). These
  // come from the generate-image-v2 envelope (via the lovable adapter's
  // metadata blob). They are persisted on save so the gallery can show
  // accurate provenance + cost badges.
  const [lastRouteProvider, setLastRouteProvider] = useState<string | null>(null);
  const [lastRouteModel, setLastRouteModel] = useState<string | null>(null);
  const [lastRouteLabel, setLastRouteLabel] = useState<string | null>(null);
  const [lastEstimatedCost, setLastEstimatedCost] = useState<number | null>(null);
  const [lastCurrency, setLastCurrency] = useState<string>("USD");
  const [lastPromptVersion, setLastPromptVersion] = useState<string | null>(null);
  // Phase 5 — model-selection truthfulness
  const [lastRequestedModelId, setLastRequestedModelId] = useState<string | null>(null);
  const [lastResolvedModelId, setLastResolvedModelId] = useState<string | null>(null);
  const [lastSelectedAdapterId, setLastSelectedAdapterId] = useState<string | null>(null);
  const [lastModelFallbackReason, setLastModelFallbackReason] = useState<string | null>(null);
  // Live probed dimensions for BOTH the base (original master) and the
  // enhanced (upscaled) asset, tracked independently so EnhanceForPrintDialog
  // can route correctly against whichever source the user selects.
  // Reset whenever the matching URL changes; a probe failure leaves it null
  // so the dialog falls back to its safe unknown-dimensions behavior.
  type ProbedDims = { width: number; height: number; url: string } | null;
  const [baseProbedDims, setBaseProbedDims] = useState<ProbedDims>(null);
  const [enhancedProbedDims, setEnhancedProbedDims] = useState<ProbedDims>(null);
  // Durable master identity captured from the persisted worker result.
  // Cleared at the start of every new generation so a new image never
  // inherits the previous image's anchor identity.
  const [durableMasterUrl, setDurableMasterUrl] = useState<string | null>(null);
  const [durableMasterStoragePath, setDurableMasterStoragePath] = useState<string | null>(null);
  const [durableMasterWidth, setDurableMasterWidth] = useState<number | null>(null);
  const [durableMasterHeight, setDurableMasterHeight] = useState<number | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  // Variant fan-out — generate 4 in parallel and let the user pick.
  const [variantMode, setVariantMode] = useState(false);
  // Which generators are included in the fan-out. Defaults to all three
  // concrete providers so the toggle keeps the previous "run everywhere"
  // behavior when the user first enables Variant mode.
  const VARIANT_PROVIDER_IDS: ResolvedProviderId[] = ["sdxl", "gemini", "openai"];
  const [selectedVariantProviders, setSelectedVariantProviders] = useState<Set<ResolvedProviderId>>(
    () => new Set<ResolvedProviderId>(VARIANT_PROVIDER_IDS),
  );
  const [savedTileIds, setSavedTileIds] = useState<Set<number>>(new Set());
  const [savingTileId, setSavingTileId] = useState<number | null>(null);
  const variantFanOut = useVariantFanOut();

  // Bumped after each successful prompt-history save so the panel reloads.
  const [promptHistoryRefresh, setPromptHistoryRefresh] = useState(0);

  const { toast } = useToast();

  // Shared upscale hook
  const {
    stage: upscaleStage,
    isRunning: isUpscaling,
    stageLabel: upscaleStageLabel,
    progress: upscaleProgress,
    jobStatus: upscaleJobStatus,
    upscale,
    reset: resetUpscale,
  } = useUpscale();

  const savedGalleryIdRef = useRef<string | null>(null);
  const upscaleRunId = useRef(0);

  // ── Durable server-owned single-image path ─────────────────────────
  // Only the ordinary "Generate" flow is wired here. Variant fan-out and
  // print-replay still use the in-tab paths in this pass.
  const durable = useDurableGeneration({
    styleKey: variantStyleKey,
    autoHydrate: true,
  });
  const processedItemsRef = useRef<Set<string>>(new Set());
  const activePromptRef = useRef<string>("");
  const activeRefImageRef = useRef<string | undefined>(undefined);
  const activeRefStrengthRef = useRef<ReferenceStrength | null>(null);
  const [durableFailure, setDurableFailure] = useState<{ itemId: string; message: string } | null>(
    null,
  );

  const suggestions = isTertiary && styleConfig.prompts.tertiary ? styleConfig.prompts.tertiary : isThemed ? styleConfig.prompts.themed : styleConfig.prompts.freestyle;
  // Poster format is the single source of truth for aspect ratio across
  // generation, preview, composer, and export. Standard mode used to drive
  // ratio from PrintSizeSelector — we now ALWAYS use the selected poster
  // format so the choice flows through every provider deterministically.
  const effectiveAspectRatio = selectedPrintFormat.aspectRatio;
  const upscaleConfig = UPSCALE_MODES[upscaleMode];

  // Style + provider-aware recipe recommendation. Recomputes whenever the
  // style, provider, or print intent changes.
  const recommendedRecipe = useMemo(
    () =>
      resolveUpscaleRecipe({
        styleKey: variantStyleKey,
        mode,
        generatorFamily: generatorFamilyFromProvider(lastProviderUsed),
        printIntent: generationMode === "print-ready",
      }),
    [variantStyleKey, mode, lastProviderUsed, generationMode],
  );

  // Live asset-dimension probes.
  // Run independently for the base and enhanced URLs so the enhance dialog can
  // route accurately against whichever source the user selects (Auto / Original
  // / Current enhanced). Each probe re-runs only when its URL changes; failures
  // leave the dim null and fall back to the dialog's unknown-dimension behavior.
  const liveBaseUrl = baseImageUrl || imageUrl || null;
  const liveEnhancedUrl = enhancedImageUrl || null;

  useEffect(() => {
    if (!liveBaseUrl) {
      setBaseProbedDims(null);
      return;
    }
    if (baseProbedDims?.url === liveBaseUrl) return;
    let cancelled = false;
    loadImageDimensions(liveBaseUrl)
      .then((dims) => {
        if (cancelled || !dims) return;
        setBaseProbedDims({ width: dims.width, height: dims.height, url: liveBaseUrl });
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn("[ImageGenerator] base dimension probe failed:", e);
        setBaseProbedDims(null);
      });
    return () => {
      cancelled = true;
    };
  }, [liveBaseUrl, baseProbedDims?.url]);

  useEffect(() => {
    if (!liveEnhancedUrl) {
      setEnhancedProbedDims(null);
      return;
    }
    if (enhancedProbedDims?.url === liveEnhancedUrl) return;
    let cancelled = false;
    loadImageDimensions(liveEnhancedUrl)
      .then((dims) => {
        if (cancelled || !dims) return;
        setEnhancedProbedDims({ width: dims.width, height: dims.height, url: liveEnhancedUrl });
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn("[ImageGenerator] enhanced dimension probe failed:", e);
        setEnhancedProbedDims(null);
      });
    return () => {
      cancelled = true;
    };
  }, [liveEnhancedUrl, enhancedProbedDims?.url]);

  /**
   * Trigger upscale (shared for auto + manual + re-upscale).
   * ALWAYS runs from the original/base image, never from an already-upscaled
   * derivative — that's how we preserve quality across re-upscales.
   */
  const runUpscale = async (
    mode: UpscaleMode,
    galleryId?: string | null,
    recipe?: UpscaleRecipe | null,
  ) => {
    if (mode === "none") return;
    const sourceUrl = baseImageUrl || imageUrl;
    if (!sourceUrl) return;

    const runId = ++upscaleRunId.current;
    // If the picked mode matches the recommended recipe and no recipe was
    // passed explicitly, attach the recommendation so it's recorded on the job.
    const effectiveRecipe: UpscaleRecipe | null =
      recipe ??
      (recommendedRecipe && mode === recommendedRecipe.recommendedMode
        ? recommendedRecipe
        : null);
    const result = await upscale(sourceUrl, {
      mode,
      galleryImageId: galleryId || undefined,
      recipe: effectiveRecipe
        ? {
            id: effectiveRecipe.id,
            label: effectiveRecipe.label,
            reason: effectiveRecipe.reason,
          }
        : undefined,
    });
    if (upscaleRunId.current !== runId) return;
    if (result) {
      // Upscalers (notably tiled paths) can drift off the poster ratio
      // — re-enforce against the selected format so PPI/export checks
      // stay correct.
      let enhancedUrl = result.imageUrl;
      try {
        const enforced = await enforcePosterRatio({
          imageUrl: result.imageUrl,
          formatId: selectedPrintFormat.id,
        });
        if (enforced?.url) enhancedUrl = enforced.url;
      } catch (e) {
        console.warn("[ImageGenerator] post-upscale ratio enforcement failed", e);
      }
      setEnhancedImageUrl(enhancedUrl);
      setImageUrl(enhancedUrl);
      const label = UPSCALE_MODES[mode].shortLabel;
      toast({
        title: result.downshifted
          ? "Upscale complete (downshifted to 4×)"
          : "Upscale complete",
        description: result.downshifted
          ? "8× output exceeded the 8K limit — used tiled 4× instead."
          : `Image enhanced via ${label} (${result.scale}× resolution).`,
      });

    } else {
      toast({
        title: "Upscale failed",
        description: "Could not upscale — original image preserved.",
        variant: "destructive",
      });
    }
  };

  /**
   * Build the same NormalizedGenerationRequest used by `generate()` so the
   * single-shot and variant-fan-out paths produce comparable results.
   */
  const buildGenerationRequest = () => {
    const activePrompt = isInlineEditing ? editPrompt : prompt;
    const referenceImageUrl =
      isInlineEditing && imageUrl ? imageUrl : effectiveSourceImageUrl || undefined;
    const strictnessProvider: StrictnessProviderId =
      generatorPref === "auto" ? "sdxl" : (generatorPref as StrictnessProviderId);
    const effectiveStrictness = getDefaultStrictness({
      styleKey: variantStyleKey,
      provider: strictnessProvider,
    });
    return {
      prompt: activePrompt.trim(),
      styleKey: variantStyleKey,
      aspectRatio: effectiveAspectRatio,
      backgroundStyle,
      printMode: true,
      providerPreference: generatorPref,
      referenceImageUrl,
      isEdit: !!referenceImageUrl,
      referenceStrength: referenceImageUrl ? referenceStrength : undefined,
      strictness: effectiveStrictness,
      posterFormatId: selectedPrintFormat.id,
      posterFormatHint: getPosterPromptHint(selectedPrintFormat.id),
      targetAspectRatio: selectedPrintFormat.aspectRatioDecimal,
      modelId: modelSelection.modelId ?? undefined,
      qualityProfile: modelSelection.qualityProfile,
      generationStrategy: modelSelection.generationStrategy ?? undefined,
    };
  };

  const startVariantFanOut = async () => {
    const activePrompt = isInlineEditing ? editPrompt : prompt;
    if (!activePrompt.trim()) return;
    if (selectedVariantProviders.size === 0) return;
    setSavedTileIds(new Set());
    setSavingTileId(null);
    const baseReq = buildGenerationRequest();
    // One request per selected generator — override providerPreference so
    // each tile deterministically runs on the chosen provider (never Auto).
    const reqs = VARIANT_PROVIDER_IDS
      .filter((id) => selectedVariantProviders.has(id))
      .map((id) => ({
        request: { ...baseReq, providerPreference: id as GeneratorPreference },
        providerLabel: GENERATOR_PROVIDERS[id].displayName,
      }));
    await variantFanOut.start(reqs);
  };


  const handleKeepVariant = async (tile: VariantTile, response: NormalizedGenerationResponse) => {
    if (savedTileIds.has(tile.id) || savingTileId !== null) return;
    setSavingTileId(tile.id);
    try {
      const finalPrompt = (isInlineEditing ? editPrompt : prompt).trim();
      const isPrint = generationMode === "print-ready";
      const { baseDims, masterDims, readiness } = await probeDimensionsAndReadiness(
        response.imageUrl,
        response.imageUrl,
        isPrint ? selectedPrintFormat.id : null,
      );
      const baseOpts = buildSaveOptions();
      await saveToGallery({
        ...baseOpts,
        imageUrl: response.imageUrl,
        prompt: finalPrompt,
        baseImageUrl: response.imageUrl,
        masterImageUrl: response.imageUrl,
        baseWidthPx: baseDims?.width,
        baseHeightPx: baseDims?.height,
        masterWidth: masterDims?.width,
        masterHeight: masterDims?.height,
        actualWidthPx: masterDims?.width ?? baseDims?.width,
        actualHeightPx: masterDims?.height ?? baseDims?.height,
        printReadiness: readiness,
        generationProvider: response.generationProvider,
        generationModel: response.generationModel,
        providerStrategy: response.strategy,
        fallbackUsed: response.fallbackUsed,
        executionRoute: response.executionRoute,
        assetRole: "base_generation",
        enhanced: false,
        enhancedImageUrl: undefined,
        enhancementModel: undefined,
        upscaleFactor: undefined,
      });
      // Best-effort prompt-history save (mirrors generate()).
      void savePromptHistory({
        prompt: finalPrompt,
        mode: variantStyleKey,
        provider: response.generationProvider ?? null,
        model: response.generationModel ?? null,
      }).then((row) => {
        if (row) setPromptHistoryRefresh((n) => n + 1);
      });
      setSavedTileIds((prev) => {
        const next = new Set(prev);
        next.add(tile.id);
        return next;
      });
      toast({ title: "Variant saved", description: "Added to your gallery." });
      onImageSaved?.();
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Could not save variant.",
        variant: "destructive",
      });
    } finally {
      setSavingTileId(null);
    }
  };

  /**
   * Apply a finished generation to local UI state.
   *
   * Used by both the durable realtime path (server-owned) and hydration
   * on mount. Performs the same client-side Canvas ratio enforcement and
   * state population the in-tab path used to do inline.
   */
  const applyGeneratedImage = async (
    gen: NormalizedGenerationResponse,
    activePrompt: string,
    referenceImageUrl: string | undefined,
    refStrengthUsed: ReferenceStrength | null,
  ) => {
    let baseUrl = gen.imageUrl;
    try {
      const enforced = await enforcePosterRatio({
        imageUrl: gen.imageUrl,
        formatId: selectedPrintFormat.id,
      });
      if (enforced?.url) baseUrl = enforced.url;
    } catch (e) {
      console.warn("[ImageGenerator] poster ratio enforcement failed", e);
    }

    setBaseImageUrl(baseUrl);
    setImageUrl(baseUrl);
    setEnhancedImageUrl(null);

    setLastProviderUsed(gen.generationProvider);
    setLastModelUsed(gen.generationModel);
    setLastFallbackUsed(gen.fallbackUsed);
    setLastStrategyUsed(gen.strategy);
    setLastExecutionRoute(gen.executionRoute);
    setLastRoutingReason(gen.routingReason ?? null);
    setLastProviderExactMatch(
      typeof gen.providerExactMatch === "boolean" ? gen.providerExactMatch : null,
    );
    setLastRequestedSize(
      gen.requestedWidth && gen.requestedHeight
        ? `${gen.requestedWidth}×${gen.requestedHeight}`
        : gen.requestedAspectRatio ?? null,
    );

    const routeMeta = (gen.metadata || {}) as Record<string, unknown>;
    setLastRouteProvider(
      typeof routeMeta.adapter === "string" ? (routeMeta.adapter as string) : gen.generationProvider ?? "lovable",
    );
    setLastRouteModel(gen.generationModel || null);
    setLastRouteLabel(typeof routeMeta.route === "string" ? (routeMeta.route as string) : gen.executionRoute ?? null);
    setLastEstimatedCost(
      typeof routeMeta.estimatedCost === "number" ? (routeMeta.estimatedCost as number) : null,
    );
    setLastCurrency(typeof routeMeta.currency === "string" ? (routeMeta.currency as string) : "USD");
    setLastPromptVersion(
      typeof routeMeta.promptVersion === "string" ? (routeMeta.promptVersion as string) : null,
    );
    setLastRequestedModelId(gen.requestedModelId ?? null);
    setLastResolvedModelId(gen.resolvedModelId ?? null);
    setLastSelectedAdapterId(gen.selectedAdapterId ?? null);
    setLastModelFallbackReason(gen.modelFallbackReason ?? null);
    setLastReferenceStrength(referenceImageUrl ? refStrengthUsed : null);

    void savePromptHistory({
      prompt: activePrompt.trim(),
      mode: variantStyleKey,
      provider: gen.generationProvider ?? null,
      model: gen.generationModel ?? null,
    }).then((row) => {
      if (row) setPromptHistoryRefresh((n) => n + 1);
    });

    if (isInlineEditing) {
      setPrompt(activePrompt.trim());
      setIsInlineEditing(false);
      setEditPrompt("");
    }
  };

  /**
   * Kick off a durable single-image generation. Persists the pending
   * idempotency key BEFORE creating the job so a mid-flight refresh
   * recovers cleanly, then delegates dispatch to `generate-single` via
   * the durable hook. Completion is handled by the realtime effect
   * below.
   */
  const generate = async () => {
    const activePrompt = isInlineEditing ? editPrompt : prompt;
    if (!activePrompt.trim()) return;
    setLoading(true);
    setViewVersion("enhanced");
    setSavedToGallery(false);
    resetUpscale();
    setEnhancedImageUrl(null);
    savedGalleryIdRef.current = null;
    // Clear previous anchor identity so the new generation cannot
    // inherit the prior image's gallery id, storage path, or dims.
    setDurableMasterUrl(null);
    setDurableMasterStoragePath(null);
    setDurableMasterWidth(null);
    setDurableMasterHeight(null);
    upscaleRunId.current++;
    setDurableFailure(null);

    const referenceImageUrl =
      isInlineEditing && imageUrl ? imageUrl : effectiveSourceImageUrl || undefined;
    const strictnessProvider: StrictnessProviderId =
      generatorPref === "auto" ? "sdxl" : (generatorPref as StrictnessProviderId);
    const effectiveStrictness = getDefaultStrictness({
      styleKey: variantStyleKey,
      provider: strictnessProvider,
    });

    // Track the request context so the completion effect can pass it
    // through even after realtime reconnect / refresh.
    activePromptRef.current = activePrompt.trim();
    activeRefImageRef.current = referenceImageUrl;
    activeRefStrengthRef.current = referenceImageUrl ? referenceStrength : null;

    try {
      // Build a payload compatible with generate-single's ItemPayload.
      // The provider preference and strictness travel with the request
      // so the server resolves an equivalent generator to the in-tab
      // router path.
      await durable.start({
        prompt: activePrompt.trim(),
        aspectRatio: effectiveAspectRatio,
        backgroundStyle,
        generationMode: "print-ready",
        printFormatId: selectedPrintFormat.id,
        qualityMode: "quality",
        targetPpi: 300,
        targetWidthPx: selectedPrintFormat.preferredPixelWidth,
        targetHeightPx: selectedPrintFormat.preferredPixelHeight,
        providerPreference: generatorPref,
        providerLabel:
          generatorPref === "auto" ? null : GENERATOR_PROVIDERS[generatorPref]?.displayName ?? null,
        sourceImageUrl: referenceImageUrl ?? null,
        referenceStrength: referenceImageUrl ? referenceStrength : null,
      });
      void effectiveStrictness; // acknowledged, server derives its own default
    } catch (err: any) {
      toast({
        title: "Generation failed",
        description: err?.message || "Could not start generation.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  /**
   * Retry a failed durable item. Server-side re-queues and re-invokes
   * generate-single; realtime carries the result back.
   */
  const handleDurableRetry = async () => {
    if (!durableFailure) return;
    const itemId = durableFailure.itemId;
    setDurableFailure(null);
    setLoading(true);
    processedItemsRef.current.delete(itemId);
    try {
      const { error } = await supabase.functions.invoke("generate-single-item-retry", {
        body: { itemId },
      });
      if (error) throw error;
    } catch (err: any) {
      toast({
        title: "Retry failed",
        description: err?.message || "Could not requeue.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  // ── Durable completion / failure effect ─────────────────────────────
  useEffect(() => {
    const first = durable.items.find((r) => r.position === 0) ?? durable.items[0];
    if (!first) return;
    if (processedItemsRef.current.has(first.id)) return;

    if (first.status === "queued" || first.status === "processing" || first.status === "dispatching") {
      // Keep the spinner visible when hydrating an in-flight job.
      if (!loading) setLoading(true);
      return;
    }

    if (first.status === "failed") {
      processedItemsRef.current.add(first.id);
      setDurableFailure({
        itemId: first.id,
        message: first.error_message || "Generation failed.",
      });
      setLoading(false);
      toast({
        title: "Generation failed",
        description: first.error_message || "The image could not be generated.",
        variant: "destructive",
      });
      return;
    }

    if (first.status !== "completed") return;

    // Completed. Guard adoption to items with a valid image URL and a
    // ratio_enforcement_status we can consume (completed OR pending —
    // we run Canvas enforcement locally either way).
    const rawUrl = first.enforced_image_url ?? first.image_url ?? first.raw_image_url;
    if (!rawUrl) return;

    processedItemsRef.current.add(first.id);
    void runFinalizeOnce(first.id, async () => {
      const meta = isDurableResultMetadataV1(first.result_metadata)
        ? first.result_metadata
        : null;
      const promptForApply = activePromptRef.current || prompt;
      const refUrlForApply = activeRefImageRef.current;
      const refStrengthForApply = activeRefStrengthRef.current;
      if (meta) {
        const gen = reconstructNormalizedResponse(rawUrl, promptForApply, variantStyleKey, meta);
        await applyGeneratedImage(gen, promptForApply, refUrlForApply, refStrengthForApply);
      } else {
        // Legacy fallback: no metadata — apply minimal state.
        setBaseImageUrl(rawUrl);
        setImageUrl(rawUrl);
        setEnhancedImageUrl(null);
      }
      // ── Adopt the durable worker's persisted gallery row.
      // The worker already inserted the generated_images row (with real
      // storage_path, cost event, and provenance). Adopting its id here
      // prevents a second save from `handleSaveToGallery`, and lets the
      // Matching-Collection dialog use the true anchor identity.
      const persistedId = meta?.galleryImageId ?? null;
      if (persistedId) {
        savedGalleryIdRef.current = persistedId;
        setSavedToGallery(true);
      }
      // Capture durable master identity so Matching Collection can
      // hand off the persisted storage path + real actual dimensions.
      if (meta?.storagePath) setDurableMasterStoragePath(meta.storagePath);
      if (meta?.actualWidthPx) setDurableMasterWidth(meta.actualWidthPx);
      if (meta?.actualHeightPx) setDurableMasterHeight(meta.actualHeightPx);
      // The visible base URL is the ratio-enforced Canvas asset; the
      // durable master URL is the raw persisted output. We record the
      // raw URL only so the resolver can match a direct-select scenario.
      setDurableMasterUrl(rawUrl);
      setLoading(false);
      setDurableFailure(null);
      // Release the durable pointer so the next generation starts clean.
      durable.clear();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durable.items]);


  const hasEnhanced = baseImageUrl && enhancedImageUrl && baseImageUrl !== enhancedImageUrl;
  const canManualUpscale = !!imageUrl && !isUpscaling && !loading;

  const buildSaveOptions = () => {
    const isPrint = generationMode === "print-ready";
    const resolution = isPrint
      ? null
      : getResolutionForPrintSize(printSize.dimensions, qualityTarget);

    return {
      mode,
      aspectRatio: effectiveAspectRatio,
      printSize: isPrint ? selectedPrintFormat.label : printSize.dimensions,
      qualityMode: qualityTarget,
      targetPpi: isPrint ? 300 : resolution?.ppi,
      targetWidthPx: isPrint ? selectedPrintFormat.preferredPixelWidth : resolution?.widthPx,
      targetHeightPx: isPrint ? selectedPrintFormat.preferredPixelHeight : resolution?.heightPx,
      enhanced: !!hasEnhanced,
      printFormatId: isPrint ? selectedPrintFormat.id : undefined,
      generationMode: generationMode,
      exportType: isPrint ? selectedPrintFormat.exportType : undefined,
      // Pass enhanced image URL separately so gallery stores both base + enhanced
      enhancedImageUrl: enhancedImageUrl || undefined,
      enhancementModel: enhancedImageUrl ? upscaleConfig.provider : undefined,
      upscaleFactor: enhancedImageUrl ? upscaleConfig.scaleFactor : undefined,
      // Phase 1: generator provider metadata
      generationProvider: lastProviderUsed || undefined,
      generationModel: lastModelUsed || undefined,
      providerStrategy: lastStrategyUsed || undefined,
      fallbackUsed: lastFallbackUsed,
      executionRoute: lastExecutionRoute || undefined,
      // Phase 2 — v2 envelope metadata (route-level provenance + cost).
      provider: lastRouteProvider || undefined,
      model: lastRouteModel || undefined,
      route: lastRouteLabel || undefined,
      estimatedCost: lastEstimatedCost,
      currency: lastCurrency,
      promptVersion: lastPromptVersion || undefined,
      assetRole: hasEnhanced ? ("enhanced_master" as const) : ("base_generation" as const),
      // Source-image provenance (uploaded source has full metadata; edit-mode
      // initial source only has a URL).
      sourceImageUrl: effectiveSourceImageUrl || undefined,
      sourceStoragePath: uploadedSource?.storagePath || undefined,
      sourceFileName: uploadedSource?.fileName || undefined,
    };
  };

  /**
   * Best-effort dimension + readiness probe. Never throws — falls back to
   * `unknown` print readiness so save is never blocked by a CORS or
   * network hiccup on the dimension load.
   */
  const probeDimensionsAndReadiness = async (
    baseUrl: string,
    masterUrl: string,
    printFormatIdForReadiness: string | null,
  ) => {
    let baseDims: { width: number; height: number } | null = null;
    let masterDims: { width: number; height: number } | null = null;
    try {
      baseDims = await loadImageDimensions(baseUrl);
    } catch (e) {
      console.warn("[ImageGenerator] base dimension probe failed:", e);
    }
    try {
      masterDims =
        masterUrl === baseUrl
          ? baseDims
          : await loadImageDimensions(masterUrl);
    } catch (e) {
      console.warn("[ImageGenerator] master dimension probe failed:", e);
    }
    const readiness = classifyPrintReadiness(
      masterDims?.width ?? null,
      masterDims?.height ?? null,
      printFormatIdForReadiness,
    );
    return { baseDims, masterDims, readiness };
  };

  const handleSaveToGallery = async () => {
    if (!imageUrl || savedToGallery || saving) return;
    setSaving(true);
    try {
      const finalPrompt = isEditMode && initialPrompt
        ? `${initialPrompt} | Edited: ${prompt.trim()}`
        : prompt.trim();

      const baseUrlForSave = baseImageUrl || imageUrl;
      const masterUrlForSave = enhancedImageUrl || baseUrlForSave;
      const isPrint = generationMode === "print-ready";
      const { baseDims, masterDims, readiness } = await probeDimensionsAndReadiness(
        baseUrlForSave,
        masterUrlForSave,
        isPrint ? selectedPrintFormat.id : null,
      );

      const saveOpts = buildSaveOptions();
      const { id: newId } = await saveToGallery({
        imageUrl: baseUrlForSave,
        prompt: finalPrompt,
        ...saveOpts,
        baseImageUrl: baseUrlForSave,
        masterImageUrl: masterUrlForSave,
        baseWidthPx: baseDims?.width,
        baseHeightPx: baseDims?.height,
        masterWidth: masterDims?.width,
        masterHeight: masterDims?.height,
        actualWidthPx: masterDims?.width ?? baseDims?.width,
        actualHeightPx: masterDims?.height ?? baseDims?.height,
        printReadiness: readiness,
        requestedModelId: lastRequestedModelId,
        resolvedModelId: lastResolvedModelId,
        selectedAdapterId: lastSelectedAdapterId,
        qualityProfile: modelSelection.qualityProfile ?? null,
        generationStrategy: modelSelection.generationStrategy ?? null,
        modelFallbackReason: lastModelFallbackReason,
      });
      setSavedToGallery(true);
      onImageSaved?.();
      // Cost-event log uses the id returned by saveToGallery — no race.
      try {
        await recordAssetCostEvent({
          imageId: newId,
          eventType: "generation",
          provider: lastRouteProvider || "lovable",
          model: lastRouteModel || "google/gemini-3-pro-image-preview",
          mode,
          estimatedCost: lastEstimatedCost,
          currency: lastCurrency,
          status: "succeeded",
          metadata: {
            route: lastRouteLabel,
            promptVersion: lastPromptVersion,
            executionRoute: lastExecutionRoute,
            requested_model_id: lastRequestedModelId,
            resolved_model_id: lastResolvedModelId,
            selected_adapter_id: lastSelectedAdapterId,
            quality_profile: modelSelection.qualityProfile,
            generation_strategy: modelSelection.generationStrategy,
            model_fallback_reason: lastModelFallbackReason,
          },
        });
      } catch (e) {
        console.warn("[ImageGenerator] cost event skipped:", e);
      }
      toast({ title: "Saved to gallery", description: "Your artwork has been saved." });
    } catch (saveErr: any) {
      console.error("Gallery save failed:", saveErr);
      toast({ title: "Save failed", description: saveErr.message || "Could not save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReplaceOriginal = async () => {
    if (!imageUrl || !originalImageId || !originalStoragePath || replacing) return;
    setReplacing(true);
    try {
      const finalPrompt = isEditMode && initialPrompt
        ? `${initialPrompt} | Edited: ${prompt.trim()}`
        : prompt.trim();

      const baseUrlForSave = baseImageUrl || imageUrl;
      const masterUrlForSave = enhancedImageUrl || baseUrlForSave;
      const isPrint = generationMode === "print-ready";
      const { baseDims, masterDims, readiness } = await probeDimensionsAndReadiness(
        baseUrlForSave,
        masterUrlForSave,
        isPrint ? selectedPrintFormat.id : null,
      );

      await replaceInGallery({
        originalId: originalImageId,
        originalStoragePath,
        imageUrl: baseUrlForSave,
        prompt: finalPrompt,
        ...buildSaveOptions(),
        baseImageUrl: baseUrlForSave,
        masterImageUrl: masterUrlForSave,
        baseWidthPx: baseDims?.width,
        baseHeightPx: baseDims?.height,
        masterWidth: masterDims?.width,
        masterHeight: masterDims?.height,
        actualWidthPx: masterDims?.width ?? baseDims?.width,
        actualHeightPx: masterDims?.height ?? baseDims?.height,
        printReadiness: readiness,
        requestedModelId: lastRequestedModelId,
        resolvedModelId: lastResolvedModelId,
        selectedAdapterId: lastSelectedAdapterId,
        qualityProfile: modelSelection.qualityProfile ?? null,
        generationStrategy: modelSelection.generationStrategy ?? null,
        modelFallbackReason: lastModelFallbackReason,
      });
      setSavedToGallery(true);
      onImageSaved?.();
      try {
        await recordAssetCostEvent({
          imageId: originalImageId,
          eventType: "generation",
          provider: lastRouteProvider || "lovable",
          model: lastRouteModel || "google/gemini-3-pro-image-preview",
          mode,
          estimatedCost: lastEstimatedCost,
          currency: lastCurrency,
          status: "succeeded",
          metadata: {
            route: lastRouteLabel,
            promptVersion: lastPromptVersion,
            executionRoute: lastExecutionRoute,
            replacement: true,
            requested_model_id: lastRequestedModelId,
            resolved_model_id: lastResolvedModelId,
            selected_adapter_id: lastSelectedAdapterId,
            quality_profile: modelSelection.qualityProfile,
            generation_strategy: modelSelection.generationStrategy,
            model_fallback_reason: lastModelFallbackReason,
          },
        });
      } catch (e) {
        console.warn("[ImageGenerator] cost event skipped:", e);
      }
      toast({ title: "Original replaced", description: "The gallery image has been updated." });
    } catch (err: any) {
      console.error("Replace failed:", err);
      toast({ title: "Replace failed", description: err.message || "Could not replace", variant: "destructive" });
    } finally {
      setReplacing(false);
    }
  };

  const handlePrintExport = async () => {
    if (!imageUrl || exporting) return;
    setExporting(true);
    try {
      // Master selection during generation: enhanced beats base beats raw imageUrl.
      // This mirrors the centralized rules in src/lib/image-assets.ts but
      // operates on local state since nothing has been persisted yet.
      const exportSource = enhancedImageUrl || baseImageUrl || imageUrl;

      const fmt = getStoredExportFormat();
      const fmtMeta = EXPORT_FORMAT_META[fmt];
      const result = await preparePrintExport({
        imageUrl: exportSource,
        printFormatId: selectedPrintFormat.id,
        padColor: paperColor === "cream" ? "#f5f0e8" : "#ffffff",
        exportFormat: fmt,
      });

      const { summary } = formatExportDescription(
        result.tier, result.upscaleApplied, result.upscaleFactor, result.width, result.height,
      );

      const exportFilename = `print-${selectedPrintFormat.id}-${Date.now()}.${fmtMeta.extension}`;
      const { error: uploadErr } = await supabase.storage
        .from("print-exports")
        .upload(exportFilename, result.blob, { contentType: fmtMeta.mimeType });

      if (uploadErr) console.warn("Print export upload skipped:", uploadErr);

      downloadPrintExport(
        result.blob,
        `${styleConfig.downloadPrefix}-${mode}-print-${selectedPrintFormat.id}-${Date.now()}`,
        fmt,
      );

      toast({
        title: `Print export ready · ${selectedPrintFormat.label} · ${fmtMeta.label}`,
        description: summary,
      });
    } catch (err: any) {
      console.error("Print export failed:", err);
      const message = err.message || "Could not export";
      toast({
        title: "Export failed",
        description: message.includes("load")
          ? "Could not load source image — try saving to gallery first, then export."
          : message.includes("too small")
          ? message
          : message.includes("Canvas")
          ? "Your browser could not render this size. Try generating at a larger base size."
          : message,
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleStartInlineEdit = () => {
    setIsInlineEditing(true);
    setEditPrompt("");
  };

  const handleRemoveImage = () => {
    upscaleRunId.current++;
    resetUpscale();
    setImageUrl(null);
    setBaseImageUrl(null);
    setSavedToGallery(false);
    setViewVersion("enhanced");
    setEnhancedImageUrl(null);
  };

  const handleEnhanceConfirm = (m: import("@/lib/upscale-modes").UpscaleMode, recipe: import("@/lib/upscale-recipes").UpscaleRecipe | null) => {
    runUpscale(m, savedGalleryIdRef.current, recipe ?? undefined);
  };

  const isGenerating = loading;

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      <div className="space-y-4 mb-8">
        {/* Edit mode banner */}
        {isEditMode && sourceImageUrl && (
          <div className="flex items-start gap-4 p-3 rounded-sm border border-primary/30 bg-primary/5">
            <img
              src={sourceImageUrl}
              alt="Source image"
              className="h-24 sm:h-32 rounded-sm border border-border object-contain flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="font-display text-xs text-muted-foreground mb-1">
                Editing {modeLabel} image
              </p>
              <p className="font-display text-sm text-foreground truncate">
                {initialPrompt || "Original prompt"}
              </p>
            </div>
            {onExitEdit && (
              <Button variant="ghost" size="sm" onClick={onExitEdit} className="font-display text-xs flex-shrink-0">
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            )}
          </div>
        )}

        {(() => {
          const promptLocked = !!imageUrl && !savedToGallery;
          return (
            <>
              {isInlineEditing ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="font-display text-xs text-muted-foreground">
                      Describe the changes you want to make:
                    </p>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => { setIsInlineEditing(false); setEditPrompt(""); }}
                      className="font-display text-xs h-7"
                    >
                      <X className="h-3 w-3 mr-1" /> Cancel Edit
                    </Button>
                  </div>
                  <Textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="e.g. 'Change the sky to sunset colors' or 'Add more contrast'"
                    className="min-h-[100px] bg-card border-border font-display text-base resize-none focus-visible:ring-primary"
                    autoFocus
                  />
                  <p className="font-display font-bold text-sm text-foreground">Edit suggestions</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.edit.map((p) => (
                      <button key={p} onClick={() => setEditPrompt(p)}
                        className="text-xs px-3 py-1.5 rounded-sm bg-secondary text-secondary-foreground hover:bg-muted transition-colors font-display">
                        {p.length > 40 ? p.slice(0, 40) + "…" : p}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={promptLocked}
                    placeholder={
                      isEditMode ? "Describe the changes you want…"
                        : isTertiary && styleConfig.tertiaryPlaceholder ? styleConfig.tertiaryPlaceholder
                        : isThemed ? styleConfig.themedPlaceholder : styleConfig.freestylePlaceholder
                    }
                    className="min-h-[100px] bg-card border-border font-display text-base resize-none focus-visible:ring-primary disabled:opacity-60"
                  />
                  <p className="font-display font-bold text-sm text-foreground">
                    {isEditMode ? "Edit suggestions" : "Suggestions"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(isEditMode ? suggestions.edit : suggestions.generate).map((p) => (
                      <button key={p} onClick={() => setPrompt(p)} disabled={promptLocked}
                        className="text-xs px-3 py-1.5 rounded-sm bg-secondary text-secondary-foreground hover:bg-muted transition-colors font-display disabled:opacity-50 disabled:cursor-not-allowed">
                        {p.length > 40 ? p.slice(0, 40) + "…" : p}
                      </button>
                    ))}
                  </div>
                  <PromptHistoryPanel
                    mode={variantStyleKey}
                    refreshKey={promptHistoryRefresh}
                    onUsePrompt={(p) => { if (!promptLocked) setPrompt(p); }}
                  />
                </>
              )}
            </>
          );
        })()}

        {/* Cost-control note: enhancement is never automatic. The
            "Enhance for print" button appears next to the generated image
            once it's available (see action row below). */}

        {/* Upload source image — optional, lets the user run the prompt
            against a reference image (reuses the edit/source pipeline). */}
        {!isEditMode && (
          <UploadedImageInput
            value={uploadedSource}
            onChange={setUploadedSource}
            disabled={loading}
          />
        )}

        {/* Reference strength — shown only when a source/reference image
            is actually in play (uploaded reference OR inline edit on the
            current image). Forwarded to the generator as a prompt-side
            directive (no provider on this path exposes a numeric strength). */}
        {(effectiveSourceImageUrl || (isInlineEditing && imageUrl)) && (
          <div className="rounded-sm border border-border bg-card/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">
                Reference strength
              </Label>
              <span className="font-display text-[10px] text-muted-foreground">
                Controls how closely the result follows your reference image.
              </span>
            </div>
            <div className="inline-flex flex-wrap items-center gap-1 border border-border rounded-sm p-0.5">
              {REFERENCE_STRENGTH_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setReferenceStrength(opt.id)}
                  disabled={loading}
                  title={opt.description}
                  className={cn(
                    "font-display text-xs px-2.5 py-1 rounded-sm transition-colors",
                    referenceStrength === opt.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="font-display text-[10px] text-muted-foreground">
              {REFERENCE_STRENGTH_OPTIONS.find((o) => o.id === referenceStrength)?.description}
            </p>
          </div>
        )}

        {/* Generation Mode selector hidden — defaults to "print-ready" via state. */}

        {/* Poster size & Output quality cards hidden — defaults are
            selectedPrintFormat = print_50x70 and qualityTarget = print-300. */}

        {/* ── Artwork card (compact) ─────────────────────────────────── */}
        <div className="rounded-md border border-border bg-card/60 p-3 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-display text-sm font-bold text-foreground">Artwork</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display text-[11px] text-muted-foreground">Background:</span>
              <div className="inline-flex items-center gap-1 border border-border rounded-sm p-0.5">
                <button
                  onClick={() => setBackgroundStyle("white")}
                  className={cn(
                    "font-display text-xs px-2.5 py-1 rounded-sm transition-colors",
                    backgroundStyle === "white"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  White
                </button>
                <button
                  onClick={() => setBackgroundStyle("cream")}
                  className={cn(
                    "font-display text-xs px-2.5 py-1 rounded-sm transition-colors",
                    backgroundStyle === "cream"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Cream
                </button>
              </div>
              {generationMode === "print-ready" && (
                <>
                  <span className="font-display text-[11px] text-muted-foreground">Paper:</span>
                  <div className="inline-flex items-center gap-1 border border-border rounded-sm p-0.5">
                    <button
                      onClick={() => setPaperColor("white")}
                      className={cn(
                        "font-display text-xs px-2.5 py-1 rounded-sm transition-colors",
                        paperColor === "white"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Pure White
                    </button>
                    <button
                      onClick={() => setPaperColor("cream")}
                      className={cn(
                        "font-display text-xs px-2.5 py-1 rounded-sm transition-colors",
                        paperColor === "cream"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Cream
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Poster format selector — controls artwork composition + export shape */}
          <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-border/60">
            <div className="flex flex-col">
              <span className="font-display text-[11px] text-muted-foreground">Poster format</span>
              <span className="font-display text-[10px] text-muted-foreground/70">
                Controls the artwork composition and export shape.
              </span>
            </div>
            <select
              value={selectedPrintFormat.id}
              onChange={(e) => {
                const next = PRINT_FORMATS.find((f) => f.id === e.target.value);
                if (next) setSelectedPrintFormat(next);
              }}
              className="font-display text-xs px-2 py-1 rounded-sm border border-border bg-background text-foreground"
              aria-label="Poster format"
            >
              {PRINT_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>


        {/* Poster setup section hidden — composer text + template state remain
            in defaults (template "fika", textMode "composer", safe area off). */}

        {/* ── Advanced settings (provider/debug controls) ────────────── */}
        <details className="group">
          <summary className="cursor-pointer select-none px-1 py-1 flex items-center gap-2 font-display text-xs">
            <span className="font-bold text-foreground">Advanced settings</span>
            <span className="text-muted-foreground">(provider · strictness · compare)</span>
            {lastProviderUsed && (
              <span className="ml-auto flex items-center gap-2">
                {lastRequestedSize && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border border-border bg-muted/40 text-[10px] font-display text-muted-foreground"
                    title={
                      lastProviderExactMatch === false
                        ? `The generator returned ${lastRequestedSize}, which does not exactly match your selected poster aspect ratio. The image is auto-corrected (padded or center-cropped) to the exact print ratio before saving and export — no manual step needed.`
                        : `The generator produced ${lastRequestedSize} at the exact aspect ratio of your selected poster format. No ratio correction was applied.`
                    }
                  >
                    Last render: {lastRequestedSize}
                    <span
                      className={
                        lastProviderExactMatch === false
                          ? "text-amber-500"
                          : "text-emerald-500"
                      }
                    >
                      ·{" "}
                      {lastProviderExactMatch === false
                        ? "auto-corrected to poster ratio"
                        : "matches poster ratio"}
                    </span>
                  </span>
                )}
                <RouteBadge
                  provider={lastProviderUsed}
                  model={lastModelUsed}
                  route={lastExecutionRoute}
                  fallback={lastFallbackUsed}
                  variant="compact"
                />
              </span>
            )}
          </summary>
          <div className="px-1 pt-3 pb-1 space-y-3">
            {(lastRequestedModelId || lastResolvedModelId || lastModelFallbackReason) && (
              <div
                className="px-2 py-1.5 rounded-sm border border-border bg-muted/30 text-[10px] font-display text-muted-foreground leading-snug"
                title="Model selection truthfulness"
              >
                {lastRequestedModelId && (
                  <span>
                    Requested:{" "}
                    <span className="text-foreground">{lastResolvedModelId ?? lastRequestedModelId}</span>
                    {" · "}
                  </span>
                )}
                <span>
                  Used:{" "}
                  <span className="text-foreground">
                    {lastProviderUsed ?? "—"}
                    {lastModelUsed ? ` / ${lastModelUsed}` : ""}
                  </span>
                  {lastSelectedAdapterId ? ` (adapter: ${lastSelectedAdapterId})` : ""}
                </span>
                {lastModelFallbackReason && (
                  <div className="text-amber-500 mt-0.5">Fallback: {lastModelFallbackReason}</div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <GeneratorBadge
                value={generatorPref}
                onChange={setGeneratorPref}
                lastUsedProvider={lastProviderUsed}
                lastFallbackUsed={lastFallbackUsed}
              />
              {/* Model/quality/strategy popover removed — GeneratorBadge above is the single source of truth for which engine runs. */}
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border border-border bg-muted/40 text-[10px] font-display text-muted-foreground"
                title="Configure per-style defaults at /style-control-panel"
              >
                Strictness: {getDefaultStrictness({
                  styleKey: variantStyleKey,
                  provider: generatorPref === "auto" ? "sdxl" : (generatorPref as StrictnessProviderId),
                })}
                <span className="text-foreground/60">· auto from panel</span>
              </span>
              <Button
                type="button"
                variant={compareOpen ? "default" : "outline"}
                size="sm"
                onClick={() => setCompareOpen((v) => !v)}
                className="font-display text-[11px] h-7"
                title="Generate the same prompt on both providers and pick the best result"
              >
                <Layers className="h-3 w-3 mr-1" />
                {compareOpen ? "Hide compare" : "Compare providers"}
              </Button>
            </div>
            {generationMode === "standard" && (
              <div className="pt-2 border-t border-border/60">
                <PrintSizeSelector
                  selected={printSize}
                  onChange={setPrintSize}
                  qualityTarget={qualityTarget}
                  onQualityChange={setQualityTarget}
                />
                <p className="font-display text-[10px] text-muted-foreground mt-2">
                  Standard-mode legacy quality controls. Poster size above remains the source of truth for aspect ratio.
                </p>
              </div>
            )}
          </div>
        </details>

        {compareOpen && (prompt.trim() || isInlineEditing) && (
          <ProviderComparison
            request={{
              prompt: (isInlineEditing ? editPrompt : prompt).trim(),
              styleKey: variantStyleKey,
              aspectRatio: effectiveAspectRatio,
              backgroundStyle,
              printMode: true,
              referenceImageUrl:
                isInlineEditing && imageUrl
                  ? imageUrl
                  : effectiveSourceImageUrl || undefined,
              isEdit: !!(isInlineEditing && imageUrl) || !!effectiveSourceImageUrl,
            }}
            adapters={[
              { id: "replicate", label: "SDXL (direct Replicate)" },
              { id: "gemini", label: "Gemini (direct)" },
              { id: "openai", label: "OpenAI gpt-image-2 (direct)" },
              { id: "lovable", label: "SDXL (via Lovable)" },
            ]}
            onPick={({ imageUrl: pickedUrl, response }) => {
              setBaseImageUrl(pickedUrl);
              setImageUrl(pickedUrl);
              setLastProviderUsed(response.generationProvider);
              setLastModelUsed(response.generationModel);
              setLastFallbackUsed(response.fallbackUsed);
              setLastStrategyUsed(response.strategy);
              setLastExecutionRoute(response.executionRoute);
              setLastRoutingReason(response.routingReason ?? null);
              setLastProviderExactMatch(
                typeof response.providerExactMatch === "boolean"
                  ? response.providerExactMatch
                  : null,
              );
              setLastRequestedSize(
                response.requestedWidth && response.requestedHeight
                  ? `${response.requestedWidth}×${response.requestedHeight}`
                  : response.requestedAspectRatio ?? null,
              );
              setSavedToGallery(false);
              resetUpscale();
              setEnhancedImageUrl(null);
              setCompareOpen(false);
              toast({
                title: "Result selected",
                description: `Using ${response.generationProvider.toUpperCase()} via ${response.executionRoute}.`,
              });
            }}
            onSaveResult={async ({ imageUrl: resultUrl, response }) => {
              const finalPrompt = isEditMode && initialPrompt
                ? `${initialPrompt} | Edited: ${prompt.trim()}`
                : (isInlineEditing ? editPrompt : prompt).trim();
              const isPrint = generationMode === "print-ready";
              const { baseDims, masterDims, readiness } =
                await probeDimensionsAndReadiness(
                  resultUrl,
                  resultUrl,
                  isPrint ? selectedPrintFormat.id : null,
                );
              const baseOpts = buildSaveOptions();
              await saveToGallery({
                ...baseOpts,
                imageUrl: resultUrl,
                prompt: finalPrompt,
                baseImageUrl: resultUrl,
                masterImageUrl: resultUrl,
                baseWidthPx: baseDims?.width,
                baseHeightPx: baseDims?.height,
                masterWidth: masterDims?.width,
                masterHeight: masterDims?.height,
                actualWidthPx: masterDims?.width ?? baseDims?.width,
                actualHeightPx: masterDims?.height ?? baseDims?.height,
                printReadiness: readiness,
                // Override provider/route metadata with the comparison result
                // so the saved row reflects the provider the user actually saved.
                generationProvider: response.generationProvider,
                generationModel: response.generationModel,
                providerStrategy: response.strategy,
                fallbackUsed: response.fallbackUsed,
                executionRoute: response.executionRoute,
                assetRole: "base_generation",
                // Comparison results are unenhanced raw base images.
                enhanced: false,
                enhancedImageUrl: undefined,
                enhancementModel: undefined,
                upscaleFactor: undefined,
              });
              onImageSaved?.();
            }}
            onClose={() => setCompareOpen(false)}
          />
        )}

        {/* Variant fan-out — opt-in. Pick which generators to fan out to;
            one variant is produced per selected provider. */}
        {!isEditMode && !isInlineEditing && (
          <div className="space-y-2 px-1">
            <label className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Switch
                  checked={variantMode}
                  onCheckedChange={(v) => setVariantMode(!!v)}
                  aria-label="Generate variants across selected generators"
                />
                <span className="font-display text-xs text-foreground">
                  Generate variants
                </span>
              </span>
              <span className="font-display text-[10px] text-muted-foreground">
                {selectedVariantProviders.size}× cost · pick the best
              </span>
            </label>
            {variantMode && (
              <div className="flex flex-wrap gap-2 pl-9">
                {VARIANT_PROVIDER_IDS.map((id) => {
                  const active = selectedVariantProviders.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() =>
                        setSelectedVariantProviders((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        })
                      }
                      className={cn(
                        "font-display text-[11px] px-2.5 py-1 rounded-sm border transition-colors",
                        active
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-border bg-muted/30 text-muted-foreground hover:text-foreground",
                      )}
                      aria-pressed={active}
                    >
                      {GENERATOR_PROVIDERS[id].displayName}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <Button
          onClick={variantMode && !isEditMode && !isInlineEditing ? startVariantFanOut : generate}
          disabled={
            loading ||
            variantFanOut.isRunning ||
            (!isInlineEditing && !prompt.trim()) ||
            (isInlineEditing && !editPrompt.trim()) ||
            (variantMode && !isEditMode && !isInlineEditing && selectedVariantProviders.size === 0)
          }
          className="w-full font-display text-sm tracking-wider h-11"
        >
          {loading || variantFanOut.isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isInlineEditing || isEditMode
                ? "Editing…"
                : variantFanOut.isRunning
                ? "Generating variants…"
                : "Painting…"}
            </>
          ) : isInlineEditing || isEditMode ? (
            "Apply Changes"
          ) : variantMode ? (
            selectedVariantProviders.size === 0
              ? "Select at least one generator"
              : `Generate ${selectedVariantProviders.size} variant${selectedVariantProviders.size === 1 ? "" : "s"}`
          ) : (
            generateLabel || "Generate poster"
          )}
        </Button>

        {durableFailure && !loading && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2">
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-display text-xs font-bold text-destructive">Generation failed</p>
                <p className="font-display text-[11px] text-muted-foreground truncate">
                  {durableFailure.message}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDurableRetry}
              className="font-display text-xs h-7 flex-shrink-0"
            >
              Retry
            </Button>
          </div>
        )}





        {variantMode && (
          <VariantGrid
            tiles={variantFanOut.tiles}
            busy={variantFanOut.isRunning}
            onKeep={handleKeepVariant}
            onDiscard={variantFanOut.discard}
            onRetry={variantFanOut.retryOne}
            onDiscardAll={() => {
              variantFanOut.discardAll();
              setSavedTileIds(new Set());
            }}
            savedTileIds={savedTileIds}
            savingTileId={savingTileId}
            printFormatId={generationMode === "print-ready" ? selectedPrintFormat.id : null}
          />
        )}
      </div>

      <div className="relative min-h-[300px] flex items-center justify-center rounded-sm border border-border bg-card paper-texture">
        {/* Blocking generation spinner — only during base image generation */}
        {isGenerating && (
          <div className="flex flex-col items-center gap-4 text-muted-foreground w-full max-w-xs px-4">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="font-display text-sm text-center">Generating artwork…</p>
            <Progress value={40} className="h-1.5 w-full" />
          </div>
        )}

        {/* Image preview — visible immediately after generation, even during enhancement */}
        {!isGenerating && imageUrl && (
          <div className="flex flex-col items-center gap-4 p-4 w-full relative">
            {/* Upscaling overlay — non-blocking, staged progress */}
            {isUpscaling && (
              <div className="absolute top-2 left-2 right-2 z-10">
                <div className="flex items-center gap-2 bg-card/90 backdrop-blur-sm border border-primary/30 rounded-sm px-3 py-2 shadow-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-xs text-foreground">{upscaleStageLabel}</p>
                    <Progress value={upscaleProgress} className="h-1 w-full mt-1" />
                  </div>
                  <span className="font-display text-[10px] text-muted-foreground flex-shrink-0">
                    {upscaleConfig.shortLabel}
                  </span>
                </div>
              </div>
            )}

            {/* Upscale complete badge */}
            {(upscaleStage === "done" || upscaleStage === "downshifted") && (
              <div className="absolute top-2 left-2 z-10">
                <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 rounded-sm px-2.5 py-1.5 shadow-sm animate-in fade-in duration-300">
                  <Sparkles className="h-3 w-3 text-primary" />
                  <span className="font-display text-[10px] text-primary font-bold">
                    Upscaled · {upscaleStage === "downshifted" ? "tile 4× (downshifted)" : `${upscaleConfig.scaleFactor}× resolution`}
                  </span>
                </div>
              </div>
            )}

            {/* Upscale failed badge */}
            {upscaleStage === "failed" && (
              <div className="absolute top-2 left-2 z-10">
                <div className="flex items-center gap-1.5 bg-muted border border-border rounded-sm px-2.5 py-1.5 shadow-sm animate-in fade-in duration-300">
                  <span className="font-display text-[10px] text-muted-foreground">Upscale failed — original kept</span>
                </div>
              </div>
            )}

            <ImagePreviewMockups
              imageUrl={viewVersion === "original" && hasEnhanced ? baseImageUrl! : imageUrl}
              alt={prompt}
              compareUrl={viewVersion === "compare" && hasEnhanced ? baseImageUrl! : undefined}
            />
            {lastProviderUsed && (
              <ResultRouteRow
                provider={lastProviderUsed}
                model={lastModelUsed}
                route={lastExecutionRoute}
                fallback={lastFallbackUsed}
                routingReason={lastRoutingReason}
                referenceStrength={lastReferenceStrength}
                prompt={prompt}
                styleKey={styleConfig.styleKey}
              />
            )}

            {/* Status badges + export source notice */}
            {(() => {
              const fakeImg = {
                publicUrl: baseImageUrl || imageUrl,
                enhancedUrl: enhancedImageUrl,
                masterUrl: enhancedImageUrl || baseImageUrl || imageUrl,
                enhanced_storage_path: enhancedImageUrl ? "ephemeral" : null,
                upscale_mode: enhancedImageUrl ? upscaleMode : null,
                print_format_id:
                  generationMode === "print-ready" ? selectedPrintFormat.id : null,
              };
              const exportInfo = describeExportSource(fakeImg);
              return (
                <div className="flex flex-col items-center gap-1.5">
                  <AssetStatusBadges
                    image={fakeImg}
                    enhancementStatus={
                      isUpscaling
                        ? upscaleStage === "saving"
                          ? "saving"
                          : "enhancing"
                        : hasEnhanced
                          ? "done"
                          : "idle"
                    }
                  />
                  {generationMode === "print-ready" && (
                    <p
                      className={cn(
                        "font-display text-[11px] flex items-center gap-1",
                        exportInfo.source === "enhanced"
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    >
                      {exportInfo.source === "base" && (
                        <AlertTriangle className="h-3 w-3 text-orange-500" />
                      )}
                      {exportInfo.label}
                    </p>
                  )}
                </div>
              );
            })()}

            <GeneratedImageActions
              imageUrl={imageUrl}
              baseImageUrl={baseImageUrl}
              enhancedImageUrl={enhancedImageUrl}
              hasEnhanced={hasEnhanced}
              viewVersion={viewVersion}
              onChangeViewVersion={setViewVersion}
              mode={mode}
              generationMode={generationMode}
              selectedPrintFormat={selectedPrintFormat}
              printSize={printSize}
              effectiveAspectRatio={effectiveAspectRatio}
              styleConfig={styleConfig}
              isUpscaling={isUpscaling}
              canManualUpscale={canManualUpscale}
              sourceWidth={(enhancedProbedDims ?? baseProbedDims)?.width ?? null}
              sourceHeight={(enhancedProbedDims ?? baseProbedDims)?.height ?? null}
              originalSource={
                liveBaseUrl
                  ? {
                      url: liveBaseUrl,
                      width: baseProbedDims?.width ?? null,
                      height: baseProbedDims?.height ?? null,
                    }
                  : null
              }
              enhancedSource={
                liveEnhancedUrl
                  ? {
                      url: liveEnhancedUrl,
                      width: enhancedProbedDims?.width ?? null,
                      height: enhancedProbedDims?.height ?? null,
                    }
                  : null
              }
              recommendedRecipe={recommendedRecipe}
              onEnhanceConfirm={handleEnhanceConfirm}
              savedToGallery={savedToGallery}
              isEditMode={isEditMode}
              originalImageId={originalImageId}
              saving={saving}
              replacing={replacing}
              exporting={exporting}
              onSaveToGallery={handleSaveToGallery}
              onReplaceOriginal={handleReplaceOriginal}
              onPrintExport={handlePrintExport}
              onStartInlineEdit={handleStartInlineEdit}
              onRemoveImage={handleRemoveImage}
            />

            {imageUrl && savedToGallery && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setMatchingOpen(true)}
                  className="text-xs underline text-muted-foreground hover:text-foreground"
                >
                  Create matching collection from this image →
                </button>
              </div>
            )}

          </div>
        )}

        {!isGenerating && !imageUrl && (
          <p className="font-display text-muted-foreground text-sm">Your artwork will appear here</p>
        )}
      </div>

      {imageUrl && (() => {
        const selectedUrl = enhancedImageUrl || imageUrl;
        const resolved = resolveMatchingCollectionAnchor({
          baseUrl: baseImageUrl || imageUrl,
          baseStoragePath: originalStoragePath ?? null,
          baseWidth: baseProbedDims?.width ?? null,
          baseHeight: baseProbedDims?.height ?? null,
          enhancedUrl: enhancedImageUrl,
          enhancedStoragePath: null,
          enhancedWidth: enhancedProbedDims?.width ?? null,
          enhancedHeight: enhancedProbedDims?.height ?? null,
          durableMasterUrl,
          durableMasterStoragePath,
          durableMasterWidth,
          durableMasterHeight,
          selectedUrl,
        });
        return (
          <MatchingCollectionDialog
            open={matchingOpen}
            onOpenChange={setMatchingOpen}
            anchorImageUrl={resolved?.anchorImageUrl ?? selectedUrl}
            anchorImageId={savedGalleryIdRef.current}
            anchorStoragePath={resolved?.anchorStoragePath ?? null}
            anchor={{
              styleKey: variantStyleKey,
              posterFormatId: selectedPrintFormat.id,
              aspectRatio: effectiveAspectRatio,
              backgroundStyle,
              provider: lastProviderUsed ?? null,
              model: lastModelUsed ?? null,
              referenceStrength: null,
              anchorWidthPx: resolved?.anchorWidthPx ?? null,
              anchorHeightPx: resolved?.anchorHeightPx ?? null,
            }}
          />
        );
      })()}
    </div>
  );
}

// ── Inline result-route + feedback row ────────────────────────────────
interface ResultRouteRowProps {
  provider: string;
  model: string | null;
  route: string | null;
  fallback: boolean;
  routingReason: string | null;
  referenceStrength: ReferenceStrength | null;
  prompt: string;
  styleKey: string;
}

function ResultRouteRow({
  provider, model, route, fallback, routingReason, referenceStrength, prompt, styleKey,
}: ResultRouteRowProps) {
  const { rating, setFeedback } = useImageFeedback({
    prompt, styleKey, provider, route,
  });
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <RouteBadge
        provider={provider}
        model={model}
        route={route}
        fallback={fallback}
        variant="full"
      />
      {routingReason && (
        <span className="font-display text-[10px] text-muted-foreground italic">
          {routingReason}
        </span>
      )}
      {referenceStrength && (
        <span
          className="font-display text-[10px] text-muted-foreground italic"
          title="Reference image strength used for this generation"
        >
          ref: {referenceStrengthLabel(referenceStrength)}
        </span>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setFeedback("up")}
          className={cn(
            "p-1 rounded-sm border transition-colors",
            rating === "up"
              ? "bg-primary/15 border-primary/40 text-primary"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
          title="This result is good"
        >
          <ThumbsUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => setFeedback("down")}
          className={cn(
            "p-1 rounded-sm border transition-colors",
            rating === "down"
              ? "bg-destructive/15 border-destructive/40 text-destructive"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
          title="This result is bad"
        >
          <ThumbsDown className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
