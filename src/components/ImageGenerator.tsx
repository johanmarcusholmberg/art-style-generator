import { useState } from "react";
import { Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import PrintSizeSelector, { PRINT_SIZES, type PrintSize } from "@/components/PrintSizeSelector";

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

const EXAMPLE_PROMPTS = [
  "A great wave crashing against Mount Fuji at sunset",
  "Koi fish swimming in a tranquil garden pond",
  "A crane flying over misty mountains at dawn",
];

export default function ImageGenerator() {
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [printSize, setPrintSize] = useState<PrintSize>(PRINT_SIZES[2]); // Poster default
  const { toast } = useToast();

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setImageUrl(null);

    try {
      const { data, error } = await supabase.functions.invoke("generate-image", {
        body: { prompt: prompt.trim(), aspectRatio: printSize.ratio },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setImageUrl(data.imageUrl);
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

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      <div className="space-y-4 mb-8">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your scene… e.g. 'A crane flying over misty mountains'"
          className="min-h-[100px] bg-card border-border font-display text-base resize-none focus-visible:ring-primary"
        />

        <p className="font-display font-bold text-sm text-foreground">Suggestions</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((p) => (
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

        <Button
          onClick={generate}
          disabled={loading || !prompt.trim()}
          className="w-full sm:w-auto font-display text-sm tracking-wider"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Painting…
            </>
          ) : (
            "Generate 浮世絵"
          )}
        </Button>
      </div>

      <div className="relative min-h-[300px] flex items-center justify-center rounded-sm border border-border bg-card paper-texture">
        {loading && (
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="font-display text-sm">The artist is at work…</p>
          </div>
        )}

        {!loading && imageUrl && (
          <div className="flex flex-col items-center gap-4 p-4">
            <img
              src={imageUrl}
              alt={prompt}
              className="max-w-full max-h-[600px] rounded-sm animate-ink-spread"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadImage(imageUrl, `ukiyoe-${printSize.ratio.replace(":", "x")}-${Date.now()}.png`)}
              className="font-display text-xs tracking-wider"
            >
              <Download className="mr-2 h-4 w-4" />
              Download ({printSize.dimensions})
            </Button>
          </div>
        )}

        {!loading && !imageUrl && (
          <p className="font-display text-muted-foreground text-sm">
            Your artwork will appear here
          </p>
        )}
      </div>
    </div>
  );
}
