import { useState, useEffect, useMemo, useCallback } from "react";
import { Download, Loader2, Image as ImageIcon, Trash2, Pencil } from "lucide-react";
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
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [modeFilter, setModeFilter] = useState("all");
  const [ratioFilter, setRatioFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    fetchGalleryImages()
      .then(setImages)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  // Reset to page 1 when filters change
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteFromGallery(deleteTarget.id, deleteTarget.storage_path);
      setImages((prev) => prev.filter((img) => img.id !== deleteTarget.id));
      if (selected?.id === deleteTarget.id) setSelected(null);
      toast.success("Image deleted");
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete image");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleEdit = (img: GalleryImage) => {
    setSelected(null);
    onEditImage?.({
      prompt: img.prompt,
      imageUrl: img.publicUrl,
      mode: img.mode as "japanese" | "freestyle",
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
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-[150px] font-display text-xs h-9">
            <SelectValue placeholder="Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="japanese">🏯 Japanese</SelectItem>
            <SelectItem value="freestyle">🎨 Freestyle</SelectItem>
          </SelectContent>
        </Select>

        <Select value={ratioFilter} onValueChange={setRatioFilter}>
          <SelectTrigger className="w-[150px] font-display text-xs h-9">
            <SelectValue placeholder="Aspect Ratio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ratios</SelectItem>
            {uniqueRatios.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(modeFilter !== "all" || ratioFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="font-display text-xs h-9"
            onClick={() => {
              setModeFilter("all");
              setRatioFilter("all");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm font-display py-8">
          No images match the selected filters.
        </p>
      ) : (
        <>
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
                    loading="lazy"
                  />
                  <Badge
                    variant="secondary"
                    className="absolute top-1.5 right-1.5 text-[10px] font-display opacity-80 z-10"
                  >
                    {img.mode === "japanese" ? "🏯" : "🎨"}
                  </Badge>
                </button>
                {/* Hover preview tooltip */}
                <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 hidden group-hover:block w-64 max-w-xs">
                  <div className="bg-card border border-border rounded-sm shadow-xl p-2 space-y-1">
                    <img
                      src={img.publicUrl}
                      alt={img.prompt}
                      className="w-full h-auto rounded-sm object-contain max-h-64"
                    />
                    <p className="text-[11px] font-display text-muted-foreground line-clamp-2">{img.prompt}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 mt-6 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="font-display text-xs"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                ‹ Föregående
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <Button
                  key={page}
                  variant={page === currentPage ? "default" : "outline"}
                  size="sm"
                  className="font-display text-xs min-w-[2rem]"
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="font-display text-xs"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Nästa ›
              </Button>
            </div>
          )}
        </>
      )}

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-foreground/80 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-card rounded-sm border border-border max-w-3xl w-full max-h-[90vh] overflow-auto p-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(null)}
                  className="font-display text-xs"
                >
                  Close
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
              This will permanently remove the image from storage and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
