import { useState, useRef, useMemo } from "react";
import { usePersistedGeneration } from "@/hooks/use-persisted-generation";
import { Loader2, Download, Sparkles, Save, Replace, X, Trash2, Pencil, Printer, FileImage, ArrowUpCircle, ThumbsUp, ThumbsDown, Layers } from "lucide-react";
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
import ImagePreviewMockups from "@/components/ImagePreviewMockups";
import type { StyleConfig } from "@/lib/style-config";
import { type QualityTarget, getResolutionForPrintSize, formatResolution } from "@/lib/print-resolution";
import { PRINT_FORMATS, type PrintFormat, formatExportDescription } from "@/lib/print-formats";
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
import UpscaleBadge from "@/components/UpscaleBadge";
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
  const [generationMode, setGenerationMode] = useState<"standard" | "print-ready">("standard");
  const [selectedPrintFormat, setSelectedPrintFormat] = useState<PrintFormat>(PRINT_FORMATS[0]);
  // Phase 1: generator provider preference (auto/sdxl/gemini), persisted in sessionStorage
  const [generatorPref, setGeneratorPref] = useState<GeneratorPreference>(() => loadGeneratorPreference());
  const [lastProviderUsed, setLastProviderUsed] = useState<string | null>(null);
  const [lastModelUsed, setLastModelUsed] = useState<string | null>(null);
  const [lastFallbackUsed, setLastFallbackUsed] = useState<boolean>(false);
  const [lastStrategyUsed, setLastStrategyUsed] = useState<"auto" | "manual" | null>(null);
  const [lastExecutionRoute, setLastExecutionRoute] = useState<string | null>(null);
  const [lastRoutingReason, setLastRoutingReason] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
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
  const effectiveAspectRatio = generationMode === "print-ready" ? selectedPrintFormat.aspectRatio : printSize.ratio;
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
      const { response: gen, diagnostics } = await generateImage({
        prompt: activePrompt.trim(),
        styleKey: styleConfig.styleKey,
        aspectRatio: effectiveAspectRatio,
        backgroundStyle,
        printMode: true,
        providerPreference: generatorPref,
        referenceImageUrl,
        isEdit: !!referenceImageUrl,
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

      setLoading(false);

      // Auto-upscale if a real mode is selected
      if (upscaleMode !== "none") {
        runUpscale(upscaleMode, savedGalleryIdRef.current);
      }
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
    };
  };

  const handleSaveToGallery = async () => {
    if (!imageUrl || savedToGallery || saving) return;
    setSaving(true);
    try {
      const finalPrompt = isEditMode && initialPrompt
        ? `${initialPrompt} | Edited: ${prompt.trim()}`
        : prompt.trim();

      // Always save using baseImageUrl as the primary source
      const saveOpts = buildSaveOptions();
      const result = await saveToGallery({
        imageUrl: baseImageUrl || imageUrl,
        prompt: finalPrompt,
        ...saveOpts,
      });
      // Note: result is the master public URL
      setSavedToGallery(true);
      onImageSaved?.();
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

      await replaceInGallery({
        originalId: originalImageId,
        originalStoragePath,
        imageUrl: baseImageUrl || imageUrl,
        prompt: finalPrompt,
        ...buildSaveOptions(),
      });
      setSavedToGallery(true);
      onImageSaved?.();
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

        {/* Upscale Mode — unified badge (Phase 2). Replaces old chip selector
            AND the manual upscale button row below. Same component is reused
            on the Gallery lightbox. */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <UpscaleBadge
            value={upscaleMode}
            onChange={setUpscaleMode}
            surface="automatic"
            isRunning={isUpscaling}
            stageLabel={upscaleStageLabel}
            progress={upscaleProgress}
            jobStatus={upscaleJobStatus}
            appliedMode={hasEnhanced ? upscaleMode : null}
            disabled={loading}
            recommendedRecipe={recommendedRecipe}
          />
          <span className="font-display text-[10px] text-muted-foreground">
            {upscaleConfig.intendedUse}
          </span>
        </div>

        {/* Generation Mode Toggle */}
        <div>
          <p className="font-display font-bold text-sm text-foreground mb-2">Generation Mode</p>
          <div className="flex gap-2">
            <button
              onClick={() => setGenerationMode("standard")}
              className={cn(
                "text-xs px-3 py-1.5 rounded-sm border font-display transition-colors",
                generationMode === "standard"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-secondary-foreground border-border hover:bg-muted"
              )}
            >
              Standard
            </button>
            <button
              onClick={() => setGenerationMode("print-ready")}
              className={cn(
                "text-xs px-3 py-1.5 rounded-sm border font-display transition-colors flex items-center gap-1",
                generationMode === "print-ready"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-secondary-foreground border-border hover:bg-muted"
              )}
            >
              <Printer className="h-3 w-3" />
              Print-Ready
            </button>
          </div>
        </div>

        {/* Print Format Selector */}
        {generationMode === "print-ready" && (
          <div className="rounded-sm border border-primary/20 bg-primary/5 p-3 space-y-2">
            <p className="font-display font-bold text-sm text-foreground">Print Format</p>
            <div className="flex flex-wrap gap-2">
              {PRINT_FORMATS.map((fmt) => (
                <button
                  key={fmt.id}
                  onClick={() => setSelectedPrintFormat(fmt)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-sm border font-display transition-colors",
                    selectedPrintFormat.id === fmt.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-secondary-foreground border-border hover:bg-muted"
                  )}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
            <div className="text-xs text-muted-foreground font-display space-y-0.5">
              <p>
                Aspect ratio: <span className="font-bold text-foreground">{selectedPrintFormat.aspectRatio}</span>
                {" · "}
                Target: <span className="font-bold text-foreground">{formatResolution(selectedPrintFormat.preferredPixelWidth, selectedPrintFormat.preferredPixelHeight)}</span>
              </p>
            </div>
          </div>
        )}

        {/* Standard mode selectors */}
        {generationMode === "standard" && (
          <PrintSizeSelector selected={printSize} onChange={setPrintSize} qualityTarget={qualityTarget} onQualityChange={setQualityTarget} />
        )}

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="font-display text-sm text-muted-foreground">Artwork BG:</Label>
            <div className="flex items-center gap-1 border border-border rounded-sm p-0.5">
              <button onClick={() => setBackgroundStyle("white")}
                className={`font-display text-xs px-2.5 py-1 rounded-sm transition-colors ${backgroundStyle === "white" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                White
              </button>
              <button onClick={() => setBackgroundStyle("cream")}
                className={`font-display text-xs px-2.5 py-1 rounded-sm transition-colors ${backgroundStyle === "cream" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                Cream
              </button>
            </div>
          </div>

          {generationMode === "print-ready" && (
            <div className="flex items-center gap-2">
              <Label className="font-display text-sm text-muted-foreground">Paper:</Label>
              <div className="flex items-center gap-1 border border-border rounded-sm p-0.5">
                <button onClick={() => setPaperColor("white")}
                  className={`font-display text-xs px-2.5 py-1 rounded-sm transition-colors ${paperColor === "white" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  Pure White
                </button>
                <button onClick={() => setPaperColor("cream")}
                  className={`font-display text-xs px-2.5 py-1 rounded-sm transition-colors ${paperColor === "cream" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  Cream
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Generator selector + comparison toggle */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <GeneratorBadge
              value={generatorPref}
              onChange={setGeneratorPref}
              lastUsedProvider={lastProviderUsed}
              lastFallbackUsed={lastFallbackUsed}
            />
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
          {lastProviderUsed && (
            <RouteBadge
              provider={lastProviderUsed}
              model={lastModelUsed}
              route={lastExecutionRoute}
              fallback={lastFallbackUsed}
              variant="full"
            />
          )}
        </div>

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
              { id: "lovable", label: "SDXL (via Lovable)" },
              { id: "gemini", label: "Gemini (direct)" },
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
          className="w-full sm:w-auto font-display text-sm tracking-wider"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isInlineEditing || isEditMode ? "Editing…" : "Painting…"}
            </>
          ) : (
            isInlineEditing || isEditMode ? "Apply Changes" : generateLabel
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
              <Button variant="outline" size="sm"
                onClick={() => downloadImage(
                  viewVersion === "original" && hasEnhanced ? baseImageUrl! : imageUrl,
                  `${styleConfig.downloadPrefix}-${mode}-${effectiveAspectRatio.replace(":", "x")}-${Date.now()}.png`
                )}
                className="font-display text-xs tracking-wider">
                <Download className="mr-2 h-4 w-4" />
                Download{hasEnhanced ? (viewVersion === "original" ? " (Original)" : " (Enhanced)") : ""}{" "}
                ({generationMode === "print-ready" ? selectedPrintFormat.label : printSize.dimensions})
              </Button>
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
              {/* Manual Upscale — unified UpscaleBadge. Picking a mode here
                  immediately re-runs the upscale on the original/base image. */}
              {canManualUpscale && (
                <UpscaleBadge
                  value={upscaleMode}
                  onChange={setUpscaleMode}
                  surface="manual"
                  onRun={(m, recipe) =>
                    runUpscale(m, savedGalleryIdRef.current, recipe ?? null)
                  }
                  isRunning={isUpscaling}
                  stageLabel={upscaleStageLabel}
                  progress={upscaleProgress}
                  jobStatus={upscaleJobStatus}
                  appliedMode={hasEnhanced ? upscaleMode : null}
                  recommendedRecipe={recommendedRecipe}
                  compact
                />
              )}
              {hasEnhanced && (
                <span className="text-xs text-primary flex items-center gap-1 font-display">
                  <Sparkles className="h-3 w-3" /> Upscaled
                </span>
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
