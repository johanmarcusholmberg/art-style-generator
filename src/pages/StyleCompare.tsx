import { useState, useCallback } from "react";
import StyleNav from "@/components/StyleNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Save, RefreshCw, Download } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { saveToGallery } from "@/lib/gallery";
import { ALL_STYLES } from "@/lib/batch-jobs";

interface CompareResult {
  styleValue: string;
  styleLabel: string;
  imageUrl: string | null;
  loading: boolean;
  error: string | null;
}

const STYLE_TO_EDGE_FN: Record<string, string> = {
  japanese: "generate-image",
  freestyle: "generate-image-freestyle",
  popart: "generate-image-popart",
  "popart-freestyle": "generate-image-popart-freestyle",
  lineart: "generate-image-lineart",
  "lineart-freestyle": "generate-image-lineart-freestyle",
  "lineart-minimal": "generate-image-lineart-minimal",
  minimalism: "generate-image-minimalism",
  "minimalism-freestyle": "generate-image-minimalism-freestyle",
  graffiti: "generate-image-graffiti",
  "graffiti-freestyle": "generate-image-graffiti-freestyle",
  botanical: "generate-image-botanical",
  "botanical-freestyle": "generate-image-botanical-freestyle",
};

type StyleCount = "4" | "8" | "all";

const PRESETS: Record<StyleCount, string[]> = {
  "4": ["japanese", "popart", "lineart", "botanical"],
  "8": ["japanese", "popart", "lineart", "minimalism", "graffiti", "botanical", "freestyle", "lineart-minimal"],
  all: ALL_STYLES.map((s) => s.value),
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

export default function StyleCompare() {
  const [prompt, setPrompt] = useState("");
  const [styleCount, setStyleCount] = useState<StyleCount>("4");
  const [results, setResults] = useState<CompareResult[]>([]);
  const [generating, setGenerating] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const { toast } = useToast();

  const activeStyles = PRESETS[styleCount];

  const generateOne = useCallback(
    async (styleValue: string, promptText: string): Promise<string | null> => {
      const edgeFn = STYLE_TO_EDGE_FN[styleValue];
      if (!edgeFn) return null;
      try {
        const { data, error } = await supabase.functions.invoke(edgeFn, {
          body: {
            prompt: promptText,
            aspectRatio: "1:1",
            backgroundStyle: "white",
            speedMode: "quality",
          },
        });
        if (error) throw error;
        return data?.imageUrl || data?.image || null;
      } catch {
        return null;
      }
    },
    [],
  );

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toast({ title: "Enter a subject", description: "Write what you want to compare across styles." });
      return;
    }
    setGenerating(true);
    const initial: CompareResult[] = activeStyles.map((sv) => ({
      styleValue: sv,
      styleLabel: ALL_STYLES.find((s) => s.value === sv)?.label || sv,
      imageUrl: null,
      loading: true,
      error: null,
    }));
    setResults(initial);

    // Generate all in parallel
    const promises = activeStyles.map(async (sv, idx) => {
      const url = await generateOne(sv, prompt);
      setResults((prev) =>
        prev.map((r, i) =>
          i === idx ? { ...r, imageUrl: url, loading: false, error: url ? null : "Generation failed" } : r,
        ),
      );
    });
    await Promise.allSettled(promises);
    setGenerating(false);
    toast({ title: "Compare complete", description: `${activeStyles.length} styles generated.` });
  }, [prompt, activeStyles, generateOne, toast]);

  const handleRegenerateOne = useCallback(
    async (idx: number) => {
      setResults((prev) => prev.map((r, i) => (i === idx ? { ...r, loading: true, error: null } : r)));
      const sv = results[idx]?.styleValue;
      if (!sv) return;
      const url = await generateOne(sv, prompt);
      setResults((prev) =>
        prev.map((r, i) =>
          i === idx ? { ...r, imageUrl: url, loading: false, error: url ? null : "Generation failed" } : r,
        ),
      );
    },
    [results, prompt, generateOne],
  );

  const handleSaveAll = useCallback(async () => {
    const toSave = results.filter((r) => r.imageUrl);
    if (!toSave.length) return;
    setSavingAll(true);
    let saved = 0;
    for (const r of toSave) {
      try {
        await saveToGallery({
          imageUrl: r.imageUrl!,
          prompt,
          mode: r.styleValue,
          aspectRatio: "1:1",
          printSize: "none",
        });
        saved++;
      } catch {
        /* skip failures */
      }
    }
    setSavingAll(false);
    toast({ title: "Saved to gallery", description: `${saved} of ${toSave.length} images saved.` });
  }, [results, prompt, toast]);

  const cols =
    activeStyles.length <= 4 ? "grid-cols-2" : activeStyles.length <= 8 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-4 lg:grid-cols-5";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StyleNav activePath="/compare" />

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Style Compare</h1>
          <p className="text-sm text-muted-foreground">See one subject across multiple art styles side by side.</p>
        </div>

        {/* Prompt + controls */}
        <div className="space-y-4">
          <Textarea
            placeholder="Describe a subject… e.g. 'A majestic owl perched on an oak branch at dusk'"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[80px]"
          />

          <div className="flex flex-wrap items-center gap-3">
            <ToggleGroup
              type="single"
              value={styleCount}
              onValueChange={(v) => v && setStyleCount(v as StyleCount)}
              className="border border-border rounded-lg p-0.5"
            >
              <ToggleGroupItem value="4" className="text-xs px-3">4 styles</ToggleGroupItem>
              <ToggleGroupItem value="8" className="text-xs px-3">8 styles</ToggleGroupItem>
              <ToggleGroupItem value="all" className="text-xs px-3">All styles</ToggleGroupItem>
            </ToggleGroup>

            <Button onClick={handleGenerate} disabled={generating || !prompt.trim()} className="gap-2">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Generating…" : "Compare"}
            </Button>

            {results.some((r) => r.imageUrl) && (
              <>
                <Button variant="outline" size="sm" onClick={handleSaveAll} disabled={savingAll} className="gap-1.5">
                  {savingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save all to gallery
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Results grid */}
        {results.length > 0 && (
          <div className={`grid ${cols} gap-3`}>
            {results.map((r, idx) => (
              <Card key={r.styleValue} className="overflow-hidden">
                <div className="relative aspect-square bg-muted">
                  {r.loading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Generating…</span>
                    </div>
                  ) : r.imageUrl ? (
                    <img src={r.imageUrl} alt={`${r.styleLabel} — ${prompt}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs text-destructive">Failed</span>
                    </div>
                  )}
                </div>
                <CardContent className="p-2 flex items-center justify-between gap-1">
                  <Badge variant="secondary" className="text-[10px] truncate max-w-[60%]">
                    {r.styleLabel}
                  </Badge>
                  <div className="flex items-center gap-1">
                    {r.imageUrl && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Download"
                        onClick={() => downloadImage(r.imageUrl!, `compare-${r.styleValue}-${Date.now()}.png`)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Regenerate this style"
                      disabled={r.loading}
                      onClick={() => handleRegenerateOne(idx)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// small inline icon
function Sparkles(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" /><path d="M22 5h-4" />
    </svg>
  );
}
