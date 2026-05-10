/**
 * Prominent "currently selected style" card rendered at the top of every
 * generator page. Shows the active style and opens the style selector.
 */
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import StyleSelectorDialog from "./StyleSelectorDialog";
import { getStyleByRoute } from "@/lib/style-catalog";

interface SelectedStyleCardProps {
  activePath: string;
}

const SelectedStyleCard = ({ activePath }: SelectedStyleCardProps) => {
  const [open, setOpen] = useState(false);
  const style = getStyleByRoute(activePath);
  if (!style) return null;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 mt-6">
      <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4 sm:p-5 flex items-start sm:items-center gap-4 flex-col sm:flex-row">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div
            className="h-12 w-12 sm:h-14 sm:w-14 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-3xl sm:text-4xl shrink-0"
            aria-hidden
          >
            {style.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Current style
            </div>
            <div className="font-display text-xl sm:text-2xl font-bold text-foreground leading-tight mt-0.5">
              {style.name}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
              {style.description}
              {style.bestFor ? <> <span className="text-foreground/70">{style.bestFor}</span></> : null}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-1.5 shrink-0 self-stretch sm:self-auto"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Change style
        </Button>
      </div>
      <StyleSelectorDialog open={open} onOpenChange={setOpen} activeRoute={activePath} />
    </div>
  );
};

export default SelectedStyleCard;
