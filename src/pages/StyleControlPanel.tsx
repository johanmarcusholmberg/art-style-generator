/**
 * Personal Style Control Panel.
 *
 * Lets the user configure DEFAULT strictness per (art style × provider).
 * Reuses the existing strictness pipeline:
 *   - same `Strictness` type (balanced | strict | very_strict)
 *   - same `STRICTNESS_OPTIONS` constant
 *   - same `strictness` field on the generation request
 *   - same `defaultStrictnessFor()` fallback when no override is set
 *
 * Persistence lives in localStorage via `loadStrictnessDefaults` /
 * `saveStrictnessDefaults` so settings survive across sessions. No new
 * strictness values are introduced — only a richer default lookup.
 */

import { useMemo, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import StyleNav from "@/components/StyleNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  STRICTNESS_OPTIONS,
  defaultStrictnessFor,
  loadStrictnessDefaults,
  saveStrictnessDefaults,
  setStrictnessDefault,
  type Strictness,
  type ProviderId,
  type StrictnessDefaultsMap,
} from "@/lib/style-strictness";
import { GENERATOR_PROVIDERS } from "@/lib/generators";
import { cn } from "@/lib/utils";

const PROVIDERS: ProviderId[] = ["sdxl", "gemini", "openai"];

// Mirror of DEBUG_STYLE_KEYS in ProviderDebug.tsx — same set of art styles
// already understood by the prompt compiler / style-meta system.
const STYLE_KEYS: Array<{ id: string; label: string }> = [
  { id: "japanese", label: "🏯 Ukiyo-e" },
  { id: "freestyle", label: "🎨 Ukiyo-e Freestyle" },
  { id: "popart", label: "🎯 Pop Art" },
  { id: "popart-freestyle", label: "🎨 Pop Art Freestyle" },
  { id: "lineart", label: "✒️ Line Art" },
  { id: "lineart-freestyle", label: "🎨 Line Art Freestyle" },
  { id: "lineart-minimal", label: "〰️ Minimal Lines" },
  { id: "minimalism", label: "◻ Minimalism" },
  { id: "minimalism-freestyle", label: "🎨 Minimalism Freestyle" },
  { id: "graffiti", label: "🎨 Graffiti" },
  { id: "graffiti-freestyle", label: "🎨 Graffiti Freestyle" },
  { id: "botanical", label: "🌿 Botanical" },
  { id: "botanical-freestyle", label: "🎨 Botanical Freestyle" },
  { id: "urbannoir", label: "🖤 Urban Noir" },
  { id: "urbannoir-freestyle", label: "🎨 Urban Noir Freestyle" },
  { id: "screenprint", label: "🖨️ Screen Print" },
  { id: "screenprint-freestyle", label: "🎨 Screen Print Freestyle" },
  { id: "risograph", label: "📠 Risograph" },
  { id: "risograph-freestyle", label: "🎨 Risograph Freestyle" },
  { id: "retrocomic", label: "💥 Retro Comic" },
  { id: "retrocomic-freestyle", label: "🎨 Retro Comic Freestyle" },
  { id: "pulpmagazine", label: "📕 Pulp Magazine" },
  { id: "pulpmagazine-freestyle", label: "🎨 Pulp Magazine Freestyle" },
  { id: "tattooflash", label: "🔥 Tattoo Flash" },
  { id: "tattooflash-freestyle", label: "🎨 Tattoo Flash Freestyle" },
  { id: "brutalistposter", label: "⬛ Brutalist Poster" },
  { id: "brutalistposter-freestyle", label: "🎨 Brutalist Freestyle" },
  { id: "xeroxzine", label: "📋 Xerox Zine" },
  { id: "xeroxzine-freestyle", label: "🎨 Xerox Zine Freestyle" },
];

const AUTO = "__auto__" as const;

const STRICTNESS_BADGE_CLASS: Record<Strictness, string> = {
  balanced: "bg-muted text-muted-foreground border-border",
  strict: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  very_strict: "bg-destructive/10 text-destructive border-destructive/30",
};

