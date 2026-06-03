/**
 * Style Lab — Collections Workspace (Phase 5).
 *
 * Two views:
 *  - List: browse + sort + search collections with summary stats.
 *  - Detail: open one collection, filter contents, curate, export CSV.
 *
 * Reuses existing collections / collection_images tables and helpers.
 * No schema changes.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Ban,
  Copy,
  Download,
  FolderOpen,
  Heart,
  Loader2,
  RefreshCcw,
  Search,
  Star,
  Trash2,
  X,
  Archive as ArchiveIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import RouteBadge from "@/components/RouteBadge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

import {
  buildCollectionCsv,
  fetchCollectionImages,
  fetchCollectionsWithStats,
  setImageArchived,
  setImageFavorite,
  setImageRating,
  setImageRejected,
  type CollectionImage,
  type CollectionSummary,
  type ImageRating,
} from "@/lib/style-lab";
import { removeFromCollection } from "@/lib/collections";

type CollectionSort =
  | "name"
  | "imageCount"
  | "avgRating"
  | "favoriteCount"
  | "recent";

export default function CollectionsWorkspace() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [openName, setOpenName] = useState<string>("");

  if (openId) {
    return (
      <CollectionDetail
        collectionId={openId}
        collectionName={openName}
        onBack={() => setOpenId(null)}
      />
    );
  }
  return (
    <CollectionList
      onOpen={(id, name) => {
        setOpenId(id);
        setOpenName(name);
      }}
    />
  );
}

// ─── List view ─────────────────────────────────────────────────────────

interface CollectionListProps {
  onOpen: (id: string, name: string) => void;
}

function CollectionList({ onOpen }: CollectionListProps) {
  const { toast } = useToast();
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CollectionSort>("recent");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchCollectionsWithStats();
      setCollections(rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Failed to load collections", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? collections.filter((c) => c.name.toLowerCase().includes(q))
      : collections;
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case "name": return a.name.localeCompare(b.name);
        case "imageCount": return b.imageCount - a.imageCount;
        case "avgRating": return b.avgRating - a.avgRating;
        case "favoriteCount": return b.favoriteCount - a.favoriteCount;
        case "recent":
        default: return a.created_at < b.created_at ? 1 : -1;
      }
    });
    return sorted;
  }, [collections, search, sort]);

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-border bg-card p-3 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 sm:gap-3 items-end">
          <div>
            <Label className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">
              Search
            </Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Collection name…"
                className="font-display text-xs h-9 pl-8"
              />
            </div>
          </div>
          <div className="min-w-[160px]">
            <Label className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">
              Sort
            </Label>
            <Select value={sort} onValueChange={(v) => setSort(v as CollectionSort)}>
              <SelectTrigger className="font-display text-xs h-9 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent" className="font-display text-xs">Recently created</SelectItem>
                <SelectItem value="name" className="font-display text-xs">Name</SelectItem>
                <SelectItem value="imageCount" className="font-display text-xs">Image count</SelectItem>
                <SelectItem value="avgRating" className="font-display text-xs">Average rating</SelectItem>
                <SelectItem value="favoriteCount" className="font-display text-xs">Favorite count</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="font-display text-xs h-9"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </section>

      {loading && collections.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span className="font-display text-sm">Loading…</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16">
          <p className="font-display text-sm text-muted-foreground">
            {collections.length === 0
              ? "No collections yet. Create one from any image's collection menu."
              : "No collections match your search."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onOpen(c.id, c.name)}
              className="text-left rounded-md border border-border bg-card p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors space-y-3"
            >
              <div className="flex items-start gap-2">
                <FolderOpen className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-sm text-foreground truncate">{c.name}</h3>
                  <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                    {new Date(c.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <Stat label="Images" value={c.imageCount} />
                <Stat label="Avg ★" value={c.avgRating > 0 ? c.avgRating.toFixed(1) : "—"} />
                <Stat label="♥" value={c.favoriteCount} />
                <Stat label="Rej" value={c.rejectCount} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="font-display text-sm text-foreground">{value}</div>
      <div className="font-display text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

// ─── Detail view ───────────────────────────────────────────────────────

type ContentFilter = "all" | "favorites" | "rating4" | "rating5";
type ContentSort = "newest" | "oldest" | "highest" | "lowest";

interface CollectionDetailProps {
  collectionId: string;
  collectionName: string;
  onBack: () => void;
}

function CollectionDetail({ collectionId, collectionName, onBack }: CollectionDetailProps) {
  const { toast } = useToast();
  const [images, setImages] = useState<CollectionImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<ContentFilter>("all");
  const [sortBy, setSortBy] = useState<ContentSort>("newest");
  const [hideArchived, setHideArchived] = useState(true);
  const [hideRejected, setHideRejected] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<CollectionImage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchCollectionImages(collectionId);
      setImages(rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Failed to load collection", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [collectionId, toast]);

  useEffect(() => { void load(); }, [load]);

  const patch = (id: string, p: Partial<CollectionImage>) =>
    setImages((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const handleRate = async (row: CollectionImage, value: ImageRating) => {
    const next = (value === row.rating ? 0 : value) as ImageRating;
    patch(row.id, { rating: next });
    try { await setImageRating(row.id, next); } catch { patch(row.id, { rating: row.rating }); }
  };
  const handleFav = async (row: CollectionImage) => {
    const next = !row.is_favorite;
    patch(row.id, { is_favorite: next });
    try { await setImageFavorite(row.id, next); } catch { patch(row.id, { is_favorite: row.is_favorite }); }
  };
  const handleArchive = async (row: CollectionImage) => {
    const next = !row.is_archived;
    patch(row.id, { is_archived: next });
    try { await setImageArchived(row.id, next); } catch { patch(row.id, { is_archived: row.is_archived }); }
  };
  const handleReject = async (row: CollectionImage) => {
    const next = !row.is_rejected;
    patch(row.id, { is_rejected: next });
    try { await setImageRejected(row.id, next); } catch { patch(row.id, { is_rejected: row.is_rejected }); }
  };
  const handleRemove = async (row: CollectionImage) => {
    if (!window.confirm("Remove this image from the collection? The image itself is not deleted.")) return;
    try {
      await removeFromCollection(collectionId, row.id);
      setImages((prev) => prev.filter((r) => r.id !== row.id));
      setSelected((prev) => { const n = new Set(prev); n.delete(row.id); return n; });
      toast({ title: "Removed from collection", duration: 3000 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Failed to remove", description: msg, variant: "destructive" });
    }
  };

  // ── Stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let ratingSum = 0;
    let ratedCount = 0;
    let favoriteCount = 0;
    let rejectCount = 0;
    const providerCounts = new Map<string, number>();
    const styleCounts = new Map<string, number>();
    images.forEach((i) => {
      if (i.rating > 0) { ratingSum += i.rating; ratedCount += 1; }
      if (i.is_favorite) favoriteCount += 1;
      if (i.is_rejected) rejectCount += 1;
      const p = i.generation_provider ?? "unknown";
      providerCounts.set(p, (providerCounts.get(p) ?? 0) + 1);
      const s = i.mode || "unknown";
      styleCounts.set(s, (styleCounts.get(s) ?? 0) + 1);
    });
    const total = images.length;
    const toPct = (m: Map<string, number>) =>
      Array.from(m.entries())
        .map(([k, v]) => ({ key: k, count: v, pct: total > 0 ? (v / total) * 100 : 0 }))
        .sort((a, b) => b.count - a.count);
    return {
      total,
      avgRating: ratedCount > 0 ? ratingSum / ratedCount : 0,
      favoriteCount,
      rejectCount,
      rejectPct: total > 0 ? (rejectCount / total) * 100 : 0,
      providers: toPct(providerCounts),
      styles: toPct(styleCounts),
    };
  }, [images]);

  // ── Visible images ────────────────────────────────────────────────
  const visible = useMemo(() => {
    let out = images.slice();
    if (hideArchived) out = out.filter((i) => !i.is_archived);
    if (hideRejected) out = out.filter((i) => !i.is_rejected);
    switch (filter) {
      case "favorites": out = out.filter((i) => i.is_favorite); break;
      case "rating4": out = out.filter((i) => i.rating >= 4); break;
      case "rating5": out = out.filter((i) => i.rating === 5); break;
    }
    out.sort((a, b) => {
      switch (sortBy) {
        case "oldest": return a.created_at < b.created_at ? -1 : 1;
        case "highest": return b.rating - a.rating;
        case "lowest": return a.rating - b.rating;
        case "newest":
        default: return a.created_at < b.created_at ? 1 : -1;
      }
    });
    return out;
  }, [images, filter, sortBy, hideArchived, hideRejected]);

  const selectedImages = useMemo(
    () => visible.filter((i) => selected.has(i.id)),
    [visible, selected],
  );
  const allVisibleSelected = visible.length > 0 && visible.every((i) => selected.has(i.id));

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map((i) => i.id)));
    }
  };

  // ── Export actions ────────────────────────────────────────────────
  const exportCsv = () => {
    const subset = selectedImages.length > 0 ? selectedImages : visible;
    if (subset.length === 0) {
      toast({ title: "Nothing to export", variant: "destructive" });
      return;
    }
    const csv = buildCollectionCsv(subset);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = collectionName.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "collection";
    a.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported", description: `${subset.length} rows`, duration: 3000 });
  };

  const copyPrompts = async () => {
    const subset = selectedImages.length > 0 ? selectedImages : visible;
    if (subset.length === 0) {
      toast({ title: "Nothing to copy", variant: "destructive" });
      return;
    }
    await navigator.clipboard.writeText(subset.map((i) => i.prompt).join("\n"));
    toast({ title: "Prompts copied", description: `${subset.length} prompt(s)`, duration: 3000 });
  };

  const copyIds = async () => {
    const subset = selectedImages.length > 0 ? selectedImages : visible;
    if (subset.length === 0) {
      toast({ title: "Nothing to copy", variant: "destructive" });
      return;
    }
    await navigator.clipboard.writeText(subset.map((i) => i.id).join("\n"));
    toast({ title: "Image IDs copied", description: `${subset.length} id(s)`, duration: 3000 });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="rounded-md border border-border bg-card p-3 sm:p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="font-display text-xs h-8">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-base sm:text-lg text-foreground truncate">
              {collectionName}
            </h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="font-display text-xs h-8">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Stat label="Images" value={stats.total} />
          <Stat label="Avg ★" value={stats.avgRating > 0 ? stats.avgRating.toFixed(2) : "—"} />
          <Stat label="Favorites" value={stats.favoriteCount} />
          <Stat label="Rejected" value={stats.rejectCount} />
          <Stat label="Reject %" value={stats.total > 0 ? `${stats.rejectPct.toFixed(0)}%` : "—"} />
        </div>

        {(stats.providers.length > 0 || stats.styles.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <Breakdown title="Providers" items={stats.providers} />
            <Breakdown title="Styles" items={stats.styles} />
          </div>
        )}
      </section>

      {/* Filters & sort */}
      <section className="rounded-md border border-border bg-card p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div>
            <Label className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">Filter</Label>
            <Select value={filter} onValueChange={(v) => setFilter(v as ContentFilter)}>
              <SelectTrigger className="font-display text-xs h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-display text-xs">Show all</SelectItem>
                <SelectItem value="favorites" className="font-display text-xs">Favorites only</SelectItem>
                <SelectItem value="rating4" className="font-display text-xs">Rating 4+</SelectItem>
                <SelectItem value="rating5" className="font-display text-xs">Rating 5 only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">Sort</Label>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as ContentSort)}>
              <SelectTrigger className="font-display text-xs h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest" className="font-display text-xs">Newest</SelectItem>
                <SelectItem value="oldest" className="font-display text-xs">Oldest</SelectItem>
                <SelectItem value="highest" className="font-display text-xs">Highest rated</SelectItem>
                <SelectItem value="lowest" className="font-display text-xs">Lowest rated</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer sm:mt-5">
            <Switch checked={hideArchived} onCheckedChange={setHideArchived} />
            <span className="font-display text-xs">Hide archived</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer sm:mt-5">
            <Switch checked={hideRejected} onCheckedChange={setHideRejected} />
            <span className="font-display text-xs">Hide rejected</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} />
            <span className="font-display text-xs">
              {selected.size > 0 ? `${selected.size} selected` : "Select all"}
            </span>
          </label>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={exportCsv} className="font-display text-xs h-8">
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={copyPrompts} className="font-display text-xs h-8">
            <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy prompts
          </Button>
          <Button variant="outline" size="sm" onClick={copyIds} className="font-display text-xs h-8">
            <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy IDs
          </Button>
        </div>
      </section>

      {/* Grid */}
      {loading && images.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span className="font-display text-sm">Loading…</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16">
          <p className="font-display text-sm text-muted-foreground">
            {images.length === 0 ? "This collection is empty." : "No images match these filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {visible.map((row) => (
            <CollectionCard
              key={row.id}
              row={row}
              selected={selected.has(row.id)}
              onToggleSelect={() => toggleSelect(row.id)}
              onOpen={() => setPreview(row)}
              onRate={(n) => handleRate(row, n)}
              onFav={() => handleFav(row)}
              onArchive={() => handleArchive(row)}
              onReject={() => handleReject(row)}
              onRemove={() => handleRemove(row)}
            />
          ))}
        </div>
      )}

      {/* Preview */}
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

