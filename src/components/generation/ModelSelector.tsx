/**
 * ModelSelector — Phase 3 UI for the provider/model registry.
 *
 * Compact, non-technical popover that lets the user choose:
 *   - a concrete model (or Auto / recommended)
 *   - a quality profile (balanced / strict / very strict)
 *   - a generation strategy (artistic / photoreal / poster / interior / graphic)
 *
 * IMPORTANT — UI/request plumbing only:
 *   The selected `modelId`, `qualityProfile`, and `generationStrategy` are
 *   passed through on the normalized generation request, but the router
 *   does NOT yet dispatch by `modelId` — existing `providerPreference`
 *   behavior is preserved. This component is the foundation that Phase 4
 *   will wire into actual routing.
 */
import { useMemo, useState } from "react";
import { Check, Cpu, Sliders } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  PROVIDER_MODEL_REGISTRY,
  listEnabledModels,
  type GenerationStrategy,
  type ProviderModelEntry,
  type QualityProfile,
} from "@/lib/generation-providers/registry";

export interface ModelSelectorValue {
  /** Registry entry id, or null = Auto / recommended. */
  modelId: string | null;
  qualityProfile: QualityProfile;
  generationStrategy: GenerationStrategy | null;
}

interface ModelSelectorProps {
  value: ModelSelectorValue;
  onChange: (v: ModelSelectorValue) => void;
}

const QUALITY_OPTIONS: { id: QualityProfile; label: string; hint: string }[] = [
  { id: "balanced", label: "Balanced", hint: "Default — best speed/quality mix." },
  { id: "strict", label: "Strict", hint: "Tighter style adherence." },
  { id: "very_strict", label: "Very strict", hint: "Maximum style anchoring." },
];

const STRATEGY_OPTIONS: { id: GenerationStrategy; label: string; hint: string }[] = [
  { id: "artistic", label: "Artistic", hint: "Illustrative, painterly." },
  { id: "photoreal", label: "Photoreal", hint: "Realistic photography." },
  { id: "poster", label: "Poster", hint: "Layout-friendly, clean type." },
  { id: "interior", label: "Interior", hint: "Architecture / spaces." },
  { id: "graphic", label: "Graphic", hint: "Bold flat graphic art." },
];

export default function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const enabled = useMemo(() => listEnabledModels(), []);
  const upcoming = useMemo(
    () => PROVIDER_MODEL_REGISTRY.filter((m) => !m.enabled),
    [],
  );

  const selected: ProviderModelEntry | null = value.modelId
    ? enabled.find((m) => m.id === value.modelId) ?? null
    : null;

  const compactLabel = selected ? selected.shortLabel : "Auto";

  const setModel = (id: string | null) =>
    onChange({ ...value, modelId: id });
  const setQuality = (q: QualityProfile) =>
    onChange({ ...value, qualityProfile: q });
  const setStrategy = (s: GenerationStrategy | null) =>
    onChange({ ...value, generationStrategy: s });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border text-xs font-display transition-colors",
            "border-border bg-secondary text-secondary-foreground hover:bg-muted",
          )}
          title="Model & quality"
        >
          <Sliders className="h-3 w-3" />
          <span>Model: {compactLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3 space-y-3">
        <div>
          <p className="font-display text-xs font-bold text-foreground mb-1">
            Model
          </p>
          <p className="font-display text-[11px] text-muted-foreground leading-snug">
            Auto picks the best engine. Choose a specific model only if you
            want to pin it.
          </p>
        </div>

        <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
          <ModelRow
            label="Auto (recommended)"
            description="Let the app pick the best model for the style."
            active={!value.modelId}
            onSelect={() => setModel(null)}
          />
          {enabled.map((m) => (
            <ModelRow
              key={m.id}
              label={m.displayName}
              description={m.qualityNotes}
              tag={m.category}
              active={value.modelId === m.id}
              onSelect={() => setModel(m.id)}
            />
          ))}
          {upcoming.map((m) => (
            <ModelRow
              key={m.id}
              label={m.displayName}
              description={m.qualityNotes}
              tag="Coming soon"
              disabled
              active={false}
              onSelect={() => {}}
            />
          ))}
        </div>

        <div className="border-t border-border pt-2 space-y-1.5">
          <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">
            Quality profile
          </p>
          <div className="flex flex-wrap gap-1">
            {QUALITY_OPTIONS.map((q) => (
              <Chip
                key={q.id}
                label={q.label}
                title={q.hint}
                active={value.qualityProfile === q.id}
                onClick={() => setQuality(q.id)}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-2 space-y-1.5">
          <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground">
            Strategy
          </p>
          <div className="flex flex-wrap gap-1">
            <Chip
              label="Auto"
              title="Infer strategy from the style."
              active={value.generationStrategy === null}
              onClick={() => setStrategy(null)}
            />
            {STRATEGY_OPTIONS.map((s) => (
              <Chip
                key={s.id}
                label={s.label}
                title={s.hint}
                active={value.generationStrategy === s.id}
                onClick={() => setStrategy(s.id)}
              />
            ))}
          </div>
        </div>

        <p className="font-display text-[10px] text-muted-foreground leading-snug border-t border-border pt-2">
          <Cpu className="h-3 w-3 inline mr-1" />
          Model pinning is request plumbing only — Auto routing still drives
          which engine actually runs.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function ModelRow({
  label,
  description,
  tag,
  active,
  disabled,
  onSelect,
}: {
  label: string;
  description: string;
  tag?: string;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "w-full text-left px-2 py-1.5 rounded-sm border font-display transition-colors",
        active
          ? "bg-primary/10 border-primary/40 text-foreground"
          : "bg-card border-border hover:bg-muted text-foreground",
        disabled && "opacity-60 cursor-not-allowed hover:bg-card",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold">{label}</span>
        <span className="flex items-center gap-1">
          {tag && (
            <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded-sm bg-muted text-muted-foreground">
              {tag}
            </span>
          )}
          {active && <Check className="h-3 w-3 text-primary" />}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
        {description}
      </p>
    </button>
  );
}

function Chip({
  label,
  title,
  active,
  onClick,
}: {
  label: string;
  title?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "px-2 py-0.5 rounded-sm border text-[11px] font-display transition-colors",
        active
          ? "bg-primary/10 border-primary/40 text-foreground"
          : "bg-card border-border hover:bg-muted text-foreground",
      )}
    >
      {label}
    </button>
  );
}
