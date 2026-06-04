/**
 * Style Lab.
 *
 * Four-tab workspace for testing, reviewing, analysing, and curating
 * generated artwork:
 *   • Test        — run a single style across many prompts sequentially
 *   • Review      — filter / rate / favorite / archive / reject results
 *   • Insights    — read-only analytics on style + provider performance
 *   • Collections — curate saved images into named collections
 *
 * Reuses the existing generation router and `saveToGallery` helper —
 * does not change generation behavior.
 */

import { useMemo, useRef, useState } from "react";
import {
  Loader2,
  Play,
  Square,
  Star,
  Heart,
  Archive as ArchiveIcon,
  CheckCircle2,
  XCircle,
} from "lucide-react";

import StyleNav from "@/components/StyleNav";
import RouteBadge from "@/components/RouteBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ReviewGrid from "@/components/style-lab/ReviewGrid";
import InsightsPanel from "@/components/style-lab/InsightsPanel";
import CollectionsWorkspace from "@/components/style-lab/CollectionsWorkspace";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import {
  PRINT_FORMATS,
  DEFAULT_PRINT_FORMAT_ID,
  getPrintFormat,
} from "@/lib/print-formats";
import { generateImage } from "@/lib/generation-router";
import { saveToGallery } from "@/lib/gallery";
import {
  setImageRating,
  setImageFavorite,
  setImageArchived,
  type ImageRating,
} from "@/lib/style-lab";
import {
  STYLE_LAB_STYLES,
  styleKeyForRoute,
} from "@/lib/style-lab-styles";
import type { NormalizedGenerationResponse } from "@/lib/generation-types";

interface ResultRow {
  id: string;
  prompt: string;
  styleKey: string;
  status: "queued" | "running" | "saved" | "failed";
  imageUrl?: string;
  error?: string;
  response?: NormalizedGenerationResponse;
  savedRowId?: string;
  rating: ImageRating;
  isFavorite: boolean;
  isArchived: boolean;
}

const parsePromptList = (raw: string): string[] =>
  raw
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

