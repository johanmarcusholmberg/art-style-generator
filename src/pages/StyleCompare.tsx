import { useState, useCallback, useMemo } from "react";
import StyleNav from "@/components/StyleNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, RefreshCw, Download, Sparkles, AlertTriangle } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import { saveToGallery } from "@/lib/gallery";
import { getCompareStyleOptions } from "@/lib/style-registry";
import { generateImage } from "@/lib/generation-router";
import {
  PRINT_FORMATS,
  getPosterPromptHint,
  type PrintFormat,
} from "@/lib/print-formats";
import { downloadWithBleed } from "@/lib/raw-download";
import type { NormalizedGenerationResponse } from "@/lib/generation-types";
import type { GeneratorPreference } from "@/lib/generators";
import { getDefaultStrictness } from "@/lib/style-strictness";

interface CompareResult {
  styleValue: string;
  styleLabel: string;
  imageUrl: string | null;
  loading: boolean;
  error: string | null;
  response?: NormalizedGenerationResponse;
}

const COMPARE_STYLES = getCompareStyleOptions();

type StyleCount = "4" | "8" | "all";

const PRESETS: Record<StyleCount, string[]> = {
  "4": ["japanese", "popart", "lineart", "urbannoir"],
  "8": ["japanese", "popart", "lineart", "minimalism", "botanical", "urbannoir", "retrocomic", "tattooflash"],
  all: COMPARE_STYLES.map((s) => s.value),
};

// Warn the user when a run would fan out to many generations at once.
const COST_WARN_THRESHOLD = 8;

const downloadImage = (url: string, filename: string) =>
  downloadWithBleed(url, { filename });