function Breakdown({ title, items }: { title: string; items: { key: string; count: number; pct: number }[] }) {
  return (
    <div className="space-y-1">
      <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="space-y-1">
        {items.slice(0, 5).map((it) => (
          <div key={it.key} className="flex items-center gap-2">
            <span className="font-display text-[11px] text-foreground truncate flex-1">{it.key}</span>
            <span className="font-display text-[11px] text-muted-foreground tabular-nums">
              {it.count} · {it.pct.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────

interface CollectionCardProps {
  row: CollectionImage;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onRate: (n: ImageRating) => void;
  onFav: () => void;
  onArchive: () => void;
  onReject: () => void;
  onRemove: () => void;
}

function CollectionCard({
  row,
  selected,
  onToggleSelect,
  onOpen,
  onRate,
  onFav,
  onArchive,
  onReject,
  onRemove,
}: CollectionCardProps) {
  return (
    <div
      className={cn(
        "rounded-md border bg-card overflow-hidden flex flex-col",
        (row.is_archived || row.is_rejected) && "opacity-60",
        row.is_rejected ? "border-destructive/40" : selected ? "border-primary" : "border-border",
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
        <span
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onToggleSelect(); } }}
          role="checkbox"
          aria-checked={selected}
          tabIndex={0}
          className="absolute top-1.5 left-1.5 rounded-sm bg-background/85 p-1 cursor-pointer"
        >
          <Checkbox checked={selected} className="h-3.5 w-3.5" />
        </span>
        {row.is_favorite && (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-background/80 p-1 text-primary">
            <Heart className="h-3 w-3 fill-current" />
          </span>
        )}
        {row.is_rejected && (
          <span className="absolute top-1.5 right-1.5 rounded-sm bg-destructive/80 px-1.5 py-0.5 text-[9px] font-display uppercase tracking-wider text-destructive-foreground">
            Rejected
          </span>
        )}
        {!row.is_rejected && row.is_archived && (
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
              <Star className={cn("h-3 w-3", n <= row.rating ? "fill-primary text-primary" : "fill-none")} />
            </button>
          ))}
          <div className="flex-1" />
          <IconBtn
            active={row.is_favorite}
            activeClass="bg-primary/15 border-primary/40 text-primary"
            onClick={onFav}
            label="Favorite"
          >
            <Heart className={cn("h-3 w-3", row.is_favorite && "fill-current")} />
          </IconBtn>
          <IconBtn
            active={row.is_archived}
            activeClass="bg-muted-foreground/15 border-muted-foreground/40 text-foreground"
            onClick={onArchive}
            label={row.is_archived ? "Unarchive" : "Archive"}
          >
            <ArchiveIcon className="h-3 w-3" />
          </IconBtn>
          <IconBtn
            active={row.is_rejected}
            activeClass="bg-destructive/15 border-destructive/40 text-destructive"
            onClick={onReject}
            label={row.is_rejected ? "Unreject" : "Reject"}
          >
            <Ban className="h-3 w-3" />
          </IconBtn>
          <IconBtn
            active={false}
            activeClass=""
            onClick={onRemove}
            label="Remove from collection"
          >
            <Trash2 className="h-3 w-3" />
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  active,
  activeClass,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active: boolean;
  activeClass: string;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "p-1 rounded-sm border transition-colors",
        active ? activeClass : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
