import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Download, Loader2, Trash2, Pencil, ChevronLeft, ChevronRight,
  Sun, FileText, Share2, CheckSquare, Square, Sparkles, Search,
} from "lucide-react";
import type { StyleConfig } from "@/lib/style-config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { fetchGalleryImages, deleteFromGallery, saveToGallery, replaceInGallery } from "@/lib/gallery";
import { fetchCollectionImageIds } from "@/lib/collections";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ImagePreviewMockups from "@/components/ImagePreviewMockups";
import CollectionsManager from "@/components/CollectionsManager";
import { useIsMobile } from "@/hooks/use-mobile";
import { Link } from "react-router-dom";
import JSZip from "jszip";

interface GalleryImage {
  id: string;
  prompt: string;
  mode: string;
  aspect_ratio: string;
  print_size: string | null;
  storage_path: string;
  created_at: string;
  publicUrl: string;
}

export interface EditRequest {
  prompt: string;
  imageUrl: string;
  mode: string;
  originalId: string;
  originalStoragePath: string;
}

const MODE_TO_EDGE_FN: Record<string, string> = {
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

const STYLE_CARDS = [
  { emoji: "🏯", label: "Ukiyo-e", desc: "Traditional Japanese woodblock prints", to: "/" },
  { emoji: "🎯", label: "Pop Art", desc: "Bold Ben-Day dots & vivid comic colour", to: "/popart" },
  { emoji: "✒️", label: "Line Art", desc: "Fine pen & ink with delicate detail", to: "/lineart" },
  { emoji: "◻", label: "Minimalism", desc: "Clean shapes & generous negative space", to: "/minimalism" },
  { emoji: "🎨", label: "Graffiti", desc: "Urban spray-paint energy & drips", to: "/graffiti" },
  { emoji: "🌿", label: "Botanical", desc: "Scientific watercolour plant studies", to: "/botanical" },
];

const downloadImage = async (url: string, filename: string) => {
  const res = await fetch(url);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(blobUrl);
};

// ── Skeleton grid ──────────────────────────────────────────────────────────────
function GallerySkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="aspect-square rounded-sm" />
      ))}
    </div>
  );
}

