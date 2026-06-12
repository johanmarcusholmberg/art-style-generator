/**
 * Prompt History panel — compact reusable library shown near the
 * generator prompt input. Lets the creator search, filter (by current
 * mode / favorites), reuse, copy, favorite, or delete past prompts.
 *
 * Scope-limited per the Prompt History Library spec — does NOT alter
 * generation behavior; it only writes back into the prompt textarea
 * through the `onUsePrompt` callback.
 */
import { useEffect, useState, useCallback } from "react";
import { History, Search, Copy, Star, Trash2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import {
  fetchPromptHistory,
  togglePromptHistoryFavorite,
  deletePromptHistory,
  type PromptHistoryEntry,
} from "@/lib/prompt-history";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface PromptHistoryPanelProps {
  /** Current style/mode, used to scope the default filter. */
  mode: string;
  /** Called when the user clicks "Use" on a prompt row. */
  onUsePrompt: (prompt: string) => void;
  /** Bumped externally to trigger a refetch (e.g. after a new save). */
  refreshKey?: number;
  /** Optional className for outer wrapper. */
  className?: string;
}

export default function PromptHistoryPanel({
  mode,
  onUsePrompt,
  refreshKey = 0,
  className,
}: PromptHistoryPanelProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"current" | "all" | "favorites">("current");
  const [items, setItems] = useState<PromptHistoryEntry[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await fetchPromptHistory({
      search: search || undefined,
      mode: scope === "current" ? mode : undefined,
      favoritesOnly: scope === "favorites",
      limit: 50,
    });
    setItems(rows);
    setLoading(false);
  }, [search, scope, mode]);

  // Debounced reload when filters/refresh change while open.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { void load(); }, 200);
    return () => clearTimeout(t);
  }, [open, load, refreshKey]);

  const handleUse = (entry: PromptHistoryEntry) => {
    onUsePrompt(entry.prompt);
    toast({ title: "Prompt loaded", description: "Filled the prompt input." });
  };

  const handleCopy = async (entry: PromptHistoryEntry) => {
    try {
      await navigator.clipboard.writeText(entry.prompt);
      toast({ title: "Copied", description: "Prompt copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleFavorite = async (entry: PromptHistoryEntry) => {
    const next = !entry.is_favorite;
    setItems((prev) =>
      prev.map((p) => (p.id === entry.id ? { ...p, is_favorite: next } : p)),
    );
    try {
      await togglePromptHistoryFavorite(entry.id, next);
    } catch {
      // revert
      setItems((prev) =>
        prev.map((p) => (p.id === entry.id ? { ...p, is_favorite: !next } : p)),
      );
    }
  };

  const handleDelete = async (entry: PromptHistoryEntry) => {
    if (!confirm("Delete this prompt from history?")) return;
    setItems((prev) => prev.filter((p) => p.id !== entry.id));
    try {
      await deletePromptHistory(entry.id);
    } catch {
      void load();
    }
  };

  return (
    <div className={cn("border border-border rounded-sm bg-card/40", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors"
      >
        <span className="flex items-center gap-2 font-display text-xs uppercase tracking-wide text-muted-foreground">
          <History className="h-3.5 w-3.5" />
          Prompt History
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="border-t border-border p-3 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search prompts…"
                className="h-8 pl-7 text-xs font-display"
              />
            </div>
            <div className="flex items-center gap-0.5 border border-border rounded-sm p-0.5">
              {(["current", "all", "favorites"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={cn(
                    "font-display text-[11px] px-2 py-1 rounded-sm transition-colors capitalize",
                    scope === s
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s === "current" ? "This style" : s}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <p className="font-display text-xs text-muted-foreground text-center py-6">
                {search || scope !== "current"
                  ? "No matching prompts."
                  : "No saved prompts yet. Generate something to start your library."}
              </p>
            ) : (
              items.map((entry) => (
                <div
                  key={entry.id}
                  className="border border-border rounded-sm p-2 hover:bg-muted/20 transition-colors"
                >
                  <p className="font-display text-xs text-foreground line-clamp-2 mb-1.5">
                    {entry.prompt}
                  </p>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="font-display text-[10px] px-1.5 py-0">
                        {entry.mode}
                      </Badge>
                      {entry.usage_count > 1 && (
                        <span className="font-display text-[10px] text-muted-foreground">
                          ×{entry.usage_count}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 px-2 font-display text-[11px]"
                        onClick={() => handleUse(entry)}
                      >
                        Use
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => handleCopy(entry)}
                        title="Copy prompt"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => handleFavorite(entry)}
                        title={entry.is_favorite ? "Unfavorite" : "Favorite"}
                      >
                        <Star
                          className={cn(
                            "h-3 w-3",
                            entry.is_favorite && "fill-primary text-primary",
                          )}
                        />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(entry)}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
