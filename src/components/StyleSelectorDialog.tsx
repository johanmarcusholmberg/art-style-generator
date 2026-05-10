/**
 * Searchable, grouped style selector. Used by the selected-style card on
 * every generator page. Selecting a style navigates to that style's route —
 * the existing generator pages, prompt logic and routing remain unchanged.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  STYLE_CATALOG,
  STYLE_CATEGORIES,
  type StyleCatalogEntry,
} from "@/lib/style-catalog";

interface StyleSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeRoute: string;
}

const StyleSelectorDialog = ({ open, onOpenChange, activeRoute }: StyleSelectorDialogProps) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return STYLE_CATALOG;
    return STYLE_CATALOG.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.bestFor ?? "").toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, StyleCatalogEntry[]>();
    for (const s of filtered) {
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    }
    return map;
  }, [filtered]);

  const handleSelect = (route: string) => {
    onOpenChange(false);
    if (route !== activeRoute) navigate(route);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="font-display text-xl">Choose a style</DialogTitle>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search styles by name, mood or category…"
              className="pl-9 h-10"
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {STYLE_CATEGORIES.map((category) => {
            const items = grouped.get(category);
            if (!items || items.length === 0) return null;
            return (
              <div key={category} className="mb-6 last:mb-0">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                  {category}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {items.map((s) => {
                    const isActive = s.route === activeRoute;
                    return (
                      <button
                        key={s.route}
                        type="button"
                        onClick={() => handleSelect(s.route)}
                        className={cn(
                          "group text-left rounded-lg border p-3 transition-all",
                          "hover:border-primary/60 hover:bg-muted/50",
                          isActive
                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                            : "border-border",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="text-2xl leading-none mt-0.5" aria-hidden>
                            {s.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-display text-sm font-semibold text-foreground truncate">
                                {s.name}
                              </span>
                              {isActive && (
                                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {s.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No styles match "{query}".
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StyleSelectorDialog;
