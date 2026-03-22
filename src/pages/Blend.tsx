import { useState, useCallback } from "react";
import type { QualityTarget } from "@/lib/print-resolution";
import { Loader2, Download, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import PrintSizeSelector, { PRINT_SIZES, type PrintSize } from "@/components/PrintSizeSelector";
import { saveToGallery } from "@/lib/gallery";
import ImagePreviewMockups from "@/components/ImagePreviewMockups";
import StyleNav from "@/components/StyleNav";
import Gallery from "@/components/Gallery";
import { toast } from "sonner";

const BLEND_STYLES = [
  { value: "japanese", label: "🏯 Ukiyo-e" },
  { value: "popart", label: "🎯 Pop Art" },
  { value: "lineart", label: "✒️ Line Art" },
  { value: "lineart-minimal", label: "〰️ Minimal Lines" },
  { value: "minimalism", label: "◻ Minimalism" },
  { value: "graffiti", label: "🎨 Graffiti" },
  { value: "botanical", label: "🌿 Botanical" },
];

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

export default function Blend() {
  const [prompt, setPrompt] = useState("");
  const [style1, setStyle1] = useState("japanese");
  const [style2, setStyle2] = useState("minimalism");
  const [generating, setGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedToGallery, setSavedToGallery] = useState(false);
  const [galleryRefreshKey, setGalleryRefreshKey] = useState(0);

  // Options
  const [selectedSize, setSelectedSize] = useState<PrintSize>(PRINT_SIZES[1]);
  const [useCream, setUseCream] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim() || style1 === style2) return;
    setGenerating(true);
    setImageUrl(null);
    setSavedToGallery(false);
    try {
      const { data, error } = await supabase.functions.invoke("generate-image-blend", {
        body: {
          prompt: prompt.trim(),
          style1,
          style2,
          aspectRatio: selectedSize.ratio,
          backgroundStyle: useCream ? "cream" : "white",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.imageUrl) throw new Error("No image generated");
      setImageUrl(data.imageUrl);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate blended image");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!imageUrl) return;
    setSaving(true);
    try {
      await saveToGallery({
        imageUrl,
        prompt: `${prompt} [Blend: ${style1} + ${style2}]`,
        mode: `blend-${style1}-${style2}`,
        aspectRatio: selectedSize.ratio,
        printSize: selectedSize.label,
      });
      setSavedToGallery(true);
      setGalleryRefreshKey((k) => k + 1);
      toast.success("Saved to gallery!", { duration: 3000 });
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const style1Label = BLEND_STYLES.find((s) => s.value === style1)?.label || style1;
  const style2Label = BLEND_STYLES.find((s) => s.value === style2)?.label || style2;

  return (
    <div className="min-h-screen bg-background paper-texture">
      <StyleNav activePath="/blend" />

      <header className="pt-10 pb-12 text-center px-4">
        <p className="font-display text-primary text-sm tracking-[0.3em] uppercase mb-3">
          ✨ Style Fusion
        </p>
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold text-foreground leading-tight mb-4">
          Style<br />
          <span className="text-primary">Blender</span>
        </h1>
        <p className="text-muted-foreground max-w-lg mx-auto text-sm leading-relaxed">
          Combine any two art styles into a unique hybrid artwork.
        </p>
        <div className="mt-6 w-24 h-px bg-border mx-auto" />
      </header>

      <main className="pb-12 px-4">
        <div className="w-full max-w-4xl mx-auto space-y-6">
          {/* Style selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="font-display text-xs">Style 1</Label>
              <Select value={style1} onValueChange={setStyle1}>
                <SelectTrigger className="font-display text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLEND_STYLES.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="font-display text-xs" disabled={s.value === style2}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-display text-xs">Style 2</Label>
              <Select value={style2} onValueChange={setStyle2}>
                <SelectTrigger className="font-display text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLEND_STYLES.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="font-display text-xs" disabled={s.value === style1}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-2">
            <Label className="font-display text-xs">Describe your scene</Label>
            <Textarea
              placeholder={`e.g. 'A cherry blossom tree in a neon city' (${style1Label} + ${style2Label})`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="font-display text-sm min-h-[80px]"
              maxLength={1000}
            />
          </div>

          {/* Options row */}
          <div className="flex flex-wrap items-center gap-4">
            <PrintSizeSelector selected={selectedSize} onChange={setSelectedSize} />
            <div className="flex items-center gap-2">
              <Switch id="blend-cream" checked={useCream} onCheckedChange={setUseCream} />
              <Label htmlFor="blend-cream" className="font-display text-xs cursor-pointer">Cream BG</Label>
            </div>
          </div>

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim() || style1 === style2}
            className="w-full font-display"
          >
            {generating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Blending {style1Label} + {style2Label}…</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" /> Blend {style1Label} + {style2Label}</>
            )}
          </Button>

          {/* Result */}
          {imageUrl && (
            <div className="space-y-4">
              <ImagePreviewMockups imageUrl={imageUrl} alt={prompt} />
              <p className="font-display text-sm text-foreground">{prompt}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadImage(imageUrl, `blend-${Date.now()}.png`)} className="font-display text-xs">
                  <Download className="mr-2 h-4 w-4" /> Download
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving || savedToGallery} className="font-display text-xs">
                  <Save className="mr-2 h-4 w-4" /> {savedToGallery ? "Saved ✓" : saving ? "Saving…" : "Save to Gallery"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Gallery */}
      <section className="pb-20 px-4">
        <div className="w-full max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px flex-1 bg-border" />
            <h2 className="font-display text-lg font-bold text-foreground">Gallery</h2>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Gallery refreshKey={galleryRefreshKey} />
        </div>
      </section>

      <footer className="pb-8 text-center">
        <p className="text-muted-foreground text-xs font-display tracking-widest">
          ✨ Style Fusion Studio
        </p>
      </footer>
    </div>
  );
}