export default function StyleControlPanel() {
  const { toast } = useToast();
  const [defaults, setDefaults] = useState<StrictnessDefaultsMap>(() =>
    loadStrictnessDefaults(),
  );

  const overrideCount = useMemo(
    () =>
      Object.values(defaults).reduce(
        (acc, perProvider) =>
          acc + (perProvider ? Object.keys(perProvider).length : 0),
        0,
      ),
    [defaults],
  );

  const handleChange = (
    styleKey: string,
    provider: ProviderId,
    value: string,
  ) => {
    if (value === AUTO) {
      setStrictnessDefault(styleKey, provider, undefined);
    } else {
      setStrictnessDefault(styleKey, provider, value as Strictness);
    }
    setDefaults(loadStrictnessDefaults());
  };

  const handleClearStyle = (styleKey: string) => {
    PROVIDERS.forEach((p) => setStrictnessDefault(styleKey, p, undefined));
    setDefaults(loadStrictnessDefaults());
  };

  const handleClearAll = () => {
    saveStrictnessDefaults({});
    setDefaults({});
    toast({
      title: "Defaults cleared",
      description: "All styles will fall back to provider defaults.",
    });
  };

  return (
    <div className="min-h-screen bg-background paper-texture">
      <StyleNav activePath="/style-control-panel" />

      <header className="pt-8 pb-6 text-center px-4">
        <p className="font-display text-primary text-xs tracking-[0.3em] uppercase mb-2">
          Personal · Strictness Defaults
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-2">
          Style Control Panel
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
          Set the default style strictness used by each generator for every art
          style. <span className="font-bold text-foreground">Auto</span> falls
          back to the existing per-provider default. No new strictness values
          are introduced — this only changes which existing default is picked.
        </p>
      </header>

      <main className="pb-20 px-4 max-w-5xl mx-auto space-y-4">
        <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-xs font-bold text-foreground">
              {overrideCount} override{overrideCount === 1 ? "" : "s"} active
            </p>
            <p className="font-display text-[11px] text-muted-foreground">
              Stored locally in your browser. Generation always uses these
              defaults unless ProviderDebug overrides them for testing.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            disabled={overrideCount === 0}
            className="font-display text-xs"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear all overrides
          </Button>
        </Card>

        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="text-left font-display text-[11px] uppercase tracking-wider text-muted-foreground px-3 py-2 sticky left-0 bg-muted/40 z-10">
                    Art style
                  </th>
                  {PROVIDERS.map((p) => {
                    const provider = GENERATOR_PROVIDERS[p];
                    return (
                      <th
                        key={p}
                        className="text-left font-display text-[11px] uppercase tracking-wider text-muted-foreground px-3 py-2 min-w-[180px]"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-foreground font-bold normal-case tracking-normal text-xs">
                            {provider.displayName}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-normal normal-case tracking-normal">
                            default: {defaultStrictnessFor(p)}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                  <th className="px-2 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {STYLE_KEYS.map((style) => {
                  const cell = defaults[style.id] ?? {};
                  const hasAny = PROVIDERS.some((p) => cell[p]);
                  return (
                    <tr
                      key={style.id}
                      className="border-b border-border last:border-0 hover:bg-muted/20"
                    >
                      <td className="px-3 py-2 sticky left-0 bg-background z-10">
                        <div className="flex flex-col">
                          <span className="font-display text-xs font-medium text-foreground">
                            {style.label}
                          </span>
                          <span className="font-display text-[10px] text-muted-foreground">
                            {style.id}
                          </span>
                        </div>
                      </td>
                      {PROVIDERS.map((p) => {
                        const current = cell[p];
                        const value = current ?? AUTO;
                        return (
                          <td key={p} className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Select
                                value={value}
                                onValueChange={(v) =>
                                  handleChange(style.id, p, v)
                                }
                              >
                                <SelectTrigger className="font-display text-xs h-8 w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem
                                    value={AUTO}
                                    className="font-display text-xs"
                                  >
                                    <span className="text-muted-foreground">
                                      Auto ({defaultStrictnessFor(p)})
                                    </span>
                                  </SelectItem>
                                  {STRICTNESS_OPTIONS.map((opt) => (
                                    <SelectItem
                                      key={opt.id}
                                      value={opt.id}
                                      className="font-display text-xs"
                                    >
                                      <div className="flex flex-col">
                                        <span>{opt.label}</span>
                                        <span className="text-[10px] text-muted-foreground">
                                          {opt.description}
                                        </span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {current && (
                                <span
                                  className={cn(
                                    "inline-flex items-center px-1.5 py-0.5 rounded-sm border text-[9px] font-display uppercase tracking-wider flex-shrink-0",
                                    STRICTNESS_BADGE_CLASS[current],
                                  )}
                                >
                                  set
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={!hasAny}
                          onClick={() => handleClearStyle(style.id)}
                          title="Reset this style to provider defaults"
                        >
                          <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4 bg-muted/30">
          <p className="font-display text-xs font-bold text-foreground mb-1">
            How this is applied
          </p>
          <ul className="font-display text-xs text-muted-foreground leading-relaxed space-y-1 list-disc list-inside">
            <li>
              Generators receive the strictness through the existing{" "}
              <code className="text-foreground">strictness</code> request field
              — no payload changes.
            </li>
            <li>
              When a style has no override for the chosen provider, the existing
              per-provider default applies (SDXL → strict, Gemini/OpenAI →
              balanced).
            </li>
            <li>
              The ProviderDebug page's manual strictness selector still wins
              when set — useful for one-off testing.
            </li>
          </ul>
        </Card>
      </main>
    </div>
  );
}
