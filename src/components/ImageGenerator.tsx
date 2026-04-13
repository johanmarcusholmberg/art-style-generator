import { useState } from "react";
import { usePersistedGeneration } from "@/hooks/use-persisted-generation";
import { Loader2, Download, Sparkles, Save, Replace, X, Trash2, Pencil, Printer, FileImage, Zap, Crown } from "lucide-react";
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
import { ENHANCEMENT_PRESETS, ENHANCEMENT_MODES, type EnhancementMode, ENHANCEMENT_PROVIDER } from "@/lib/enhancement-config";
import { Progress } from "@/components/ui/progress";

type GenerationMode = "standard" | "print-ready";

type GenerationStage = "idle" | "generating" | "enhancing" | "saving-gallery";

const STAGE_LABELS: Record<GenerationStage, string> = {
  idle: "",
  generating: "Generating artwork…",
  enhancing: "Enhancing quality…",
  "saving-gallery": "Finalizing…",
};

const STAGE_PROGRESS: Record<GenerationStage, number> = {
  idle: 0,
  generating: 35,
  enhancing: 70,
  "saving-gallery": 90,
};

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
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<GenerationStage>("idle");
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [enhancementMode, setEnhancementMode] = useState<EnhancementMode>("hd");
  const [backgroundStyle, setBackgroundStyle] = useState<"white" | "cream">("white");
  const [paperColor, setPaperColor] = useState<"white" | "cream">("white");
  const [viewVersion, setViewVersion] = useState<"enhanced" | "original" | "compare">("enhanced");
  const [printSize, setPrintSize] = useState<PrintSize>(PRINT_SIZES[2]);
  const [qualityTarget, setQualityTarget] = useState<QualityTarget>("print-300");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("standard");
  const [selectedPrintFormat, setSelectedPrintFormat] = useState<PrintFormat>(PRINT_FORMATS[0]);
  const { toast } = useToast();

  const suggestions = isTertiary && styleConfig.prompts.tertiary ? styleConfig.prompts.tertiary : isThemed ? styleConfig.prompts.themed : styleConfig.prompts.freestyle;
  const effectiveAspectRatio = generationMode === "print-ready" ? selectedPrintFormat.aspectRatio : printSize.ratio;
  const preset = ENHANCEMENT_PRESETS[enhancementMode];

  const generate = async () => {
    const activePrompt = isInlineEditing ? editPrompt : prompt;
    if (!activePrompt.trim()) return;
    setLoading(true);
    setStage("generating");
    setViewVersion("enhanced");
    setSavedToGallery(false);

    try {
      const body: any = {
        prompt: activePrompt.trim(),
        aspectRatio: effectiveAspectRatio,
        backgroundStyle,
        // Always request maximum quality — print rules are now always-on in the compiler
        printMode: true,
      };
      if (isInlineEditing && imageUrl) {
        body.sourceImageUrl = imageUrl;
      } else if (sourceImageUrl) {
        body.sourceImageUrl = sourceImageUrl;
      }
      const { data, error } = await supabase.functions.invoke(edgeFn, { body });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      let finalUrl = data.imageUrl;
      setBaseImageUrl(data.imageUrl);

      // Run enhancement if mode requires it
      if (preset.runUpscale) {
        setStage("enhancing");
        try {
          const upscaleBody: Record<string, unknown> = {
            imageUrl: data.imageUrl,
            aspectRatio: effectiveAspectRatio,
            strength: preset.strength,
          };
          // Pass print target resolution for resolution-aware enhancement
          if (generationMode === "print-ready" || enhancementMode === "print-hd") {
            upscaleBody.targetWidthPx = selectedPrintFormat.preferredPixelWidth;
            upscaleBody.targetHeightPx = selectedPrintFormat.preferredPixelHeight;
            upscaleBody.targetPpi = 300;
            upscaleBody.printFormatId = selectedPrintFormat.id;
          }
          const { data: upData, error: upError } = await supabase.functions.invoke(
            ENHANCEMENT_PROVIDER.edgeFunction,
            { body: upscaleBody },
          );
          if (!upError && upData?.imageUrl) {
            finalUrl = upData.imageUrl;
          } else {
            console.warn("Enhancement returned no result, using base image");
          }
        } catch (upErr) {
          console.warn("Enhancement failed, falling back to base image:", upErr);
          toast({
            title: "Enhancement skipped",
            description: "Could not enhance — using the base image instead.",
          });
        }
      }

      setStage("saving-gallery");
      setImageUrl(finalUrl);
      if (isInlineEditing) {
        setPrompt(activePrompt.trim());
        setIsInlineEditing(false);
        setEditPrompt("");
      }
    } catch (err: any) {
      toast({
        title: "Generation failed",
        description: err.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setStage("idle");
    }
  };

  const hasEnhanced = preset.runUpscale && baseImageUrl && imageUrl && baseImageUrl !== imageUrl;

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
      enhanced: preset.runUpscale,
      printFormatId: isPrint ? selectedPrintFormat.id : undefined,
      generationMode: generationMode,
      exportType: isPrint ? selectedPrintFormat.exportType : undefined,
    };
  };

  const handleSaveToGallery = async () => {
    if (!imageUrl || savedToGallery || saving) return;
    setSaving(true);
    try {
      const finalPrompt = isEditMode && initialPrompt
        ? `${initialPrompt} | Edited: ${prompt.trim()}`
        : prompt.trim();

      await saveToGallery({
        imageUrl,
        prompt: finalPrompt,
        ...buildSaveOptions(),
      });
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
        imageUrl,
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
      const result = await preparePrintExport({
        imageUrl,
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

  const isActive = loading || stage !== "idle";

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

        {/* Quality Mode Selector */}
        <div>
          <p className="font-display font-bold text-sm text-foreground mb-2">Image Quality</p>
          <div className="grid grid-cols-3 gap-2">
            {ENHANCEMENT_MODES.map((m) => {
              const p = ENHANCEMENT_PRESETS[m];
              const isSelected = enhancementMode === m;
              return (
                <button
                  key={m}
                  onClick={() => setEnhancementMode(m)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 p-2.5 rounded-sm border font-display transition-colors text-left",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-secondary-foreground border-border hover:bg-muted"
                  )}
                >
                  <span className="flex items-center gap-1 text-xs font-bold">
                    {m === "standard" && <Zap className="h-3 w-3" />}
                    {m === "hd" && <Sparkles className="h-3 w-3" />}
                    {m === "print-hd" && <Crown className="h-3 w-3" />}
                    {p.label}
                  </span>
                  <span className={cn("text-[10px] leading-tight", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {p.description}
                  </span>
                </button>
              );
            })}
          </div>
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
        {isActive && stage !== "idle" && (
          <div className="flex flex-col items-center gap-4 text-muted-foreground w-full max-w-xs px-4">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="font-display text-sm text-center">{STAGE_LABELS[stage]}</p>
            <Progress value={STAGE_PROGRESS[stage]} className="h-1.5 w-full" />
            {stage === "enhancing" && (
              <p className="font-display text-[10px] text-muted-foreground/70">
                {preset.label} enhancement in progress
              </p>
            )}
          </div>
        )}

        {!isActive && imageUrl && (
          <div className="flex flex-col items-center gap-4 p-4 w-full">
            <ImagePreviewMockups
              imageUrl={viewVersion === "original" && hasEnhanced ? baseImageUrl! : imageUrl}
              alt={prompt}
              compareUrl={viewVersion === "compare" && hasEnhanced ? baseImageUrl! : undefined}
            />
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
                        setImageUrl(null);
                        setBaseImageUrl(null);
                        setSavedToGallery(false);
                        setViewVersion("enhanced");
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

        {!isActive && !imageUrl && (
          <p className="font-display text-muted-foreground text-sm">Your artwork will appear here</p>
        )}
      </div>
    </div>
  );
}
