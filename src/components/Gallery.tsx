import { useState, useEffect, useMemo, useCallback } from "react";
import { Download, Loader2, Image as ImageIcon, Trash2, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchGalleryImages, deleteFromGallery } from "@/lib/gallery";
import { toast } from "sonner";
import ImagePreviewMockups from "@/components/ImagePreviewMockups";

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
  mode: "japanese" | "freestyle";
  originalId: string;
  originalStoragePath: string;
}

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

interface GalleryProps {
  refreshKey: number;
  onEditImage?: (req: EditRequest) => void;
}

export default function Gallery({ refreshKey, onEditImage }: GalleryProps) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GalleryImage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GalleryImage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [undoTarget, setUndoTarget] = useState<GalleryImage | null>(null);
  const [undoTimer, setUndoTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 9;

  const [modeFilter, setModeFilter] = useState("all");
  const [ratioFilter, setRatioFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    fetchGalleryImages()
      .then(setImages)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useEffect(() => { setCurrentPage(1); }, [modeFilter, ratioFilter]);

  const uniqueRatios = useMemo(
    () => [...new Set(images.map((img) => img.aspect_ratio))].sort(),
    [images]
  );

  const filtered = useMemo(
    () =>
      images.filter(
        (img) =>
          (modeFilter === "all" || img.mode === modeFilter) &&
          (ratioFilter === "all" || img.aspect_ratio === ratioFilter)
      ),
    [images, modeFilter, ratioFilter]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [filtered, currentPage]
  );

  // Soft delete with undo
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);

    // Optimistically remove from UI
    setImages((prev) => prev.filter((img) => img.id !== target.id));
    if (selected?.id === target.id) setSelected(null);

    // Show undo toast
    setUndoTarget(target);
    const timer = setTimeout(async () => {
      // Actually delete after undo window
      try {
        await deleteFromGallery(target.id, target.storage_path);
      } catch (e) {
        console.error(e);
        // Restore on failure
        setImages((prev) => [target, ...prev]);
        toast.error("Failed to delete image");
      }
      setUndoTarget(null);
    }, 5000);
    setUndoTimer(timer);

    toast.success("Image deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timer);
          setImages((prev) => [target, ...prev].sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          ));
          setUndoTarget(null);
          toast.info("Delete undone");
        },
      },
      duration: 5000,
    });
  };

  // Lock body scroll when lightbox is open
  useEffect(() => {
    if (selected) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [selected]);

  // Navigate between filtered images
  const selectedIndex = selected ? filtered.findIndex((img) => img.id === selected.id) : -1;
  const goPrev = useCallback(() => {
    if (selectedIndex > 0) setSelected(filtered[selectedIndex - 1]);
  }, [selectedIndex, filtered]);
  const goNext = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < filtered.length - 1) setSelected(filtered[selectedIndex + 1]);
  }, [selectedIndex, filtered]);

  // Keyboard navigation
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
      mode: img.mode as "japanese" | "freestyle",
      originalId: img.id,
      originalStoragePath: img.storage_path,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <ImageIcon className="h-10 w-10" />
        <p className="font-display text-sm">No artwork yet. Generate your first image!</p>
      </div>
    );
  }

  return (
    <>
      {/* Filters + Pagination on one row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-[120px] font-display text-xs h-8">
            <SelectValue placeholder="Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="japanese">🏯 Japanese</SelectItem>
            <SelectItem value="freestyle">🎨 Freestyle</SelectItem>
          </SelectContent>
        </Select>

        <Select value={ratioFilter} onValueChange={setRatioFilter}>
          <SelectTrigger className="w-[110px] font-display text-xs h-8">
            <SelectValue placeholder="Ratio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ratios</SelectItem>
            {uniqueRatios.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(modeFilter !== "all" || ratioFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="font-display text-xs h-8 px-2"
            onClick={() => { setModeFilter("all"); setRatioFilter("all"); }}
          >
            ✕
          </Button>
        )}

        {totalPages > 1 && (
          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="font-display text-xs h-8 px-2"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              ‹
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                variant={page === currentPage ? "default" : "outline"}
                size="sm"
                className="font-display text-xs h-8 min-w-[1.75rem] px-1"
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="font-display text-xs h-8 px-2"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              ›
            </Button>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm font-display py-8">
          No images match the selected filters.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-5">
          {paginated.map((img) => (
            <div key={img.id} className="relative group">
              <button
                onClick={() => setSelected(img)}
                className="relative overflow-hidden rounded-sm border border-border bg-card hover:border-primary transition-all duration-200 hover:shadow-lg block w-full cursor-pointer aspect-square"
              >
                <img
                  src={img.publicUrl}
                  alt={img.prompt}
                  className="w-full h-full object-cover block"
                  style={{ imageRendering: "auto" }}
                  decoding="async"
                  sizes="(min-width: 768px) 33vw, (min-width: 640px) 33vw, 50vw"
                  loading="lazy"
                />
                {/* Hover: show full image + prompt */}
                <div className="absolute inset-0 bg-card opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center p-2 z-20">
                  <img
                    src={img.publicUrl}
                    alt={img.prompt}
                    className="max-w-full max-h-[75%] object-contain rounded-sm"
                  />
                  <p className="mt-2 text-[10px] text-muted-foreground font-display line-clamp-2 text-center px-1">
                    {img.prompt}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className="absolute top-1.5 right-1.5 text-[10px] font-display opacity-80 z-30"
                >
                  {img.mode === "japanese" ? "🏯" : "🎨"}
                </Badge>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-foreground/80 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          {/* Prev arrow */}
          {selectedIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              className="fixed left-2 top-1/2 -translate-y-1/2 z-[60] p-2 rounded-full bg-card/80 backdrop-blur-sm border border-border hover:bg-card transition-colors"
            >
              <ChevronLeft className="h-6 w-6 text-foreground" />
            </button>
          )}
          {/* Next arrow */}
          {selectedIndex < filtered.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goNext(); }}
              className="fixed right-2 top-1/2 -translate-y-1/2 z-[60] p-2 rounded-full bg-card/80 backdrop-blur-sm border border-border hover:bg-card transition-colors"
            >
              <ChevronRight className="h-6 w-6 text-foreground" />
            </button>
          )}
          <div
            className="bg-card rounded-sm border border-border max-w-3xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 space-y-4 fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close X in top-right */}
            <button
              onClick={() => setSelected(null)}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-sm hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>

            <ImagePreviewMockups imageUrl={selected.publicUrl} alt={selected.prompt} />
            <div className="space-y-2">
              <p className="font-display text-sm text-foreground">{selected.prompt}</p>
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant="secondary" className="font-display text-xs">
                  {selected.mode === "japanese" ? "🏯 Japanese" : "🎨 Freestyle"}
                </Badge>
                <Badge variant="outline" className="font-display text-xs">
                  {selected.aspect_ratio}
                </Badge>
                {selected.print_size && (
                  <Badge variant="outline" className="font-display text-xs">
                    {selected.print_size}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground font-display">
                  {new Date(selected.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadImage(selected.publicUrl, `ukiyoe-${selected.id}.png`)}
                  className="font-display text-xs"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
                {onEditImage && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(selected)}
                    className="font-display text-xs"
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit with new prompt
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteTarget(selected)}
                  className="font-display text-xs"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Delete image?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the image from storage. You'll have 5 seconds to undo after confirming.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} disabled={deleting}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