// ── Onboarding empty state ─────────────────────────────────────────────────────
function GalleryOnboarding() {
  return (
    <div className="py-10 space-y-8">
      <div className="text-center space-y-2">
        <Sparkles className="h-10 w-10 text-primary mx-auto" />
        <h3 className="font-display text-xl font-bold text-foreground">Start creating artwork</h3>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Choose an art style below, describe a scene, and generate your first print-ready image.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {STYLE_CARDS.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="rounded-sm border border-border bg-card hover:border-primary hover:shadow-md transition-all duration-200 p-4 flex flex-col gap-1 group"
          >
            <span className="text-2xl">{s.emoji}</span>
            <span className="font-display text-sm font-bold text-foreground group-hover:text-primary transition-colors">
              {s.label}
            </span>
            <span className="font-display text-[11px] text-muted-foreground leading-tight">
              {s.desc}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Lightbox content (shared between dialog & drawer) ─────────────────────────
interface LightboxContentProps {
  img: GalleryImage;
  onEdit?: () => void;
  onDelete: () => void;
  onCopyUrl: () => void;
  onChangeBg: (style: "white" | "cream") => void;
  onSaveBg: (replace: boolean) => void;
  onDiscardBg: () => void;
  bgChanging: "white" | "cream" | null;
  bgResult: { imageUrl: string; bgStyle: string } | null;
  showEdit: boolean;
}

function LightboxContent({
  img, onEdit, onDelete, onCopyUrl,
  onChangeBg, onSaveBg, onDiscardBg,
  bgChanging, bgResult, showEdit,
}: LightboxContentProps) {
  return (
    <div className="space-y-4">
      <ImagePreviewMockups imageUrl={img.publicUrl} alt={img.prompt} />
      <div className="space-y-2">
        <p className="font-display text-sm text-foreground">{img.prompt}</p>
        <div className="flex flex-wrap gap-2 items-center">
          <Badge variant="secondary" className="font-display text-xs">{img.mode}</Badge>
          <Badge variant="outline" className="font-display text-xs">{img.aspect_ratio}</Badge>
          {img.print_size && (
            <Badge variant="outline" className="font-display text-xs">{img.print_size}</Badge>
          )}
          <span className="text-xs text-muted-foreground font-display">
            {new Date(img.created_at).toLocaleDateString()}
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => downloadImage(img.publicUrl, `art-${img.id}.png`)} className="font-display text-xs">
            <Download className="mr-2 h-4 w-4" /> Download
          </Button>
          <Button variant="outline" size="sm" onClick={onCopyUrl} className="font-display text-xs">
            <Share2 className="mr-2 h-4 w-4" /> Copy URL
          </Button>
          {showEdit && onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit} className="font-display text-xs">
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={onDelete} className="font-display text-xs">
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </Button>
        </div>

        {/* Collections */}
        <div className="pt-3 border-t border-border">
          <CollectionsManager imageId={img.id} />
        </div>

        {/* Background change */}
        {MODE_TO_EDGE_FN[img.mode] && !bgResult && (
          <div className="pt-3 border-t border-border">
            <p className="font-display text-xs text-muted-foreground mb-2">Change background color</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!!bgChanging} onClick={() => onChangeBg("white")} className="font-display text-xs">
                {bgChanging === "white" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sun className="mr-2 h-4 w-4" />}
                Pure White
              </Button>
              <Button variant="outline" size="sm" disabled={!!bgChanging} onClick={() => onChangeBg("cream")} className="font-display text-xs">
                {bgChanging === "cream" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Cream Paper
              </Button>
            </div>
            {bgChanging && (
              <p className="font-display text-xs text-muted-foreground mt-2 animate-pulse">
                Regenerating with {bgChanging === "white" ? "pure white" : "cream"} background…
              </p>
            )}
          </div>
        )}

        {/* BG result */}
        {bgResult && (
          <div className="pt-3 border-t border-border space-y-3">
            <p className="font-display text-xs text-muted-foreground">
              New version with {bgResult.bgStyle === "white" ? "pure white" : "cream"} background:
            </p>
            <div className="rounded-sm border border-border overflow-hidden">
              <img src={bgResult.imageUrl} alt="New background" className="w-full max-h-[40vh] object-contain bg-muted" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!!bgChanging} onClick={() => onSaveBg(false)} className="font-display text-xs">Save as New</Button>
              <Button variant="outline" size="sm" disabled={!!bgChanging} onClick={() => onSaveBg(true)} className="font-display text-xs">Replace Original</Button>
              <Button variant="ghost" size="sm" onClick={onDiscardBg} className="font-display text-xs">Discard</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Gallery ──────────────────────────────────────────────────────────────
interface GalleryProps {
  refreshKey: number;
  onEditImage?: (req: EditRequest) => void;
  styleConfig?: StyleConfig;
}

export default function Gallery({ refreshKey, onEditImage, styleConfig }: GalleryProps) {
  const isMobile = useIsMobile();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GalleryImage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GalleryImage | null>(null);
  const [deleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 9;

  const [modeFilter, setModeFilter] = useState("all");
  const [ratioFilter, setRatioFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [bgChanging, setBgChanging] = useState<"white" | "cream" | null>(null);
  const [bgResult, setBgResult] = useState<{ imageUrl: string; bgStyle: string } | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const [collectionFilter, setCollectionFilter] = useState<string | null>(null);
  const [collectionImageIds, setCollectionImageIds] = useState<string[] | null>(null);

  const styleModes = styleConfig
    ? [styleConfig.themedModeValue, styleConfig.freestyleModeValue, ...(styleConfig.tertiaryModeValue ? [styleConfig.tertiaryModeValue] : [])]
    : null;

  useEffect(() => {
    setLoading(true);
    fetchGalleryImages()
      .then((imgs) => setImages(styleModes ? imgs.filter((img: any) => styleModes.includes(img.mode)) : imgs))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useEffect(() => {
    if (collectionFilter) {
      fetchCollectionImageIds(collectionFilter).then(setCollectionImageIds).catch(console.error);
    } else {
      setCollectionImageIds(null);
    }
  }, [collectionFilter, refreshKey]);

  useEffect(() => { setCurrentPage(1); }, [modeFilter, ratioFilter, collectionFilter, searchQuery]);

  const uniqueRatios = useMemo(
    () => [...new Set(images.map((img) => img.aspect_ratio))].sort(),
    [images]
  );

  const searchLower = searchQuery.toLowerCase().trim();
  const filtered = useMemo(
    () =>
      images.filter(
        (img) =>
          (modeFilter === "all" || img.mode === modeFilter) &&
          (ratioFilter === "all" || img.aspect_ratio === ratioFilter) &&
          (collectionImageIds === null || collectionImageIds.includes(img.id)) &&
          (searchLower === "" || img.prompt.toLowerCase().includes(searchLower))
      ),
    [images, modeFilter, ratioFilter, collectionImageIds, searchLower]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [filtered, currentPage]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const handleBatchDownload = async () => {
    if (selectedIds.size === 0) return;
    setDownloading(true);
    try {
      const zip = new JSZip();
      const selectedImages = images.filter((img) => selectedIds.has(img.id));
      await Promise.all(
        selectedImages.map(async (img, i) => {
          const res = await fetch(img.publicUrl);
          const blob = await res.blob();
          zip.file(`art-${i + 1}-${img.mode}.png`, blob);
        })
      );
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `artwork-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setSelectMode(false);
      setSelectedIds(new Set());
      toast.success(`Downloaded ${selectedImages.length} images`, { duration: 3000 });
    } catch (e) {
      console.error(e);
      toast.error("Failed to create ZIP");
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(
      () => toast.success("Image URL copied!", { duration: 3000 }),
      () => toast.error("Failed to copy URL")
    );
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setImages((prev) => prev.filter((img) => img.id !== target.id));
    if (selected?.id === target.id) setSelected(null);

    const timer = setTimeout(async () => {
      try { await deleteFromGallery(target.id, target.storage_path); }
      catch { setImages((prev) => [target, ...prev]); toast.error("Failed to delete image"); }
    }, 5000);

    toast.success("Image deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timer);
          setImages((prev) => [target, ...prev].sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
          toast.info("Delete undone");
        },
      },
      duration: 5000,
    });
  };

  useEffect(() => {
    if (selected && !isMobile) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [selected, isMobile]);

  const selectedIndex = selected ? filtered.findIndex((img) => img.id === selected.id) : -1;
  const goPrev = useCallback(() => {
    if (selectedIndex > 0) setSelected(filtered[selectedIndex - 1]);
  }, [selectedIndex, filtered]);
  const goNext = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < filtered.length - 1) setSelected(filtered[selectedIndex + 1]);
  }, [selectedIndex, filtered]);

  useEffect(() => {
    if (!selected) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, goPrev, goNext]);

  const handleEdit = (img: GalleryImage) => {
    setSelected(null);
    onEditImage?.({
      prompt: img.prompt,
      imageUrl: img.publicUrl,
      mode: img.mode,
      originalId: img.id,
      originalStoragePath: img.storage_path,
    });
  };

  const handleChangeBackground = async (img: GalleryImage, bgStyle: "white" | "cream") => {
    const edgeFn = MODE_TO_EDGE_FN[img.mode];
    if (!edgeFn) { toast.error("Background change not supported for this style"); return; }
    setBgChanging(bgStyle);
    setBgResult(null);
    try {
      const prompt = bgStyle === "white"
        ? "Change ONLY the background to pure white (#FFFFFF). Keep everything else exactly the same — same subject, same composition, same colors, same style, same details. Do NOT alter the artwork itself in any way."
        : "Change ONLY the background to a warm cream/off-white vintage paper tone. Keep everything else exactly the same — same subject, same composition, same colors, same style, same details. Do NOT alter the artwork itself in any way.";
      const { data, error } = await supabase.functions.invoke(edgeFn, {
        body: { prompt, sourceImageUrl: img.publicUrl, aspectRatio: img.aspect_ratio, whiteFrame: false, backgroundStyle: bgStyle },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.imageUrl) throw new Error("No image generated");
      setBgResult({ imageUrl: data.imageUrl, bgStyle });
      toast.success(`${bgStyle === "white" ? "White" : "Cream"} background generated! Save or replace below.`, { duration: 3000 });
    } catch (err: any) {
      toast.error(err.message || "Failed to change background");
    } finally {
      setBgChanging(null);
    }
  };

  const handleSaveBgResult = async (img: GalleryImage, replace: boolean) => {
    if (!bgResult) return;
    setBgChanging("white");
    try {
      const newPrompt = `${img.prompt} | BG: ${bgResult.bgStyle}`;
      if (replace) {
        await replaceInGallery({ originalId: img.id, originalStoragePath: img.storage_path, imageUrl: bgResult.imageUrl, prompt: newPrompt, mode: img.mode, aspectRatio: img.aspect_ratio, printSize: img.print_size || "" });
        toast.success("Original replaced with new background", { duration: 3000 });
      } else {
        await saveToGallery({ imageUrl: bgResult.imageUrl, prompt: newPrompt, mode: img.mode, aspectRatio: img.aspect_ratio, printSize: img.print_size || "" });
        toast.success("Saved as new image", { duration: 3000 });
      }
      setBgResult(null);
      setSelected(null);
      setLoading(true);
      fetchGalleryImages()
        .then((imgs) => setImages(styleModes ? imgs.filter((img: any) => styleModes.includes(img.mode)) : imgs))
        .catch(console.error)
        .finally(() => setLoading(false));
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setBgChanging(null);
    }
  };

  useEffect(() => { setBgResult(null); }, [selected?.id]);

  if (loading) return <GallerySkeleton />;
  if (images.length === 0) return <GalleryOnboarding />;

  const lightboxProps = selected ? {
    img: selected,
    onEdit: onEditImage ? () => handleEdit(selected) : undefined,
    onDelete: () => setDeleteTarget(selected),
    onCopyUrl: () => handleCopyUrl(selected.publicUrl),
    onChangeBg: (style: "white" | "cream") => handleChangeBackground(selected, style),
    onSaveBg: (replace: boolean) => handleSaveBgResult(selected, replace),
    onDiscardBg: () => setBgResult(null),
    bgChanging,
    bgResult,
    showEdit: !!onEditImage,
  } : null;

  return (
    <>
      {/* Collections filter bar */}
      <div className="mb-3">
        <CollectionsManager onFilterChange={setCollectionFilter} activeFilter={collectionFilter} />
      </div>

      {/* Filters + Batch + Pagination */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search prompts…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-[160px] sm:w-[200px] font-display text-xs h-8 pl-7"
          />
        </div>

        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-[120px] font-display text-xs h-8"><SelectValue placeholder="Mode" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="japanese">🏯 Japanese</SelectItem>
            <SelectItem value="freestyle">🎨 Freestyle</SelectItem>
          </SelectContent>
        </Select>

        <Select value={ratioFilter} onValueChange={setRatioFilter}>
          <SelectTrigger className="w-[110px] font-display text-xs h-8"><SelectValue placeholder="Ratio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ratios</SelectItem>
            {uniqueRatios.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>

        {(modeFilter !== "all" || ratioFilter !== "all" || searchQuery !== "") && (
          <Button variant="ghost" size="sm" className="font-display text-xs h-8 px-2"
            onClick={() => { setModeFilter("all"); setRatioFilter("all"); setSearchQuery(""); }}>✕</Button>
        )}

        <Button
          variant={selectMode ? "default" : "outline"} size="sm"
          className="font-display text-xs h-8 px-2"
          onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
        >
          {selectMode ? <CheckSquare className="h-3 w-3 mr-1" /> : <Square className="h-3 w-3 mr-1" />}
          Select
        </Button>

        {selectMode && selectedIds.size > 0 && (
          <Button size="sm" className="font-display text-xs h-8" onClick={handleBatchDownload} disabled={downloading}>
            {downloading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
            Download {selectedIds.size} as ZIP
          </Button>
        )}

        {totalPages > 1 && (
          <div className="flex items-center gap-1 ml-auto">
            <Button variant="outline" size="sm" className="font-display text-xs h-8 px-2"
              disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>‹</Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button key={page} variant={page === currentPage ? "default" : "outline"} size="sm"
                className="font-display text-xs h-8 min-w-[1.75rem] px-1" onClick={() => setCurrentPage(page)}>{page}</Button>
            ))}
            <Button variant="outline" size="sm" className="font-display text-xs h-8 px-2"
              disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}>›</Button>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm font-display py-8">
          No images match the selected filters.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
          {paginated.map((img) => (
            <div key={img.id} className="relative group">
              <button
                onClick={() => selectMode ? toggleSelect(img.id) : setSelected(img)}
                className="relative overflow-hidden rounded-sm border border-border bg-card hover:border-primary transition-all duration-200 hover:shadow-lg block w-full cursor-pointer aspect-square"
              >
                <img src={img.publicUrl} alt={img.prompt} className="w-full h-full object-cover block"
                  style={{ imageRendering: "auto" }} decoding="async" loading="lazy"
                  sizes="(min-width: 768px) 33vw, (min-width: 640px) 33vw, 50vw" />
                {!selectMode && (
                  <div className="absolute inset-0 bg-card opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center p-2 z-20">
                    <img src={img.publicUrl} alt={img.prompt} className="max-w-full max-h-[75%] object-contain rounded-sm" />
                    <p className="mt-2 text-[10px] text-muted-foreground font-display line-clamp-2 text-center px-1">{img.prompt}</p>
                  </div>
                )}
                {selectMode && (
                  <div className="absolute top-2 left-2 z-30">
                    {selectedIds.has(img.id)
                      ? <CheckSquare className="h-5 w-5 text-primary" />
                      : <Square className="h-5 w-5 text-muted-foreground" />}
                  </div>
                )}
                <Badge variant="secondary" className="absolute top-1.5 right-1.5 text-[10px] font-display opacity-80 z-30">
                  {img.mode === "japanese" ? "🏯" : "🎨"}
                </Badge>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Lightbox: Drawer on mobile, Dialog on desktop ── */}
      {selected && lightboxProps && (
        isMobile ? (
          <Drawer open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
            <DrawerContent className="max-h-[92vh] overflow-y-auto px-4 pb-6">
              <DrawerHeader className="pb-2">
                <DrawerTitle className="font-display text-sm text-left line-clamp-1">{selected.prompt}</DrawerTitle>
              </DrawerHeader>
              {/* Prev / Next on mobile */}
              <div className="flex justify-between mb-3">
                <Button variant="outline" size="sm" disabled={selectedIndex === 0} onClick={goPrev} className="font-display text-xs h-7">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-display text-xs text-muted-foreground self-center">{selectedIndex + 1} / {filtered.length}</span>
                <Button variant="outline" size="sm" disabled={selectedIndex >= filtered.length - 1} onClick={goNext} className="font-display text-xs h-7">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <LightboxContent {...lightboxProps} />
            </DrawerContent>
          </Drawer>
        ) : (
          <div className="fixed inset-0 z-50 bg-foreground/80 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
            {selectedIndex > 0 && (
              <button onClick={(e) => { e.stopPropagation(); goPrev(); }}
                className="fixed left-2 top-1/2 -translate-y-1/2 z-[60] p-2 rounded-full bg-card/80 backdrop-blur-sm border border-border hover:bg-card transition-colors">
                <ChevronLeft className="h-6 w-6 text-foreground" />
              </button>
            )}
            {selectedIndex < filtered.length - 1 && (
              <button onClick={(e) => { e.stopPropagation(); goNext(); }}
                className="fixed right-2 top-1/2 -translate-y-1/2 z-[60] p-2 rounded-full bg-card/80 backdrop-blur-sm border border-border hover:bg-card transition-colors">
                <ChevronRight className="h-6 w-6 text-foreground" />
              </button>
            )}
            <div className="bg-card rounded-sm border border-border max-w-3xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 space-y-4 fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setSelected(null)}
                className="absolute top-3 right-3 z-10 p-1.5 rounded-sm hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">✕</button>
              <LightboxContent {...lightboxProps} />
            </div>
          </div>
        )
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Delete image?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the image. You'll have 5 seconds to undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} disabled={deleting}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
