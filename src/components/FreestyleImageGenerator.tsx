import { useState } from "react";
import { usePersistedGeneration } from "@/hooks/use-persisted-generation";
import { Loader2, Download, Sparkles, Save, Replace } from "lucide-react";
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

const GENERATE_PROMPTS = [
  "Central Park in New York during autumn",
  "The Eiffel Tower at golden hour",
  "A cozy Italian café on a rainy day",
];

const EDIT_PROMPTS = [
  "Change the background to a sunset sky",
  "Make the colors more vibrant and saturated",
  "Add rain and reflections on the ground",
];

interface FreestyleImageGeneratorProps {
  onImageSaved?: () => void;
  initialPrompt?: string;
  initialImageUrl?: string;
  originalImageId?: string;
  originalStoragePath?: string;
}

export default function FreestyleImageGenerator({ onImageSaved, initialPrompt, initialImageUrl, originalImageId, originalStoragePath }: FreestyleImageGeneratorProps) {
  const isEditMode = !!initialImageUrl;
  const { prompt, setPrompt, imageUrl, setImageUrl, baseImageUrl, setBaseImageUrl, savedToGallery, setSavedToGallery } = usePersistedGeneration("freestyle", isEditMode ? undefined : initialPrompt);
  const [sourceImageUrl] = useState<string | null>(initialImageUrl || null);
  const [loading, setLoading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [hdEnhance, setHdEnhance] = useState(true);
  const [viewVersion, setViewVersion] = useState<"enhanced" | "original" | "compare">("enhanced");
  const [printSize, setPrintSize] = useState<PrintSize>(PRINT_SIZES[2]);
  const { toast } = useToast();

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setImageUrl(null);
    setBaseImageUrl(null);
    setViewVersion("enhanced");
    setSavedToGallery(false);

    try {
      const body: any = { prompt: prompt.trim(), aspectRatio: printSize.ratio };
      if (sourceImageUrl) body.sourceImageUrl = sourceImageUrl;
      const { data, error } = await supabase.functions.invoke("generate-image-freestyle", { body });

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
        mode: "freestyle",
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
        mode: "freestyle",
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
        {isEditMode && sourceImageUrl && (
          <div className="space-y-2">
            <p className="font-display text-xs text-muted-foreground">Editing this image:</p>
            <img src={sourceImageUrl} alt="Source image" className="max-h-40 rounded-sm border border-border object-contain" />
          </div>
        )}
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={isEditMode ? "Describe the changes you want… e.g. 'Add more vibrant colors'" : "Describe any scene… e.g. 'Central Park in New York during autumn'"}
          className="min-h-[100px] bg-card border-border font-display text-base resize-none focus-visible:ring-primary"
        />

        <p className="font-display font-bold text-sm text-foreground">{isEditMode ? "Edit suggestions" : "Suggestions"}</p>
        <div className="flex flex-wrap gap-2">
          {(isEditMode ? EDIT_PROMPTS : GENERATE_PROMPTS).map((p) => (
            <button
              key={p}
              onClick={() => setPrompt(p)}
              className="text-xs px-3 py-1.5 rounded-sm bg-secondary text-secondary-foreground hover:bg-muted transition-colors font-display"
            >
              {p.length > 40 ? p.slice(0, 40) + "…" : p}
            </button>
          ))}
        </div>

        <PrintSizeSelector selected={printSize} onChange={setPrintSize} />

        <div className="flex items-center gap-2">
          <Switch
            id="hd-enhance-fs"
            checked={hdEnhance}
            onCheckedChange={setHdEnhance}
          />
          <Label htmlFor="hd-enhance-fs" className="font-display text-sm text-muted-foreground cursor-pointer flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            HD Enhance
          </Label>
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
            isEditMode ? "Apply Changes" : "Generate 浮世絵"
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
                onClick={() => downloadImage(
                  viewVersion === "original" && hasEnhanced ? baseImageUrl! : imageUrl,
                  `ukiyoe-freestyle-${printSize.ratio.replace(":", "x")}-${Date.now()}.png`
                )}
                className="font-display text-xs tracking-wider"
              >
                <Download className="mr-2 h-4 w-4" />
                Download {hasEnhanced ? (viewVersion === "original" ? "(Original)" : "(Enhanced)") : ""} ({printSize.dimensions})
              </Button>
              {!savedToGallery && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveToGallery}
                  disabled={saving}
                  className="font-display text-xs tracking-wider"
                >
                  {saving ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
                  ) : (
                    <><Save className="mr-2 h-4 w-4" /> Save to Gallery</>
                  )}
                </Button>
              )}
              {savedToGallery && (
                <span className="text-xs text-primary flex items-center gap-1 font-display">
                  ✓ Saved to gallery
                </span>
              )}
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
