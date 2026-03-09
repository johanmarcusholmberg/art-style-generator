import { useState } from "react";
import { usePersistedGeneration } from "@/hooks/use-persisted-generation";
import { Loader2, Download, Sparkles, Save, Replace, X, Trash2 } from "lucide-react";
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

const PROMPTS: Record<string, { generate: string[]; edit: string[] }> = {
  japanese: {
    generate: [
      "A great wave crashing against Mount Fuji at sunset",
      "Koi fish swimming in a tranquil garden pond",
      "A crane flying over misty mountains at dawn",
    ],
    edit: [
      "Change the background to a sunset sky",
      "Make the colors more vibrant and saturated",
      "Add cherry blossoms falling in the scene",
    ],
  },
  freestyle: {
    generate: [
      "Central Park in New York during autumn",
      "The Eiffel Tower at golden hour",
      "A cozy Italian café on a rainy day",
    ],
    edit: [
      "Change the background to a sunset sky",
      "Make the colors more vibrant and saturated",
      "Add rain and reflections on the ground",
    ],
  },
};

interface ImageGeneratorProps {
  mode: "japanese" | "freestyle";
  onImageSaved?: () => void;
  onExitEdit?: () => void;
  initialPrompt?: string;
  initialImageUrl?: string;
  originalImageId?: string;
  originalStoragePath?: string;
}

export default function ImageGenerator({
  mode,
  onImageSaved,
  onExitEdit,
  initialPrompt,
  initialImageUrl,
  originalImageId,
  originalStoragePath,
}: ImageGeneratorProps) {
  const isEditMode = !!initialImageUrl;
  const edgeFn = mode === "japanese" ? "generate-image" : "generate-image-freestyle";
  const modeLabel = mode === "japanese" ? "🏯 Japanese" : "🎨 Freestyle";
  const generateLabel = mode === "japanese" ? "Generate 浮世絵" : "Generate Image";

  const {
    prompt, setPrompt,
    imageUrl, setImageUrl,
    baseImageUrl, setBaseImageUrl,
    savedToGallery, setSavedToGallery,
  } = usePersistedGeneration(mode, isEditMode ? undefined : initialPrompt);

  const [sourceImageUrl] = useState<string | null>(initialImageUrl || null);
  const [loading, setLoading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [hdEnhance, setHdEnhance] = useState(true);
  const [whiteFrame, setWhiteFrame] = useState(false);
  const [viewVersion, setViewVersion] = useState<"enhanced" | "original" | "compare">("enhanced");
  const [printSize, setPrintSize] = useState<PrintSize>(PRINT_SIZES[2]);
  const { toast } = useToast();

  const suggestions = PROMPTS[mode] || PROMPTS.japanese;

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setImageUrl(null);
    setBaseImageUrl(null);
    setViewVersion("enhanced");
    setSavedToGallery(false);

    try {
      const body: any = { prompt: prompt.trim(), aspectRatio: printSize.ratio, whiteFrame };
      if (sourceImageUrl) body.sourceImageUrl = sourceImageUrl;
      const { data, error } = await supabase.functions.invoke(edgeFn, { body });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      let finalUrl = data.imageUrl;
      setBaseImageUrl(data.imageUrl);

      if (hdEnhance) {
        setEnhancing(true);
        try {
          const { data: upData, error: upError } = await supabase.functions.invoke("upscale-image", {
            body: { imageUrl: data.imageUrl, aspectRatio: printSize.ratio },
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

  const handleSaveToGallery = async () => {
    if (!imageUrl || savedToGallery || saving) return;
    setSaving(true);
    try {
      await saveToGallery({
        imageUrl,
        prompt: prompt.trim(),
        mode,
        aspectRatio: printSize.ratio,
        printSize: printSize.dimensions,
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
      await replaceInGallery({
        originalId: originalImageId,
        originalStoragePath,
        imageUrl,
        prompt: prompt.trim(),
        mode,
        aspectRatio: printSize.ratio,
        printSize: printSize.dimensions,
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

        {/* Lock prompt editing when there's an unsaved generated image */}
        {(() => {
          const promptLocked = !!imageUrl && !savedToGallery;
          return (
            <>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={promptLocked}
                placeholder={
                  isEditMode
                    ? "Describe the changes you want… e.g. 'Make the sky a sunset orange'"
                    : mode === "japanese"
                      ? "Describe your scene… e.g. 'A crane flying over misty mountains'"
                      : "Describe any scene… e.g. 'Central Park in New York during autumn'"
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
          );
        })()}

        <PrintSizeSelector selected={printSize} onChange={setPrintSize} />

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id={`hd-enhance-${mode}`}
              checked={hdEnhance}
              onCheckedChange={setHdEnhance}
            />
            <Label
              htmlFor={`hd-enhance-${mode}`}
              className="font-display text-sm text-muted-foreground cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              HD Enhance
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id={`white-frame-${mode}`}
              checked={whiteFrame}
              onCheckedChange={setWhiteFrame}
            />
            <Label
              htmlFor={`white-frame-${mode}`}
              className="font-display text-sm text-muted-foreground cursor-pointer"
            >
              White Frame
            </Label>
          </div>
        </div>

        <Button
          onClick={generate}
          disabled={loading || !prompt.trim()}
          className="w-full sm:w-auto font-display text-sm tracking-wider"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isEditMode ? "Editing…" : "Painting…"}
            </>
          ) : (
            isEditMode ? "Apply Changes" : generateLabel
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
                    `ukiyoe-${mode}-${printSize.ratio.replace(":", "x")}-${Date.now()}.png`
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
                ({printSize.dimensions})
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
