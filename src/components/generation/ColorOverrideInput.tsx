import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const PRESETS = [
  "deep teal and burnt orange",
  "muted sage green and cream",
  "navy blue and gold",
  "dusty pink and terracotta",
  "black and white only",
  "warm earth tones",
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

export default function ColorOverrideInput({ value, onChange, disabled }: Props) {
  return (
    <div className="rounded-sm border border-border bg-card/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label htmlFor="color-override" className="font-display text-[11px] uppercase tracking-wider text-muted-foreground">
          Colors (optional)
        </Label>
        <span className="font-display text-[10px] text-muted-foreground">
          Leave empty to use the style's own colors.
        </span>
      </div>
      <div className="relative">
        <Input
          id="color-override"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="e.g. deep teal and burnt orange"
          className="font-display text-sm pr-8"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => onChange(p)}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-sm font-display transition-colors",
              value === p ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted",
            )}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
