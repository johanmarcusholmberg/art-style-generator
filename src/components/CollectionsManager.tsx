import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, FolderOpen, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  fetchCollections,
  createCollection,
  deleteCollection,
  renameCollection,
  addToCollection,
  removeFromCollection,
  fetchCollectionImageIds,
  type Collection,
} from "@/lib/collections";
import { toast } from "sonner";

interface CollectionsManagerProps {
  /** When provided, shows add/remove UI for this image */
  imageId?: string;
  /** Callback when a collection filter is selected (null = show all) */
  onFilterChange?: (collectionId: string | null) => void;
  activeFilter?: string | null;
}

export default function CollectionsManager({ imageId, onFilterChange, activeFilter }: CollectionsManagerProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [imageCollections, setImageCollections] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const cols = await fetchCollections();
      setCollections(cols);
      if (imageId) {
        // Check which collections contain this image
        const promises = cols.map(async (c) => {
          const ids = await fetchCollectionImageIds(c.id);
          return ids.includes(imageId) ? c.id : null;
        });
        const results = await Promise.all(promises);
        setImageCollections(new Set(results.filter(Boolean) as string[]));
      }
    } catch (e) {
      console.error(e);
    }
  }, [imageId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createCollection(newName.trim());
      setNewName("");
      await load();
      toast.success("Collection created", { duration: 3000 });
    } catch {
      toast.error("Failed to create collection");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCollection(id);
      if (activeFilter === id) onFilterChange?.(null);
      await load();
      toast.success("Collection deleted", { duration: 3000 });
    } catch {
      toast.error("Failed to delete collection");
    }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await renameCollection(id, editName.trim());
      setEditingId(null);
      await load();
    } catch {
      toast.error("Failed to rename");
    }
  };

  const handleToggleImage = async (collectionId: string) => {
    if (!imageId) return;
    try {
      if (imageCollections.has(collectionId)) {
        await removeFromCollection(collectionId, imageId);
        setImageCollections((prev) => { const n = new Set(prev); n.delete(collectionId); return n; });
        toast.success("Removed from collection", { duration: 3000 });
      } else {
        await addToCollection(collectionId, imageId);
        setImageCollections((prev) => new Set(prev).add(collectionId));
        toast.success("Added to collection", { duration: 3000 });
      }
    } catch {
      toast.error("Failed to update collection");
    }
  };

  // If used as a filter bar (no imageId), render inline badges
  if (!imageId) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={activeFilter === null ? "default" : "outline"}
          className="cursor-pointer font-display text-xs"
          onClick={() => onFilterChange?.(null)}
        >
          All
        </Badge>
        {collections.map((c) => (
          <Badge
            key={c.id}
            variant={activeFilter === c.id ? "default" : "outline"}
            className="cursor-pointer font-display text-xs"
            onClick={() => onFilterChange?.(c.id)}
          >
            <FolderOpen className="h-3 w-3 mr-1" />
            {c.name}
          </Badge>
        ))}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Badge variant="outline" className="cursor-pointer font-display text-xs">
              <Plus className="h-3 w-3 mr-1" /> New
            </Badge>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display">Manage Collections</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="New collection name…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  className="font-display text-xs h-8"
                />
                <Button size="sm" onClick={handleCreate} className="h-8 font-display text-xs">
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {collections.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  {editingId === c.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="font-display text-xs h-7 flex-1"
                        onKeyDown={(e) => e.key === "Enter" && handleRename(c.id)}
                      />
                      <Button variant="ghost" size="sm" className="h-7 px-1" onClick={() => handleRename(c.id)}>
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-1" onClick={() => setEditingId(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="font-display text-xs flex-1">{c.name}</span>
                      <Button variant="ghost" size="sm" className="h-7 px-1" onClick={() => { setEditingId(c.id); setEditName(c.name); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-1 text-destructive" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Image-specific: show which collections this image belongs to
  return (
    <div className="space-y-2">
      <p className="font-display text-xs text-muted-foreground">Collections</p>
      <div className="flex flex-wrap gap-2">
        {collections.map((c) => (
          <Badge
            key={c.id}
            variant={imageCollections.has(c.id) ? "default" : "outline"}
            className="cursor-pointer font-display text-xs"
            onClick={() => handleToggleImage(c.id)}
          >
            <FolderOpen className="h-3 w-3 mr-1" />
            {c.name}
            {imageCollections.has(c.id) && <Check className="h-3 w-3 ml-1" />}
          </Badge>
        ))}
        {collections.length === 0 && (
          <span className="text-xs text-muted-foreground font-display">No collections yet</span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="New collection…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          className="font-display text-xs h-7 max-w-[200px]"
        />
        <Button variant="outline" size="sm" onClick={handleCreate} className="h-7 font-display text-xs" disabled={!newName.trim()}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
