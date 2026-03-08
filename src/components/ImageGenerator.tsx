import { useState } from "react";
import { Loader2, Download, Sparkles, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import PrintSizeSelector, { PRINT_SIZES, type PrintSize } from "@/components/PrintSizeSelector";
import { saveToGallery } from "@/lib/gallery";
import ImagePreviewMockups from "@/components/ImagePreviewMockups";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";

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
  "A great wave crashing against Mount Fuji at sunset",
  "Koi fish swimming in a tranquil garden pond",
  "A crane flying over misty mountains at dawn",
];

const EDIT_PROMPTS = [
  "Change the background to a sunset sky",
  "Make the colors more vibrant and saturated",
  "Add cherry blossoms falling in the scene",
];

interface ImageGeneratorProps {
  onImageSaved?: () => void;
  initialPrompt?: string;
  initialImageUrl?: string;
}

export default function ImageGenerator({ onImageSaved, initialPrompt, initialImageUrl }: ImageGeneratorProps) {
  const isEditMode = !!initialImageUrl;
  const [prompt, setPrompt] = useState(isEditMode ? "" : (initialPrompt || ""));
  const [sourceImageUrl] = useState<string | null>(initialImageUrl || null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [baseImageUrl, setBaseImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveToGalleryEnabled, setSaveToGalleryEnabled] = useState(false);
  const [savedToGallery, setSavedToGallery] = useState(false);
  const [hdEnhance, setHdEnhance] = useState(true);
  const [showComparison, setShowComparison] = useState(false);
  const [printSize, setPrintSize] = useState<PrintSize>(PRINT_SIZES[2]);
  const { toast } = useToast();

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setImageUrl(null);
    setBaseImageUrl(null);
    setShowComparison(false);
    setSavedToGallery(false);

    try {
      const body: any = { prompt: prompt.trim(), aspectRatio: printSize.ratio };
      if (sourceImageUrl) body.sourceImageUrl = sourceImageUrl;
      const { data, error } = await supabase.functions.invoke("generate-image", { body });

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

      if (saveToGalleryEnabled) {
        setSaving(true);
        try {
          await saveToGallery({
            imageUrl: finalUrl,
            prompt: prompt.trim(),
            mode: "japanese",
            aspectRatio: printSize.ratio,
            printSize: printSize.dimensions,
          });
          onImageSaved?.();
          toast({ title: "Saved to gallery", description: "Your artwork has been saved." });
        } catch (saveErr: any) {
          console.error("Gallery save failed:", saveErr);
        } finally {
          setSaving(false);
        }
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
          placeholder={isEditMode ? "Describe the changes you want… e.g. 'Make the sky a sunset orange'" : "Describe your scene… e.g. 'A crane flying over misty mountains'"}
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

        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="save-to-gallery-jp"
              checked={saveToGalleryEnabled}
              onCheckedChange={(checked) => setSaveToGalleryEnabled(checked === true)}
            />
            <Label htmlFor="save-to-gallery-jp" className="font-display text-sm text-muted-foreground cursor-pointer">
              Save to gallery
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="hd-enhance-jp"
              checked={hdEnhance}
              onCheckedChange={setHdEnhance}
            />
            <Label htmlFor="hd-enhance-jp" className="font-display text-sm text-muted-foreground cursor-pointer flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              HD Enhance
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
            {showComparison && hasEnhanced ? (
              <BeforeAfterSlider
                beforeUrl={baseImageUrl!}
                afterUrl={imageUrl}
                alt={prompt}
                className="max-w-full max-h-[600px]"
              />
            ) : (
              <ImagePreviewMockups imageUrl={imageUrl} alt={prompt} />
            )}
            <div className="flex flex-wrap gap-2 items-center justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadImage(imageUrl, `ukiyoe-${printSize.ratio.replace(":", "x")}-${Date.now()}.png`)}
                className="font-display text-xs tracking-wider"
              >
                <Download className="mr-2 h-4 w-4" />
                Download ({printSize.dimensions})
              </Button>
              {hasEnhanced && (
                <Button
                  variant={showComparison ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowComparison((v) => !v)}
                  className="font-display text-xs tracking-wider"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {showComparison ? "Hide Comparison" : "Before / After"}
                </Button>
              )}
              {saving && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 font-display">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
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
