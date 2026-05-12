import { useState, useRef, useMemo } from "react";
import { usePersistedGeneration } from "@/hooks/use-persisted-generation";
import { Loader2, Download, Sparkles, Save, Replace, X, Trash2, Pencil, Printer, FileImage, ArrowUpCircle, ThumbsUp, ThumbsDown, Layers, AlertTriangle, LayoutPanelTop, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import PosterComposer from "@/features/poster-composer/PosterComposer";
import { POSTER_TEMPLATE_LIST, getPosterTemplate } from "@/features/poster-composer/poster-templates";
import type { PosterTemplateId, PosterTextMode } from "@/features/poster-composer/poster-types";
import EnhanceForPrintDialog from "@/components/EnhanceForPrintDialog";
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
import ImagePreviewMockups from "@/components/ImagePreviewMockups";
import type { StyleConfig } from "@/lib/style-config";
import { type QualityTarget, getResolutionForPrintSize, formatResolution } from "@/lib/print-resolution";
import { PRINT_FORMATS, type PrintFormat, formatExportDescription, getPosterPromptHint } from "@/lib/print-formats";
import { preparePrintExport, downloadPrintExport } from "@/lib/print-export";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { useUpscale } from "@/hooks/use-upscale";
import {
  UPSCALE_MODES,
  DEFAULT_UPSCALE_MODE,
  type UpscaleMode,
} from "@/lib/upscale-modes";
import GeneratorBadge from "@/components/GeneratorBadge";
// UpscaleBadge removed from generator — replaced by EnhanceForPrintDialog
// (kept in Gallery for the lightbox).
import {
  type GeneratorPreference,
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

const downloadImage = async (dataUrl: string, filename: string) => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

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

  const persistKey = `${styleConfig.styleKey}-${mode}` as any;

  const {
    prompt, setPrompt,
    imageUrl, setImageUrl,
    baseImageUrl, setBaseImageUrl,
    savedToGallery, setSavedToGallery,
  } = usePersistedGeneration(persistKey, isEditMode ? undefined : initialPrompt);

  const [sourceImageUrl] = useState<string | null>(initialImageUrl || null);
  // Store the enhanced URL separately from the displayed imageUrl
  const [enhancedImageUrl, setEnhancedImageUrl] = useState<string | null>(null);
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
  const [compareOpen, setCompareOpen] = useState(false);
  // Poster Composer integration (additive — does not change the generator).
  // The user can configure template + text BEFORE generation. After the
  // image is produced we auto-open the Poster Composer pre-filled with
  // their inputs so the poster is ready to export immediately.
  //
  // Two text modes drive how we use the user-entered text:
  //   - "composer" (default): text is NOT sent to the generator. We only
  //                            ask the model to leave a clean empty band.
  //   - "generated":          title/subtitle ARE injected into the prompt
  //                            so the model bakes typography into the art.
  const [posterTemplateId, setPosterTemplateId] = useState<PosterTemplateId>("fika");
  const [posterTextMode, setPosterTextMode] = useState<PosterTextMode>("composer");
  // STRICT: safe-area is OFF by default and must be explicitly enabled —
  // never auto-enabled by template selection.
  const [posterSafeAreaEnabled, setPosterSafeAreaEnabled] = useState(false);
  const [composerTitle, setComposerTitle] = useState("");
  const [composerSubtitle, setComposerSubtitle] = useState("");
  const [composerDescription, setComposerDescription] = useState("");
  const [composerIngredientsRaw, setComposerIngredientsRaw] = useState("");
  const [posterOpen, setPosterOpen] = useState(false);
  // Snapshot of poster config used for the most recent generation. We
  // pass this (not the live form values) into PosterComposer so the
  // dialog stays consistent if the user edits inputs after generating.
  const [lastPosterSnapshot, setLastPosterSnapshot] = useState<{
    templateId: PosterTemplateId;
    textMode: PosterTextMode;
    title: string;
    subtitle: string;
    description: string;
    ingredients: string[];
  } | null>(null);
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
        styleKey: styleConfig.styleKey,
        mode,
        generatorFamily: generatorFamilyFromProvider(lastProviderUsed),
        printIntent: generationMode === "print-ready",
      }),
    [styleConfig.styleKey, mode, lastProviderUsed, generationMode],
  );

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
      setEnhancedImageUrl(result.imageUrl);
      setImageUrl(result.imageUrl);
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

  const generate = async () => {
    const activePrompt = isInlineEditing ? editPrompt : prompt;
    if (!activePrompt.trim()) return;
    setLoading(true);
    setViewVersion("enhanced");
    setSavedToGallery(false);
    resetUpscale();
    setEnhancedImageUrl(null);
    savedGalleryIdRef.current = null;
    upscaleRunId.current++;

    try {
      // Phase 2: route through the unified generation router. The Lovable
      // adapter still calls the existing per-style edge function under
      // the hood — current backend behavior (prompt compilation,
      // SDXL/Gemini resolver, fallback) is unchanged.
      const referenceImageUrl =
        isInlineEditing && imageUrl ? imageUrl : sourceImageUrl || undefined;

      const { generateImage } = await import("@/lib/generation-router");
      // Resolve effective strictness from the Style Control Panel.
      // For "auto" we use the sdxl entry because the router's auto chain
      // tries SDXL first; manual selections use their own provider entry.
      const strictnessProvider: StrictnessProviderId =
        generatorPref === "auto" ? "sdxl" : (generatorPref as StrictnessProviderId);
      const effectiveStrictness = getDefaultStrictness({
        styleKey: styleConfig.styleKey,
        provider: strictnessProvider,
      });
      // Optional poster-composer hint — additive only. Appended to the
      // user prompt so the existing prompt compiler is untouched.
      //
      // STRICT rules (must match Poster Composer behaviour):
      //   - composer mode: only emit a "leave clean empty space" hint when
      //     the user has BOTH enabled the safe area AND entered some text.
      //     Composer text fields are NEVER sent to the generator.
      //   - generated mode: only emit "include this text" when the user
      //     typed a title/subtitle. Safe area is irrelevant here.
      //   - otherwise: no hint, no layout reservation, full artwork.
      const ingredientsList = composerIngredientsRaw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const hasComposerText =
        !!composerTitle.trim() ||
        !!composerSubtitle.trim() ||
        !!composerDescription.trim() ||
        ingredientsList.length > 0;
      const shouldReserveTextArea =
        posterTextMode === "composer" &&
        posterSafeAreaEnabled &&
        hasComposerText;
      let posterHint = "";
      if (shouldReserveTextArea) {
        posterHint =
          "Leave clean empty space at the bottom of the image for later text layout, with minimal details in that area.";
      } else if (posterTextMode === "generated" && hasComposerText) {
        const parts: string[] = [];
        if (composerTitle.trim()) parts.push(`title "${composerTitle.trim()}"`);
        if (composerSubtitle.trim()) parts.push(`subtitle "${composerSubtitle.trim()}"`);
        if (parts.length > 0) {
          posterHint = `Include the following text inside the image as integrated typography: ${parts.join(", ")}.`;
        }
      }
      const promptForGen = posterHint
        ? `${activePrompt.trim()} ${posterHint}`
        : activePrompt.trim();
      const { response: gen, diagnostics } = await generateImage({
        prompt: promptForGen,
        styleKey: styleConfig.styleKey,
        aspectRatio: effectiveAspectRatio,
        backgroundStyle,
        printMode: true,
        providerPreference: generatorPref,
        referenceImageUrl,
        isEdit: !!referenceImageUrl,
        strictness: effectiveStrictness,
        posterFormatId: selectedPrintFormat.id,
        posterFormatHint: getPosterPromptHint(selectedPrintFormat.id),
        targetAspectRatio: selectedPrintFormat.aspectRatioDecimal,
      });

      const baseUrl = gen.imageUrl;
      setBaseImageUrl(baseUrl);
      setImageUrl(baseUrl);

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

      // Phase 2 — capture v2 route metadata when present (lovable adapter
      // exposes it via `metadata`). Falls back to nulls when the legacy
      // edge function path was used so we never invent values.
      const routeMeta = (gen.metadata || {}) as Record<string, unknown>;
      setLastRouteProvider(
        typeof routeMeta.adapter === "string" ? (routeMeta.adapter as string) : "lovable",
      );
      setLastRouteModel(gen.generationModel || null);
      setLastRouteLabel(typeof routeMeta.route === "string" ? (routeMeta.route as string) : null);
      setLastEstimatedCost(
        typeof routeMeta.estimatedCost === "number"
          ? (routeMeta.estimatedCost as number)
          : null,
      );
      setLastCurrency(
        typeof routeMeta.currency === "string" ? (routeMeta.currency as string) : "USD",
      );
      setLastPromptVersion(
        typeof routeMeta.promptVersion === "string"
          ? (routeMeta.promptVersion as string)
          : null,
      );

      console.log(
        `[ImageGenerator] generated provider=${gen.generationProvider} model=${gen.generationModel} ` +
          `route=${gen.executionRoute} strategy=${gen.strategy} fallback=${gen.fallbackUsed} ` +
          `reason="${gen.routingReason ?? ""}" adapters=${diagnostics.attemptedAdapters.map((a) => a.id).join(",")}`,
      );
      if (diagnostics.fallbackTriggered) {
        toast({
          title: "Used fallback adapter",
          description: `Primary adapter failed — image was created via ${gen.generationProvider}.`,
        });
      } else if (gen.fallbackUsed) {
        toast({
          title: "Used fallback generator",
          description: `Primary generator failed — image was created with ${gen.generationProvider}.`,
        });
      }

      if (isInlineEditing) {
        setPrompt(activePrompt.trim());
        setIsInlineEditing(false);
        setEditPrompt("");
      }

      // Snapshot poster config used for this generation. We auto-open the
      // Poster Composer when:
      //   - composer mode is active (poster-friendly band was reserved)
      //   - OR the user typed any text in either mode
      // This gives the user a ready-to-export poster immediately.
      const snapshot = {
        templateId: posterTemplateId,
        textMode: posterTextMode,
        title: composerTitle.trim(),
        subtitle: composerSubtitle.trim(),
        description: composerDescription.trim(),
        ingredients: ingredientsList,
      };
      setLastPosterSnapshot(snapshot);
      const shouldAutoOpen =
        !isInlineEditing &&
        (posterTextMode === "composer" || hasComposerText);
      if (shouldAutoOpen) {
        setPosterOpen(true);
      }

      setLoading(false);

      // COST-CONTROL RULE: do NOT auto-upscale.
      // Enhancement is always user-triggered via the "Enhance for print"
      // dialog so the user explicitly approves the cost.
    } catch (err: any) {
      const desc = err?.message || "Something went wrong";
      // If user manually picked a provider that failed, surface the explicit message
      toast({
        title: "Generation failed",
        description: desc,
        variant: "destructive",
      });
      setLoading(false);
    }
  };

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
      const result = await saveToGallery({
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
      });
      // Note: result is the master public URL
      setSavedToGallery(true);
      onImageSaved?.();
      // Best-effort cost-event log; never blocks save UX.
      try {
        const { data } = await supabase
          .from("generated_images")
          .select("id")
          .order("created_at", { ascending: false })
          .limit(1);
        const newId = (data?.[0] as { id?: string } | undefined)?.id;
        if (newId) {
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
            },
          });
        }
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

      const result = await preparePrintExport({
        imageUrl: exportSource,
        printFormatId: selectedPrintFormat.id,
        padColor: paperColor === "cream" ? "#f5f0e8" : "#ffffff",
      });

      const { summary } = formatExportDescription(
        result.tier, result.upscaleApplied, result.upscaleFactor, result.width, result.height,
      );

      const exportFilename = `print-${selectedPrintFormat.id}-${Date.now()}.png`;
      const { error: uploadErr } = await supabase.storage
        .from("print-exports")
        .upload(exportFilename, result.blob, { contentType: "image/png" });

      if (uploadErr) console.warn("Print export upload skipped:", uploadErr);

      downloadPrintExport(
        result.blob,
        `${styleConfig.downloadPrefix}-${mode}-print-${selectedPrintFormat.id}-${Date.now()}.png`,
      );

      toast({ title: "Print export ready", description: summary });
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
                </>
              )}
            </>
          );
        })()}

        {/* Cost-control note: enhancement is never automatic. The
            "Enhance for print" button appears next to the generated image
            once it's available (see action row below). */}

        {/* ── Generation Mode (simplified) ───────────────────────────── */}
        <div className="flex items-center gap-2">
          <span className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">Mode:</span>
          <div className="inline-flex items-center gap-1 border border-border rounded-sm p-0.5 bg-card/40">
            <button
              onClick={() => setGenerationMode("standard")}
              className={cn(
                "font-display text-xs px-2.5 py-1 rounded-sm transition-colors",
                generationMode === "standard"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Standard
            </button>
            <button
              onClick={() => setGenerationMode("print-ready")}
              className={cn(
                "font-display text-xs px-2.5 py-1 rounded-sm transition-colors inline-flex items-center gap-1",
                generationMode === "print-ready"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Printer className="h-3 w-3" />
              Print-Ready
            </button>
          </div>
        </div>

        {/* ── Poster card — single source of truth for size ──────────── */}
        <div className="rounded-md border border-border bg-card/60 p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-base font-bold text-foreground">Poster</h3>
            <span className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">
              Size & format
            </span>
          </div>
          <div>
            <p className="font-display text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Poster size
            </p>
            <div className="flex flex-wrap gap-2">
              {PRINT_FORMATS.map((fmt) => {
                const isSelected = selectedPrintFormat.id === fmt.id;
                const isRecommended = fmt.id === "print_50x70";
                return (
                  <button
                    key={fmt.id}
                    onClick={() => setSelectedPrintFormat(fmt)}
                    className={cn(
                      "font-display text-xs px-3 py-1.5 rounded-sm border transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary font-bold"
                        : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {fmt.label}
                    {isRecommended && (
                      <span className={cn("ml-1.5 text-[10px]", isSelected ? "opacity-90" : "text-primary")}>
                        ★ Recommended
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="font-display text-xs text-muted-foreground mt-2">
              {selectedPrintFormat.label} · {selectedPrintFormat.aspectRatio} · Print-ready format
            </p>
          </div>

          <details className="group">
            <summary className="cursor-pointer select-none font-display text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              Print details
            </summary>
            <div className="mt-2 pt-2 border-t border-border/60 font-display text-[11px] text-muted-foreground space-y-0.5">
              <p>
                Aspect ratio: <span className="text-foreground font-bold">{selectedPrintFormat.aspectRatio}</span>
              </p>
              <p>
                300 DPI export:{" "}
                <span className="text-foreground font-bold">
                  {formatResolution(selectedPrintFormat.preferredPixelWidth, selectedPrintFormat.preferredPixelHeight)}
                </span>
              </p>
              <p className="text-[10px]">
                Drives composition for every provider, the preview canvas, the poster composer, and the print export.
              </p>
            </div>
          </details>
        </div>

        {/* ── Output card — quality ──────────────────────────────────── */}
        <div className="rounded-md border border-border bg-card/60 p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-base font-bold text-foreground">Output</h3>
            <span className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">
              Quality
            </span>
          </div>
          <div>
            <div className="flex flex-wrap gap-2">
              {([
                { id: "web", label: "Web", desc: "Small file for preview and sharing" },
                { id: "print-150", label: "Print Standard", desc: "Good for smaller prints" },
                { id: "print-300", label: "Print Premium", desc: "Best for selling prints · 300 DPI" },
              ] as const).map((opt) => {
                const isSelected = qualityTarget === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setQualityTarget(opt.id)}
                    className={cn(
                      "font-display text-xs px-3 py-1.5 rounded-sm border transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary font-bold"
                        : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="font-display text-xs text-muted-foreground mt-2">
              {qualityTarget === "web" && "Small file for preview and sharing"}
              {qualityTarget === "print-150" && "Good for smaller prints"}
              {qualityTarget === "print-300" && "Best for selling prints · 300 DPI"}
            </p>
          </div>
        </div>

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
        </div>

        {/* ── Poster setup (optional, secondary) ─────────────────────── */}
        <details className="group">
          <summary className="cursor-pointer select-none px-1 py-1 flex items-center gap-2 font-display text-xs">
            <LayoutPanelTop className="h-3.5 w-3.5 text-primary" />
            <span className="font-bold text-foreground">Poster setup</span>
            <span className="text-muted-foreground">(optional)</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {posterTextMode === "composer" ? "Clean text" : "Artistic text"}
              {" · "}
              {getPosterTemplate(posterTemplateId).name}
            </span>
          </summary>
          <div className="px-1 pt-2 pb-1 space-y-3">
            <div className="space-y-1">
              <Label className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">
                Template
              </Label>
              <select
                value={posterTemplateId}
                onChange={(e) => setPosterTemplateId(e.target.value as PosterTemplateId)}
                className="w-full bg-background border border-border rounded-sm px-2 py-1.5 font-display text-xs"
              >
                {POSTER_TEMPLATE_LIST.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.description}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">
                Text handling
              </Label>
              <div className="space-y-1">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="poster-text-mode"
                    checked={posterTextMode === "composer"}
                    onChange={() => setPosterTextMode("composer")}
                    className="mt-0.5"
                  />
                  <span className="flex flex-col">
                    <span className="font-display text-xs text-foreground">Clean text (Poster Composer)</span>
                    <span className="font-display text-[10px] text-muted-foreground">
                      Recommended for Etsy / print. Text is added on export — image is generated text-free.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="poster-text-mode"
                    checked={posterTextMode === "generated"}
                    onChange={() => setPosterTextMode("generated")}
                    className="mt-0.5"
                  />
                  <span className="flex flex-col">
                    <span className="font-display text-xs text-foreground">Artistic text (generated in image)</span>
                    <span className="font-display text-[10px] text-muted-foreground">
                      Title / subtitle are sent to the generator and become part of the artwork.
                    </span>
                  </span>
                </label>
              </div>
            </div>
            {posterTextMode === "composer" && (
              <div className="flex items-start gap-2 rounded-sm border border-border bg-card/40 px-2 py-1.5">
                <Switch
                  checked={posterSafeAreaEnabled}
                  onCheckedChange={setPosterSafeAreaEnabled}
                />
                <div className="flex flex-col">
                  <span className="font-display text-xs text-foreground">
                    Safe text area
                  </span>
                  <span className="font-display text-[10px] text-muted-foreground">
                    {posterSafeAreaEnabled
                      ? (composerTitle || composerSubtitle || composerDescription || composerIngredientsRaw
                          ? "Works with any art style — generator will leave a clean empty band for your typography."
                          : "Enabled, but no poster text yet — generation is unaffected until text is added.")
                      : "Off — image uses the full canvas. Toggle on (any style) to reserve a band for typography."}
                  </span>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">
                Poster text
              </Label>
              <input
                type="text"
                value={composerTitle}
                onChange={(e) => setComposerTitle(e.target.value)}
                placeholder="Title"
                className="w-full bg-background border border-border rounded-sm px-2 py-1.5 font-display text-xs"
              />
              <input
                type="text"
                value={composerSubtitle}
                onChange={(e) => setComposerSubtitle(e.target.value)}
                placeholder="Subtitle"
                className="w-full bg-background border border-border rounded-sm px-2 py-1.5 font-display text-xs"
              />
              <Textarea
                value={composerDescription}
                onChange={(e) => setComposerDescription(e.target.value)}
                placeholder="Description"
                rows={2}
                className="font-display text-xs min-h-[60px]"
              />
              <Textarea
                value={composerIngredientsRaw}
                onChange={(e) => setComposerIngredientsRaw(e.target.value)}
                placeholder="Ingredients (one per line)"
                rows={2}
                className="font-display text-xs min-h-[60px]"
              />
              {posterTextMode === "composer" && (composerTitle || composerSubtitle || composerDescription || composerIngredientsRaw) && (
                <p className="font-display text-[10px] text-muted-foreground flex items-start gap-1">
                  <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  Text will be added as a clean overlay — not generated inside the image.
                </p>
              )}
              {posterTextMode === "generated" && (composerTitle || composerSubtitle) && (
                <p className="font-display text-[10px] text-muted-foreground flex items-start gap-1">
                  <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  Text will be generated inside the image. Overlay text will not be applied.
                </p>
              )}
            </div>
          </div>
        </details>

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
                        ? "Provider used an approximate ratio — export pipeline will crop to exact poster size."
                        : "Provider matched the poster aspect ratio exactly."
                    }
                  >
                    {lastRequestedSize}
                    <span
                      className={
                        lastProviderExactMatch === false
                          ? "text-amber-500"
                          : "text-emerald-500"
                      }
                    >
                      ·{" "}
                      {lastProviderExactMatch === false
                        ? "Approximate (corrected on export)"
                        : "Exact print ratio"}
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
            <div className="flex items-center gap-2 flex-wrap">
              <GeneratorBadge
                value={generatorPref}
                onChange={setGeneratorPref}
                lastUsedProvider={lastProviderUsed}
                lastFallbackUsed={lastFallbackUsed}
              />
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border border-border bg-muted/40 text-[10px] font-display text-muted-foreground"
                title="Configure per-style defaults at /style-control-panel"
              >
                Strictness: {getDefaultStrictness({
                  styleKey: styleConfig.styleKey,
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
              styleKey: styleConfig.styleKey,
              aspectRatio: effectiveAspectRatio,
              backgroundStyle,
              printMode: true,
              referenceImageUrl:
                isInlineEditing && imageUrl
                  ? imageUrl
                  : sourceImageUrl || undefined,
              isEdit: !!(isInlineEditing && imageUrl) || !!sourceImageUrl,
            }}
            adapters={[
              { id: "replicate", label: "SDXL (direct Replicate)" },
              { id: "gemini", label: "Gemini (direct)" },
              { id: "openai", label: "OpenAI gpt-image-1 (direct)" },
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
            onClose={() => setCompareOpen(false)}
          />
        )}

        <Button
          onClick={generate}
          disabled={loading || (!isInlineEditing && !prompt.trim()) || (isInlineEditing && !editPrompt.trim())}
          className="w-full font-display text-sm tracking-wider h-11"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isInlineEditing || isEditMode ? "Editing…" : "Painting…"}
            </>
          ) : (
            isInlineEditing || isEditMode ? "Apply Changes" : (generateLabel || "Generate poster")
          )}
        </Button>
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

            <div className="flex flex-wrap gap-2 items-center justify-center">
              {hasEnhanced && (
                <div className="flex items-center gap-1 border border-border rounded-sm p-0.5">
                  {(["enhanced", "original", "compare"] as const).map((v) => (
                    <Button key={v} variant={viewVersion === v ? "default" : "ghost"} size="sm"
                      onClick={() => setViewVersion(v)} className="font-display text-xs h-7 px-2">
                      {v === "enhanced" ? "Enhanced" : v === "original" ? "Original" : "Compare"}
                    </Button>
                  ))}
                </div>
              )}
              <DownloadButton
                url={viewVersion === "original" && hasEnhanced ? baseImageUrl! : imageUrl}
                filename={`${styleConfig.downloadPrefix}-${mode}-${effectiveAspectRatio.replace(":", "x")}-${Date.now()}.png`}
                versionLabel={hasEnhanced ? (viewVersion === "original" ? "Original" : "Enhanced") : undefined}
                sizeLabel={generationMode === "print-ready" ? selectedPrintFormat.label : printSize.dimensions}
              />

              {generationMode === "print-ready" && (
                <Button variant="outline" size="sm" onClick={handlePrintExport} disabled={exporting}
                  className="font-display text-xs tracking-wider border-primary/30 text-primary hover:bg-primary/10">
                  {exporting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing…</>
                  ) : (
                    <><FileImage className="mr-2 h-4 w-4" /> Export Print ({selectedPrintFormat.label})</>
                  )}
                </Button>
              )}
              {/* Enhance for print — explicit, user-triggered, with cost confirmation.
                  Replaces the old auto-upscale + manual UpscaleBadge flow.
                  When an enhanced master exists, the dialog title becomes "Re-enhance"
                  so re-spending budget is always opt-in. */}
              {canManualUpscale && (
                <EnhanceForPrintDialog
                  hasEnhanced={!!hasEnhanced}
                  recommendedRecipe={recommendedRecipe}
                  disabled={isUpscaling}
                  onConfirm={(m, recipe) =>
                    runUpscale(m, savedGalleryIdRef.current, recipe ?? null)
                  }
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isUpscaling}
                      className={cn(
                        "font-display text-xs tracking-wider",
                        hasEnhanced
                          ? "border-border"
                          : "border-primary/40 text-primary hover:bg-primary/10",
                      )}
                    >
                      {isUpscaling ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowUpCircle className="mr-2 h-4 w-4" />
                      )}
                      {hasEnhanced ? "Re-enhance" : "Enhance for print"}
                    </Button>
                  }
                />
              )}
              {!savedToGallery && isEditMode && originalImageId && (
                <Button variant="outline" size="sm" onClick={handleReplaceOriginal} disabled={replacing || saving}
                  className="font-display text-xs tracking-wider">
                  {replacing ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Replacing…</>
                  ) : (
                    <><Replace className="mr-2 h-4 w-4" /> Replace Original</>
                  )}
                </Button>
              )}
              {!savedToGallery && (
                <Button variant="outline" size="sm" onClick={handleSaveToGallery} disabled={saving || replacing}
                  className="font-display text-xs tracking-wider">
                  {saving ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
                  ) : (
                    <><Save className="mr-2 h-4 w-4" /> {isEditMode ? "Save as New" : "Save to Gallery"}</>
                  )}
                </Button>
              )}
              <Button variant="outline" size="sm"
                onClick={() => { setIsInlineEditing(true); setEditPrompt(""); }}
                className="font-display text-xs tracking-wider">
                <Pencil className="mr-2 h-4 w-4" /> Edit Image
              </Button>
              {/* Create Poster — opens an additive composer dialog. */}
              <Dialog open={posterOpen} onOpenChange={setPosterOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="font-display text-xs tracking-wider border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <LayoutPanelTop className="mr-2 h-4 w-4" /> Create Poster
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="font-display">Poster Composer</DialogTitle>
                  </DialogHeader>
                  <PosterComposer
                    imageUrl={
                      hasEnhanced && enhancedImageUrl
                        ? enhancedImageUrl
                        : imageUrl ?? ""
                    }
                    filenameBase={`${styleConfig.downloadPrefix}-${mode}`}
                    printFormatId={selectedPrintFormat.id}
                    initialTemplateId={lastPosterSnapshot?.templateId ?? posterTemplateId}
                    initialTextMode={lastPosterSnapshot?.textMode ?? posterTextMode}
                    initialText={
                      lastPosterSnapshot
                        ? {
                            title: lastPosterSnapshot.title || undefined,
                            subtitle: lastPosterSnapshot.subtitle || undefined,
                            description: lastPosterSnapshot.description || undefined,
                            ingredients:
                              lastPosterSnapshot.ingredients.length > 0
                                ? lastPosterSnapshot.ingredients
                                : undefined,
                          }
                        : {
                            title: composerTitle || undefined,
                            subtitle: composerSubtitle || undefined,
                            description: composerDescription || undefined,
                          }
                    }
                    onRegenerate={async () => {
                      await generate();
                    }}
                    isRegenerating={loading}
                  />
                </DialogContent>
              </Dialog>
              {savedToGallery && (
                <span className="text-xs text-primary flex items-center gap-1 font-display">✓ Saved to gallery</span>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm"
                    className="font-display text-xs tracking-wider text-destructive hover:text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" /> Remove
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-display">Remove generated image?</AlertDialogTitle>
                    <AlertDialogDescription className="font-display">
                      This will discard the generated image. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="font-display">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="font-display bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => {
                        upscaleRunId.current++;
                        resetUpscale();
                        setImageUrl(null);
                        setBaseImageUrl(null);
                        setSavedToGallery(false);
                        setViewVersion("enhanced");
                        setEnhancedImageUrl(null);
                      }}
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}

        {!isGenerating && !imageUrl && (
          <p className="font-display text-muted-foreground text-sm">Your artwork will appear here</p>
        )}
      </div>
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
  prompt: string;
  styleKey: string;
}

function ResultRouteRow({
  provider, model, route, fallback, routingReason, prompt, styleKey,
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
