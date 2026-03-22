import { useState } from "react";
import { usePersistedGeneration } from "@/hooks/use-persisted-generation";
import { Loader2, Download, Sparkles, Save, Replace, X, Trash2, Pencil, Printer } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import PrintSizeSelector, { PRINT_SIZES, type PrintSize } from "@/components/PrintSizeSelector";
import { saveToGallery, replaceInGallery } from "@/lib/gallery";
import ImagePreviewMockups from "@/components/ImagePreviewMockups";
import type { StyleConfig } from "@/lib/style-config";
import { type QualityTarget, getResolutionForPrintSize, formatResolution } from "@/lib/print-resolution";
import { PRINT_FORMATS, type PrintFormat } from "@/lib/print-formats";
import { cn } from "@/lib/utils";

type GenerationMode = "standard" | "print-ready";

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
  const [enhancing, setEnhancing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [hdEnhance, setHdEnhance] = useState(true);
  const [backgroundStyle, setBackgroundStyle] = useState<"white" | "cream">("white");
  const [viewVersion, setViewVersion] = useState<"enhanced" | "original" | "compare">("enhanced");
  const [printSize, setPrintSize] = useState<PrintSize>(PRINT_SIZES[2]);
  const [qualityTarget, setQualityTarget] = useState<QualityTarget>("print-300");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("standard");
  const [selectedPrintFormat, setSelectedPrintFormat] = useState<PrintFormat>(PRINT_FORMATS[0]);
  const { toast } = useToast();

  const suggestions = isTertiary && styleConfig.prompts.tertiary ? styleConfig.prompts.tertiary : isThemed ? styleConfig.prompts.themed : styleConfig.prompts.freestyle;

  // Derive the effective aspect ratio — print-ready overrides with print format ratio
  const effectiveAspectRatio = generationMode === "print-ready" ? selectedPrintFormat.aspectRatio : printSize.ratio;

  const generate = async () => {
    const activePrompt = isInlineEditing ? editPrompt : prompt;
    if (!activePrompt.trim()) return;
    setLoading(true);
    setViewVersion("enhanced");
    setSavedToGallery(false);

    try {
      const body: any = {
        prompt: activePrompt.trim(),
        aspectRatio: effectiveAspectRatio,
        backgroundStyle,
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

      if (hdEnhance) {
        setEnhancing(true);
        try {
          const { data: upData, error: upError } = await supabase.functions.invoke("upscale-image", {
            body: { imageUrl: data.imageUrl, aspectRatio: effectiveAspectRatio },
          });
          if (!upError && upData?.imageUrl) {
            finalUrl = upData.imageUrl;
          }
        } catch (upErr) {
          console.warn("Upscale pass skipped:", upErr);
        } finally {
          setEnhancing(false);
        }
      }

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
    }
  };

  const hasEnhanced = hdEnhance && baseImageUrl && imageUrl && baseImageUrl !== imageUrl;

  /** Build shared save options including print-ready metadata when applicable */
  const buildSaveOptions = () => {
    const isPrint = generationMode === "print-ready";
    const resolution = isPrint
      ? null // we use print format data directly
      : getResolutionForPrintSize(printSize.dimensions, qualityTarget);

    return {
      mode,
      aspectRatio: effectiveAspectRatio,
      printSize: isPrint ? selectedPrintFormat.label : printSize.dimensions,
      qualityMode: qualityTarget,
      targetPpi: isPrint ? 300 : resolution?.ppi,
      targetWidthPx: isPrint ? selectedPrintFormat.preferredPixelWidth : resolution?.widthPx,
      targetHeightPx: isPrint ? selectedPrintFormat.preferredPixelHeight : resolution?.heightPx,
      enhanced: hdEnhance,
      // Phase 1 print format fields
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
              <Button
                variant="ghost"
                size="sm"
                onClick={onExitEdit}
                className="font-display text-xs flex-shrink-0"
              >
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
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsInlineEditing(false);
                        setEditPrompt("");
                      }}
                      className="font-display text-xs h-7"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Cancel Edit
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
                      <button
                        key={p}
                        onClick={() => setEditPrompt(p)}
                        className="text-xs px-3 py-1.5 rounded-sm bg-secondary text-secondary-foreground hover:bg-muted transition-colors font-display"
                      >
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
                      isEditMode
                        ? "Describe the changes you want…"
                        : isTertiary && styleConfig.tertiaryPlaceholder
                          ? styleConfig.tertiaryPlaceholder
                          : isThemed
                            ? styleConfig.themedPlaceholder
                            : styleConfig.freestylePlaceholder
                    }
                    className="min-h-[100px] bg-card border-border font-display text-base resize-none focus-visible:ring-primary disabled:opacity-60"
                  />

                  <p className="font-display font-bold text-sm text-foreground">
                    {isEditMode ? "Edit suggestions" : "Suggestions"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(isEditMode ? suggestions.edit : suggestions.generate).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPrompt(p)}
                        disabled={promptLocked}
                        className="text-xs px-3 py-1.5 rounded-sm bg-secondary text-secondary-foreground hover:bg-muted transition-colors font-display disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {p.length > 40 ? p.slice(0, 40) + "…" : p}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          );
        })()}

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

        {/* Print Format Selector — only when print-ready */}
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
              <p>
                Fallback: {formatResolution(selectedPrintFormat.fallbackPixelWidth, selectedPrintFormat.fallbackPixelHeight)}
                {selectedPrintFormat.allowUpscale && (
                  <span className="text-primary ml-1">· Upscale enabled</span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Standard mode: show existing print size / quality selectors */}
        {generationMode === "standard" && (
          <PrintSizeSelector selected={printSize} onChange={setPrintSize} qualityTarget={qualityTarget} onQualityChange={setQualityTarget} />
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex items-center gap-2">
            <Switch
              id={`hd-enhance-${persistKey}`}
              checked={hdEnhance}
              onCheckedChange={setHdEnhance}
            />
            <Label
              htmlFor={`hd-enhance-${persistKey}`}
              className="font-display text-sm text-muted-foreground cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Print Quality Enhancement
            </Label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Label className="font-display text-sm text-muted-foreground">Background:</Label>
          <div className="flex items-center gap-1 border border-border rounded-sm p-0.5">
            <button
              onClick={() => setBackgroundStyle("white")}
              className={`font-display text-xs px-2.5 py-1 rounded-sm transition-colors ${backgroundStyle === "white" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Pure White
            </button>
            <button
              onClick={() => setBackgroundStyle("cream")}
              className={`font-display text-xs px-2.5 py-1 rounded-sm transition-colors ${backgroundStyle === "cream" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Cream Paper
            </button>
          </div>
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
        {(loading || enhancing) && (
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="font-display text-sm">
              {enhancing ? "Enhancing details…" : "The artist is at work…"}
            </p>
          </div>
        )}

        {!loading && !enhancing && imageUrl && (
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
                    <Button
                      key={v}
                      variant={viewVersion === v ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewVersion(v)}
                      className="font-display text-xs h-7 px-2"
                    >
                      {v === "enhanced" ? "Enhanced" : v === "original" ? "Original" : "Compare"}
                    </Button>
                  ))}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadImage(
                    viewVersion === "original" && hasEnhanced ? baseImageUrl! : imageUrl,
                    `${styleConfig.downloadPrefix}-${mode}-${effectiveAspectRatio.replace(":", "x")}-${Date.now()}.png`
                  )
                }
                className="font-display text-xs tracking-wider"
              >
                <Download className="mr-2 h-4 w-4" />
                Download{" "}
                {hasEnhanced
                  ? viewVersion === "original"
                    ? "(Original)"
                    : "(Enhanced)"
                  : ""}{" "}
                ({generationMode === "print-ready" ? selectedPrintFormat.label : printSize.dimensions})
              </Button>
              {!savedToGallery && isEditMode && originalImageId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReplaceOriginal}
                  disabled={replacing || saving}
                  className="font-display text-xs tracking-wider"
                >
                  {replacing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Replacing…
                    </>
                  ) : (
                    <>
                      <Replace className="mr-2 h-4 w-4" /> Replace Original
                    </>
                  )}
                </Button>
              )}
              {!savedToGallery && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveToGallery}
                  disabled={saving || replacing}
                  className="font-display text-xs tracking-wider"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />{" "}
                      {isEditMode ? "Save as New" : "Save to Gallery"}
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsInlineEditing(true);
                  setEditPrompt("");
                }}
                className="font-display text-xs tracking-wider"
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit Image
              </Button>
              {savedToGallery && (
                <span className="text-xs text-primary flex items-center gap-1 font-display">
                  ✓ Saved to gallery
                </span>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="font-display text-xs tracking-wider text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
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

        {!loading && !enhancing && !imageUrl && (
          <p className="font-display text-muted-foreground text-sm">
            Your artwork will appear here
          </p>
        )}
      </div>
    </div>
  );
}
