import { useEffect, useState } from "react";
import { Cpu, Check, AlertCircle, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  GENERATOR_OPTIONS,
  GENERATOR_PROVIDERS,
  type GeneratorPreference,
  resolveGenerator,
  loadGeneratorPreference,
  saveGeneratorPreference,
} from "@/lib/generators";
import { supabase } from "@/integrations/supabase/client";

interface GeneratorBadgeProps {
  value: GeneratorPreference;
  onChange: (v: GeneratorPreference) => void;
  /** Provider that was actually used for the most recent generation, if any. */
  lastUsedProvider?: string | null;
  lastFallbackUsed?: boolean;
}

interface QuickHealth {
  providerId: "gemini" | "sdxl";
  status: string;
  message: string;
}

export default function GeneratorBadge({
  value,
  onChange,
  lastUsedProvider,
  lastFallbackUsed,
}: GeneratorBadgeProps) {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<QuickHealth[] | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  const resolved = resolveGenerator(value);
  const primaryLabel = resolved.primary.shortLabel;
  const compactLabel =
    value === "auto" ? `Auto · ${primaryLabel}` : primaryLabel;

  // Fetch quick health when the popover opens (not on mount — keeps it light).
  useEffect(() => {
    if (!open || health) return;
    setLoadingHealth(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("provider-health", {
          method: "GET",
        });
        if (error) throw error;
        setHealth(data?.providers || []);
      } catch (e) {
        console.warn("provider-health quick check failed", e);
        setHealth([]);
      } finally {
        setLoadingHealth(false);
      }
    })();
  }, [open, health]);

  const handleSelect = (id: GeneratorPreference) => {
    onChange(id);
    saveGeneratorPreference(id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border text-xs font-display transition-colors",
            "border-border bg-secondary text-secondary-foreground hover:bg-muted",
          )}
          title="Image generator"
        >
          <Cpu className="h-3 w-3" />
          <span>{compactLabel}</span>
          {lastFallbackUsed && (
            <AlertCircle className="h-3 w-3 text-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3 space-y-3">
        <div>
          <p className="font-display text-xs font-bold text-foreground mb-1">
            Image Generator
          </p>
          <p className="font-display text-[11px] text-muted-foreground leading-snug">
            Choose which engine creates the base image. Upscaling is configured
            separately below.
          </p>
        </div>

        <div className="space-y-1">
          {GENERATOR_OPTIONS.map((opt) => {
            const isActive = value === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => handleSelect(opt.id)}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded-sm border font-display transition-colors",
                  isActive
                    ? "bg-primary/10 border-primary/40 text-foreground"
                    : "bg-card border-border hover:bg-muted text-foreground",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">{opt.label}</span>
                  {isActive && <Check className="h-3 w-3 text-primary" />}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>

        <div className="border-t border-border pt-2 space-y-1.5">
          <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">
            Provider Status
          </p>
          {loadingHealth && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Checking…
            </div>
          )}
          {!loadingHealth &&
            health &&
            health.map((h) => {
              const ok = h.status === "ready";
              const provider = GENERATOR_PROVIDERS[h.providerId];
              return (
                <div
                  key={h.providerId}
                  className="flex items-center justify-between text-[11px] font-display"
                >
                  <span className="text-foreground">{provider.displayName}</span>
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded-sm text-[10px]",
                      ok
                        ? "bg-primary/10 text-primary"
                        : "bg-destructive/10 text-destructive",
                    )}
                    title={h.message}
                  >
                    {ok ? "Ready" : h.status}
                  </span>
                </div>
              );
            })}
          {!loadingHealth && health && health.length === 0 && (
            <p className="text-[10px] text-muted-foreground">
              Could not reach provider-health.
            </p>
          )}
        </div>

        {lastUsedProvider && (
          <div className="border-t border-border pt-2">
            <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
              Last Generation
            </p>
            <p className="font-display text-[11px] text-foreground">
              Used <span className="font-bold">{lastUsedProvider}</span>
              {lastFallbackUsed && (
                <span className="text-primary"> · fallback</span>
              )}
            </p>
          </div>
        )}

        <div className="border-t border-border pt-2 flex justify-end">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="font-display text-[11px] h-7"
          >
            <a href="/debug/providers">Open provider debug →</a>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { loadGeneratorPreference };
