/**
 * Style Lab — Review Grid (Phase 2).
 *
 * Browse saved generated_images with filters and inline curation actions.
 * Limitations:
 *  - No `is_rejected` column exists in `generated_images`; reject is mapped
 *    to "archive" for now and a "Reject" affordance is omitted (acceptance
 *    criteria mark it as optional / "if exists").
 *  - Preview uses a lightweight modal — not the full Gallery lightbox,
 *    which is tightly coupled to many enhancement/export dialogs.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Star,
  Heart,
  Archive as ArchiveIcon,
  X,
  RefreshCcw,
} from "lucide-react";

import RouteBadge from "@/components/RouteBadge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

import {
  fetchReviewImages,
  setImageRating,
  setImageFavorite,
  setImageArchived,
  type ImageRating,
  type ReviewImage,
} from "@/lib/style-lab";
import { STYLE_CATALOG } from "@/lib/style-catalog";

const STYLE_KEYS: { value: string; label: string }[] = [
  { value: "japanese", label: "🏯 Ukiyo-e" },
  { value: "risograph", label: "📠 Risograph" },
  { value: "screenprint", label: "🖨️ Screen Print" },
  { value: "xeroxzine", label: "📋 Xerox Zine" },
  { value: "lineart", label: "✒️ Line Art" },
  { value: "botanical", label: "🌿 Botanical" },
  { value: "tattooflash", label: "🔥 Tattoo Flash" },
  { value: "retrocomic", label: "💥 Retro Comic" },
  { value: "whimsicaljapanese", label: "🦊 Whimsical Japanese" },
  { value: "modernistcocktail", label: "🍸 Modernist Cocktail" },
  { value: "mediterraneanheritage", label: "🚪 Mediterranean Heritage" },
  { value: "scandinavianposter", label: "🇸🇪 Scandinavian" },
  { value: "brutalistposter", label: "⬛ Brutalist" },
  { value: "urbannoir", label: "🖤 Urban Noir" },
  { value: "minimalism", label: "◻ Minimalism" },
  { value: "graffiti", label: "🎨 Graffiti" },
  { value: "pulpmagazine", label: "📕 Pulp Magazine" },
  { value: "popart", label: "🎯 Pop Art" },
  { value: "vintage", label: "🍷 Vintage" },
];
void STYLE_CATALOG; // keep import lint-clean

const ALL = "__all__";

export default function ReviewGrid() {
  const { toast } = useToast();

  const [items, setItems] = useState<ReviewImage[]>([]);
  const [loading, setLoading] = useState(false);

  const [styleFilter, setStyleFilter] = useState<string>(ALL);
  const [providerFilter, setProviderFilter] = useState<string>(ALL);
  const [minRating, setMinRating] = useState<number>(0);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [preview, setPreview] = useState<ReviewImage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchReviewImages({
        mode: styleFilter === ALL ? null : styleFilter,
        provider: providerFilter === ALL ? null : providerFilter,
        minRating,
        favoritesOnly,
        includeArchived: showArchived,
      });
      setItems(rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[review-grid] load failed", msg);
      toast({ title: "Failed to load images", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [styleFilter, providerFilter, minRating, favoritesOnly, showArchived, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Derived provider options from currently-loaded set (plus any obvious ones).
  const providerOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.generation_provider) set.add(i.generation_provider);
    });
    ["gemini", "openai", "replicate", "lovable"].forEach((p) => set.add(p));
    return Array.from(set).sort();
  }, [items]);

  // Optimistic per-row updates
  const patch = (id: string, p: Partial<ReviewImage>) =>
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const handleRate = async (row: ReviewImage, value: ImageRating) => {
    const next = value === row.rating ? 0 : value;
    patch(row.id, { rating: next });
    try {
      await setImageRating(row.id, next as ImageRating);
    } catch (e) {
      console.warn("rating failed", e);
      patch(row.id, { rating: row.rating });
    }
  };
  const handleFav = async (row: ReviewImage) => {
    const next = !row.is_favorite;
    patch(row.id, { is_favorite: next });
    try {
      await setImageFavorite(row.id, next);
    } catch (e) {
      console.warn("fav failed", e);
      patch(row.id, { is_favorite: row.is_favorite });
    }
  };
  const handleArchive = async (row: ReviewImage) => {
    const next = !row.is_archived;
    patch(row.id, { is_archived: next });
    try {
      await setImageArchived(row.id, next);
      // If we're hiding archived, drop it from view.
      if (next && !showArchived) {
        setItems((prev) => prev.filter((r) => r.id !== row.id));
      }
    } catch (e) {
      console.warn("archive failed", e);
      patch(row.id, { is_archived: row.is_archived });
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <section className="rounded-md border border-border bg-card p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div>
            <Label className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">
              Style
            </Label>
            <Select value={styleFilter} onValueChange={setStyleFilter}>
              <SelectTrigger className="font-display text-xs h-9 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={ALL} className="font-display text-xs">
                  All styles
                </SelectItem>
                {STYLE_KEYS.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="font-display text-xs">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">
              Provider
            </Label>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="font-display text-xs h-9 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} className="font-display text-xs">
                  All providers
                </SelectItem>
                {providerOptions.map((p) => (
                  <SelectItem key={p} value={p} className="font-display text-xs">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">
              Min rating
            </Label>
            <Select value={String(minRating)} onValueChange={(v) => setMinRating(Number(v))}>
              <SelectTrigger className="font-display text-xs h-9 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)} className="font-display text-xs">
                    {n === 0 ? "Any" : `${n}+ stars`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
              className="font-display text-xs w-full h-9"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
                  Refresh
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={favoritesOnly} onCheckedChange={setFavoritesOnly} />
            <span className="font-display text-xs">Favorites only</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} />
            <span className="font-display text-xs">Show archived</span>
          </label>
          <span className="font-display text-[11px] text-muted-foreground ml-auto">
            {items.length} image{items.length === 1 ? "" : "s"}
          </span>
        </div>
      </section>

      {/* Grid */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span className="font-display text-sm">Loading…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <p className="font-display text-sm text-muted-foreground">
            No images match these filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((row) => (
            <ReviewCard
              key={row.id}
              row={row}
              onOpen={() => setPreview(row)}
              onRate={(n) => handleRate(row, n)}
              onFav={() => handleFav(row)}
              onArchive={() => handleArchive(row)}
            />
          ))}
        </div>
      )}

      {/* Preview modal */}
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl p-0 bg-card overflow-hidden">
          {preview && (
            <div className="flex flex-col">
              <div className="bg-muted flex items-center justify-center max-h-[70vh] overflow-hidden">
                <img
                  src={preview.masterUrl}
                  alt={preview.prompt}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              </div>
              <div className="p-4 space-y-2">
                <p className="font-display text-sm text-foreground">{preview.prompt}</p>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground font-display">
                  <span className="uppercase tracking-wider">{preview.mode}</span>
                  {preview.generation_provider && (
                    <RouteBadge
                      provider={preview.generation_provider}
                      model={preview.generation_model ?? undefined}
                      route={preview.execution_route ?? undefined}
                      fallback={preview.fallback_used ?? false}
                      variant="compact"
                    />
                  )}
                  <span>{new Date(preview.created_at).toLocaleString()}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="absolute top-2 right-2 rounded-full bg-background/80 p-1.5 text-foreground hover:bg-background"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────────

interface ReviewCardProps {
  row: ReviewImage;
  onOpen: () => void;
  onRate: (n: ImageRating) => void;
  onFav: () => void;
  onArchive: () => void;
}

function ReviewCard({ row, onOpen, onRate, onFav, onArchive }: ReviewCardProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card overflow-hidden flex flex-col",
        row.is_archived && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="relative aspect-square bg-muted overflow-hidden group"
      >
        <img
          src={row.publicUrl}
          alt={row.prompt}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
        />
        {row.is_favorite && (
          <span className="absolute top-1.5 left-1.5 rounded-full bg-background/80 p-1 text-primary">
            <Heart className="h-3 w-3 fill-current" />
          </span>
        )}
        {row.is_archived && (
          <span className="absolute top-1.5 right-1.5 rounded-sm bg-background/80 px-1.5 py-0.5 text-[9px] font-display uppercase tracking-wider text-muted-foreground">
            Archived
          </span>
        )}
      </button>

      <div className="p-2 space-y-1.5">
        <p
          className="font-display text-[11px] text-foreground line-clamp-2 leading-tight min-h-[2.2em]"
          title={row.prompt}
        >
          {row.prompt}
        </p>
        <div className="flex items-center justify-between gap-1.5">
          <span className="font-display text-[9px] uppercase tracking-wider text-muted-foreground truncate">
            {row.mode}
          </span>
          {row.generation_provider && (
            <span className="font-display text-[9px] uppercase tracking-wider text-muted-foreground truncate">
              {row.generation_provider}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {([1, 2, 3, 4, 5] as ImageRating[]).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onRate(n)}
              className="p-0.5 text-muted-foreground hover:text-primary transition-colors"
              aria-label={`Rate ${n}`}
            >
              <Star
                className={cn(
                  "h-3 w-3",
                  n <= row.rating ? "fill-primary text-primary" : "fill-none",
                )}
              />
            </button>
          ))}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onFav}
            className={cn(
              "p-1 rounded-sm border transition-colors",
              row.is_favorite
                ? "bg-primary/15 border-primary/40 text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
            aria-label="Favorite"
            title="Favorite"
          >
            <Heart className={cn("h-3 w-3", row.is_favorite && "fill-current")} />
          </button>
          <button
            type="button"
            onClick={onArchive}
            className={cn(
              "p-1 rounded-sm border transition-colors",
              row.is_archived
                ? "bg-muted-foreground/15 border-muted-foreground/40 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
            aria-label={row.is_archived ? "Unarchive" : "Archive (reject)"}
            title={row.is_archived ? "Unarchive" : "Archive (reject)"}
          >
            <ArchiveIcon className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