export default function StyleCompare() {
  const [prompt, setPrompt] = useState("");
  const [styleCount, setStyleCount] = useState<StyleCount>("4");
  const [printFormat, setPrintFormat] = useState<PrintFormat>(PRINT_FORMATS[0]);
  const [providerPref, setProviderPref] = useState<GeneratorPreference>("auto");
  const [results, setResults] = useState<CompareResult[]>([]);
  const [generating, setGenerating] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const { toast } = useToast();

  const activeStyles = PRESETS[styleCount];

  const showCostWarning = useMemo(
    () => activeStyles.length >= COST_WARN_THRESHOLD,
    [activeStyles.length],
  );

  const generateOne = useCallback(
    async (
      styleValue: string,
      promptText: string,
    ): Promise<{ url: string | null; response?: NormalizedGenerationResponse; error?: string }> => {
      try {
        const strictness = getDefaultStrictness({
          styleKey: styleValue,
          provider: providerPref === "auto" ? "sdxl" : providerPref,
        });
        const { response } = await generateImage({
          prompt: promptText,
          styleKey: styleValue,
          aspectRatio: printFormat.aspectRatio,
          providerPreference: providerPref,
          printMode: true,
          strictness,
          posterFormatId: printFormat.id,
          posterFormatHint: getPosterPromptHint(printFormat.id),
          targetAspectRatio: printFormat.aspectRatioDecimal,
          backgroundStyle: "white",
        });
        return { url: response.imageUrl, response };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { url: null, error: message };
      }
    },
    [printFormat, providerPref],
  );

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toast({ title: "Enter a subject", description: "Write what you want to compare across styles." });
      return;
    }
    setGenerating(true);
    const initial: CompareResult[] = activeStyles.map((sv) => ({
      styleValue: sv,
      styleLabel: COMPARE_STYLES.find((s) => s.value === sv)?.label || sv,
      imageUrl: null,
      loading: true,
      error: null,
    }));
    setResults(initial);

    // Generate all in parallel; per-style failures don't block siblings.
    const promises = activeStyles.map(async (sv, idx) => {
      const { url, response, error } = await generateOne(sv, prompt);
      setResults((prev) =>
        prev.map((r, i) =>
          i === idx
            ? {
                ...r,
                imageUrl: url,
                response,
                loading: false,
                error: url ? null : error ?? "Generation failed",
              }
            : r,
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
      const { url, response, error } = await generateOne(sv, prompt);
      setResults((prev) =>
        prev.map((r, i) =>
          i === idx
            ? {
                ...r,
                imageUrl: url,
                response,
                loading: false,
                error: url ? null : error ?? "Generation failed",
              }
            : r,
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
        const res = r.response;
        await saveToGallery({
          imageUrl: r.imageUrl!,
          prompt,
          mode: r.styleValue,
          aspectRatio: printFormat.aspectRatio,
          printSize: `${printFormat.widthCm}x${printFormat.heightCm}cm`,
          generationProvider: res?.generationProvider,
          generationModel: res?.generationModel,
          providerStrategy: res?.strategy,
          fallbackUsed: res?.fallbackUsed,
          executionRoute: res?.executionRoute,
          requestedModelId: res?.requestedModelId ?? null,
          resolvedModelId: res?.resolvedModelId ?? null,
          selectedAdapterId: res?.selectedAdapterId ?? null,
          qualityProfile: res?.qualityProfile ?? null,
          generationStrategy: res?.generationStrategy ?? null,
          modelFallbackReason: res?.modelFallbackReason ?? null,
        });
        saved++;
      } catch {
        /* skip failures — individual saves shouldn't stop the batch */
      }
    }
    setSavingAll(false);
    toast({ title: "Saved to gallery", description: `${saved} of ${toSave.length} images saved.` });
  }, [results, prompt, printFormat, toast]);

  const cols =
    activeStyles.length <= 4 ? "grid-cols-2" : activeStyles.length <= 8 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-4 lg:grid-cols-5";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StyleNav activePath="/compare" />

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Style Compare</h1>
          <p className="text-sm text-muted-foreground">
            See one subject across multiple art styles side by side. Uses the same generation router,
            poster format, and provider selection as the main generator.
          </p>
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

            <ToggleGroup
              type="single"
              value={printFormat.id}
              onValueChange={(v) => {
                const next = PRINT_FORMATS.find((f) => f.id === v);
                if (next) setPrintFormat(next);
              }}
              className="border border-border rounded-lg p-0.5"
            >
              {PRINT_FORMATS.map((f) => (
                <ToggleGroupItem key={f.id} value={f.id} className="text-xs px-3">
                  {f.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <ToggleGroup
              type="single"
              value={providerPref}
              onValueChange={(v) => v && setProviderPref(v as GeneratorPreference)}
              className="border border-border rounded-lg p-0.5"
            >
              <ToggleGroupItem value="auto" className="text-xs px-3">Auto</ToggleGroupItem>
              <ToggleGroupItem value="sdxl" className="text-xs px-3">SDXL</ToggleGroupItem>
              <ToggleGroupItem value="gemini" className="text-xs px-3">Gemini</ToggleGroupItem>
              <ToggleGroupItem value="openai" className="text-xs px-3">OpenAI</ToggleGroupItem>
            </ToggleGroup>

            <Button onClick={handleGenerate} disabled={generating || !prompt.trim()} className="gap-2">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Generating…" : "Compare"}
            </Button>

            {results.some((r) => r.imageUrl) && (
              <Button variant="outline" size="sm" onClick={handleSaveAll} disabled={savingAll} className="gap-1.5">
                {savingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save all to gallery
              </Button>
            )}
          </div>

          {showCostWarning && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 p-3 text-xs">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                About to run {activeStyles.length} generations in parallel — this will consume
                significantly more provider credits than a normal single-style generation.
              </span>
            </div>
          )}
        </div>

        {/* Results grid */}
        {results.length > 0 && (
          <div className={`grid ${cols} gap-3`}>
            {results.map((r, idx) => (
              <Card key={r.styleValue} className="overflow-hidden">
                <div
                  className="relative bg-muted"
                  style={{ aspectRatio: `${printFormat.widthCm} / ${printFormat.heightCm}` }}
                >
                  {r.loading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Generating…</span>
                    </div>
                  ) : r.imageUrl ? (
                    <img src={r.imageUrl} alt={`${r.styleLabel} — ${prompt}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center">
                      <span className="text-xs text-destructive">Failed</span>
                      {r.error && (
                        <span className="text-[10px] text-muted-foreground line-clamp-2">{r.error}</span>
                      )}
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