export default function StyleLab() {
  const { toast } = useToast();

  // Default to a popular concrete style so first-run works.
  const initialRoute =
    STYLE_LAB_STYLES.find((s) => s.route === "/mediterranean-heritage")?.route ??
    STYLE_LAB_STYLES[0].route;

  const [styleRoute, setStyleRoute] = useState<string>(initialRoute);
  const [promptText, setPromptText] = useState<string>("");
  const [formatId, setFormatId] = useState<string>(DEFAULT_PRINT_FORMAT_ID);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [running, setRunning] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const cancelRef = useRef(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const prompts = useMemo(() => parsePromptList(promptText), [promptText]);
  const total = prompts.length;
  const completed = results.filter((r) => r.status === "saved" || r.status === "failed").length;
  const progressPct = total === 0 ? 0 : Math.round((completed / total) * 100);

  const selectedStyleKey =
    styleKeyForRoute(styleRoute) ?? STYLE_LAB_STYLES[0].styleKey;
  const selectedFormat = getPrintFormat(formatId) ?? PRINT_FORMATS[0];


  // ── Per-result actions (optimistic UI + best-effort persistence) ────
  const updateResult = (idx: number, patch: Partial<ResultRow>) => {
    setResults((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  };

  const handleSetRating = async (idx: number, rating: ImageRating) => {
    const row = results[idx];
    if (!row) return;
    updateResult(idx, { rating });
    if (!row.savedRowId) return;
    try {
      await setImageRating(row.savedRowId, rating);
    } catch (e) {
      console.warn("[style-lab] setImageRating failed", e);
    }
  };

  const handleToggleFavorite = async (idx: number) => {
    const row = results[idx];
    if (!row) return;
    const next = !row.isFavorite;
    updateResult(idx, { isFavorite: next });
    if (!row.savedRowId) return;
    try {
      await setImageFavorite(row.savedRowId, next);
    } catch (e) {
      console.warn("[style-lab] setImageFavorite failed", e);
    }
  };

  const handleToggleArchive = async (idx: number) => {
    const row = results[idx];
    if (!row) return;
    const next = !row.isArchived;
    updateResult(idx, { isArchived: next });
    if (!row.savedRowId) return;
    try {
      await setImageArchived(row.savedRowId, next);
    } catch (e) {
      console.warn("[style-lab] setImageArchived failed", e);
    }
  };

  // ── Sequential runner ────────────────────────────────────────────────
  const start = async () => {
    if (running) return;
    if (prompts.length === 0) {
      toast({
        title: "No prompts",
        description: "Paste one prompt per line first.",
        variant: "destructive",
      });
      return;
    }

    // Seed the result grid with queued rows for every prompt.
    const seeded: ResultRow[] = prompts.map((p, i) => ({
      id: `${Date.now()}-${i}`,
      prompt: p,
      styleKey: selectedStyleKey,
      status: "queued",
      rating: 0,
      isFavorite: false,
      isArchived: false,
    }));
    setResults(seeded);
    setRunning(true);
    setCancelRequested(false);
    cancelRef.current = false;
    setCurrentIndex(0);

    for (let i = 0; i < prompts.length; i++) {
      if (cancelRef.current) break;
      setCurrentIndex(i);
      const prompt = prompts[i];
      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "running" } : r)),
      );

      try {
        const { response } = await generateImage({
          prompt,
          styleKey: selectedStyleKey,
          aspectRatio: selectedFormat.aspectRatio,
          posterFormatId: selectedFormat.id,
          posterFormatHint: selectedFormat.promptHint,
          targetAspectRatio: selectedFormat.aspectRatioDecimal,
          printMode: false,
          providerPreference: "auto",
        });

        // Save to gallery with provider/model/route preserved.
        await saveToGallery({
          imageUrl: response.imageUrl,
          prompt,
          mode: selectedStyleKey,
          aspectRatio: selectedFormat.aspectRatio,
          printSize: selectedFormat.id,
          printFormatId: selectedFormat.id,
          generationMode: "style-lab",
          generationProvider: response.generationProvider,
          generationModel: response.generationModel,
          providerStrategy: response.strategy,
          fallbackUsed: response.fallbackUsed,
          executionRoute: response.executionRoute,
          assetRole: "base_generation",
          baseImageUrl: response.imageUrl,
          masterImageUrl: response.imageUrl,
        });

        // Best-effort: find the just-saved row id so per-image actions can target it.
        const recent = await findRecentGalleryRow({
          prompt,
          mode: selectedStyleKey,
          withinSeconds: 90,
        });

        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: "saved",
                  imageUrl: response.imageUrl,
                  response,
                  savedRowId: recent?.id,
                }
              : r,
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[style-lab] generation failed", msg);
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, status: "failed", error: msg } : r,
          ),
        );
      }
    }

    setRunning(false);
    setCancelRequested(false);
    cancelRef.current = false;
    toast({
      title: "Style Lab run finished",
      description: `${prompts.length} prompt${prompts.length === 1 ? "" : "s"} processed.`,
      duration: 3000,
    });
  };

  const stop = () => {
    if (!running) return;
    cancelRef.current = true;
    setCancelRequested(true);
    toast({
      title: "Stopping after current prompt",
      description: "The in-flight prompt will complete, then the run stops.",
      duration: 3000,
    });
  };

  return (
    <div className="min-h-screen bg-background paper-texture">
      <StyleNav activePath="/style-lab" />

      <header className="pt-10 pb-8 text-center px-4">
        <p className="font-display text-primary text-sm tracking-[0.3em] uppercase mb-3">
          🧪 Style Lab
        </p>
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold text-foreground leading-tight mb-4">
          Prompt List<br />
          <span className="text-primary">Test Runner</span>
        </h1>
        <p className="text-muted-foreground max-w-lg mx-auto text-sm leading-relaxed">
          Pick a style, paste many prompts, run sequentially. Every successful
          image is saved to your gallery automatically.
        </p>
        <div className="mt-6 w-24 h-px bg-border mx-auto" />
      </header>

      <main className="pb-20 px-4">
        <div className="max-w-5xl mx-auto">
          <Tabs defaultValue="test" className="space-y-6">
            <TabsList className="grid grid-cols-4 w-full max-w-xl mx-auto">
              <TabsTrigger value="test" className="font-display text-sm">Test</TabsTrigger>
              <TabsTrigger value="review" className="font-display text-sm">Review</TabsTrigger>
              <TabsTrigger value="insights" className="font-display text-sm">Insights</TabsTrigger>
              <TabsTrigger value="collections" className="font-display text-sm">Collections</TabsTrigger>
            </TabsList>

            <TabsContent value="test" className="space-y-6">
          {/* Controls */}
          <section className="rounded-md border border-border bg-card p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-display text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">
                  Style
                </label>
                <Select
                  value={styleRoute}
                  onValueChange={setStyleRoute}
                  disabled={running}
                >
                  <SelectTrigger className="font-display text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {STYLE_CATALOG.filter((s) => ROUTE_TO_STYLE_KEY[s.route]).map(
                      (s) => (
                        <SelectItem
                          key={s.route}
                          value={s.route}
                          className="font-display text-sm"
                        >
                          {s.emoji} {s.name}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="font-display text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">
                  Poster format
                </label>
                <Select
                  value={formatId}
                  onValueChange={setFormatId}
                  disabled={running}
                >
                  <SelectTrigger className="font-display text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRINT_FORMATS.map((f) => (
                      <SelectItem
                        key={f.id}
                        value={f.id}
                        className="font-display text-sm"
                      >
                        {f.label} · {f.aspectRatio}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="font-display text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">
                Prompts ({prompts.length})
              </label>
              <Textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                disabled={running}
                placeholder={
                  "A weathered green door\nA blue shuttered window\nA fishing boat in a harbor\nA lemon tree beside a stone wall\nA Mediterranean courtyard"
                }
                rows={8}
                className="font-display text-sm leading-relaxed"
              />
              <p className="font-display text-[11px] text-muted-foreground mt-1.5">
                One prompt per line. Empty lines are ignored.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {!running ? (
                <Button
                  onClick={start}
                  disabled={prompts.length === 0}
                  className="font-display text-sm"
                >
                  <Play className="h-4 w-4 mr-1.5" />
                  Run {prompts.length || ""} prompt{prompts.length === 1 ? "" : "s"}
                </Button>
              ) : (
                <Button
                  onClick={stop}
                  variant="outline"
                  className="font-display text-sm"
                  disabled={cancelRequested}
                >
                  <Square className="h-4 w-4 mr-1.5" />
                  {cancelRequested ? "Stopping…" : "Stop after current"}
                </Button>
              )}

              {total > 0 && (
                <div className="flex-1 min-w-[200px] flex items-center gap-3">
                  <Progress value={progressPct} className="h-2 flex-1" />
                  <span className="font-display text-xs text-muted-foreground whitespace-nowrap">
                    {running
                      ? `Prompt ${Math.min(currentIndex + 1, total)} of ${total}`
                      : `${completed} / ${total}`}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Results */}
          {results.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-sm uppercase tracking-[0.2em] text-muted-foreground">
                Results
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.map((r, idx) => (
                  <ResultCard
                    key={r.id}
                    row={r}
                    onSetRating={(rating) => handleSetRating(idx, rating)}
                    onToggleFavorite={() => handleToggleFavorite(idx)}
                    onToggleArchive={() => handleToggleArchive(idx)}
                  />
                ))}
              </div>
            </section>
          )}
            </TabsContent>

            <TabsContent value="review">
              <ReviewGrid />
            </TabsContent>

            <TabsContent value="insights">
              <InsightsPanel />
            </TabsContent>

            <TabsContent value="collections">
              <CollectionsWorkspace />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

// ── Result card ─────────────────────────────────────────────────────────

interface ResultCardProps {
  row: ResultRow;
  onSetRating: (rating: ImageRating) => void;
  onToggleFavorite: () => void;
  onToggleArchive: () => void;
}

function ResultCard({
  row,
  onSetRating,
  onToggleFavorite,
  onToggleArchive,
}: ResultCardProps) {
  return (
    <div
      className={cn(
        "rounded-md border bg-card overflow-hidden flex flex-col",
        row.status === "failed" ? "border-destructive/40" : "border-border",
        row.isArchived && "opacity-60",
      )}
    >
      <div className="relative aspect-square bg-muted flex items-center justify-center">
        {row.status === "queued" && (
          <span className="font-display text-[10px] text-muted-foreground">
            Queued
          </span>
        )}
        {row.status === "running" && (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="font-display text-[10px]">Generating…</span>
          </div>
        )}
        {row.status === "saved" && row.imageUrl && (
          <img
            src={row.imageUrl}
            alt={row.prompt}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        )}
        {row.status === "failed" && (
          <div className="flex flex-col items-center gap-1 text-destructive px-3 text-center">
            <XCircle className="h-5 w-5" />
            <span className="font-display text-[10px]">
              {row.error || "Generation failed"}
            </span>
          </div>
        )}
      </div>

      <div className="p-2.5 space-y-2">
        <p
          className="font-display text-xs text-foreground line-clamp-2"
          title={row.prompt}
        >
          {row.prompt}
        </p>

        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">
            {row.styleKey}
          </span>
          {row.response && (
            <RouteBadge
              provider={row.response.generationProvider}
              model={row.response.generationModel}
              route={row.response.executionRoute}
              fallback={row.response.fallbackUsed}
              variant="compact"
            />
          )}
        </div>

        {row.status === "saved" && (
          <>
            <div className="flex items-center gap-0.5">
              {([1, 2, 3, 4, 5] as ImageRating[]).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onSetRating(n === row.rating ? 0 : n)}
                  className="p-0.5 text-muted-foreground hover:text-primary transition-colors"
                  aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
                >
                  <Star
                    className={cn(
                      "h-3.5 w-3.5",
                      n <= row.rating
                        ? "fill-primary text-primary"
                        : "fill-none",
                    )}
                  />
                </button>
              ))}
              <div className="flex-1" />
              <button
                type="button"
                onClick={onToggleFavorite}
                className={cn(
                  "p-1 rounded-sm border transition-colors",
                  row.isFavorite
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
                aria-label="Favorite"
                title="Favorite"
              >
                <Heart
                  className={cn("h-3 w-3", row.isFavorite && "fill-current")}
                />
              </button>
              <button
                type="button"
                onClick={onToggleArchive}
                className={cn(
                  "p-1 rounded-sm border transition-colors",
                  row.isArchived
                    ? "bg-muted-foreground/15 border-muted-foreground/40 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
                aria-label="Archive"
                title="Archive"
              >
                <ArchiveIcon className="h-3 w-3" />
              </button>
            </div>

            <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              <span className="font-display text-[10px]">Saved to gallery</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
